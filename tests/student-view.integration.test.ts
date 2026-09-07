import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Admin "view as student", against a real database.
 *
 * The guarantee under test: an admin can step into a student's session with no credentials,
 * the effective identity the app guards hand back really does become that student, and none
 * of it works for a non-admin or against a non-student target.
 */

/** A mutable in-memory cookie jar shared by the action and the guard. */
const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

/** The real signed-in user. `redirect` is a Next control-flow throw. */
const session: { user: unknown } = { user: null };
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT`), { digest: `NEXT_REDIRECT;replace;${to};` });
  },
}));

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  // Only the session lookup is faked; `getSessionUserById` stays real and hits the test DB.
  return { ...actual, getCurrentUser: async () => session.user };
});

import { requireUser } from '@/lib/auth/guards';
import { VIEW_AS_COOKIE } from '@/lib/auth/impersonation';
import { startStudentViewAction, stopStudentViewAction } from '@/server/actions/student-view';

import { createTestCohort, createTestMember, migrateTestDb } from './helpers/db';

beforeEach(async () => {
  await migrateTestDb();
  jar.clear();
  session.user = null;
});

async function setup() {
  const { cohort } = await createTestCohort();
  const student = await createTestMember(cohort.id, { role: 'student' });
  const otherAdmin = await createTestMember(cohort.id, { role: 'admin' });
  const admin = await createTestMember(cohort.id, { role: 'admin' });
  return { student, admin, otherAdmin };
}

describe('startStudentViewAction', () => {
  it('lets an admin open the student view and become that student', async () => {
    const { student, admin } = await setup();
    session.user = { id: admin.user.id, role: 'admin' };

    await expect(startStudentViewAction(student.user.id)).rejects.toMatchObject({
      digest: expect.stringContaining('/today'),
    });
    expect(jar.get(VIEW_AS_COOKIE)).toBe(student.user.id);

    const effective = await requireUser();
    expect(effective.id).toBe(student.user.id);
    expect(effective.role).toBe('student');
  });

  it('refuses a non-admin caller', async () => {
    const { student } = await setup();
    session.user = { id: student.user.id, role: 'student' };

    const result = await startStudentViewAction(student.user.id);
    expect(result.ok).toBe(false);
    expect(jar.has(VIEW_AS_COOKIE)).toBe(false);
  });

  it('refuses to view the app as another admin', async () => {
    const { admin, otherAdmin } = await setup();
    session.user = { id: admin.user.id, role: 'admin' };

    const result = await startStudentViewAction(otherAdmin.user.id);
    expect(result.ok).toBe(false);
    expect(jar.has(VIEW_AS_COOKIE)).toBe(false);
  });
});

describe('stopStudentViewAction', () => {
  it('clears the cookie and restores the admin', async () => {
    const { student, admin } = await setup();
    session.user = { id: admin.user.id, role: 'admin' };
    jar.set(VIEW_AS_COOKIE, student.user.id);

    await expect(stopStudentViewAction()).rejects.toMatchObject({
      digest: expect.stringContaining('/admin/students'),
    });
    expect(jar.has(VIEW_AS_COOKIE)).toBe(false);

    session.user = { id: admin.user.id, role: 'admin' };
    const effective = await requireUser();
    expect(effective.id).toBe(admin.user.id);
  });
});
