import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asc, eq } from 'drizzle-orm';

import type { SessionUser } from '@/lib/auth/session';

import { db, migrateTestDb, schema } from './helpers/db';

/**
 * The public waitlist form, against a real database.
 *
 * The rule under test is that one person produces one row. It is half application logic and
 * half a pair of unique indexes, so mocking either half would test nothing.
 */

const state: { user: SessionUser | null } = { user: null };

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: async () => state.user,
  SESSION_COOKIE: 'dr_session',
}));

/*
 * The cache primitives are no-ops here. `cacheTag` and `cacheLife` only annotate an entry,
 * and `updateTag` clears one — outside a Next server there is nothing cached to annotate or
 * clear, and the behaviour under test is the database write, not the bookkeeping around it.
 */
vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
  cacheTag: () => {},
  cacheLife: () => {},
}));

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const entries = () =>
  db.select().from(schema.waitlistEntries).orderBy(asc(schema.waitlistEntries.createdAt));

beforeEach(async () => {
  await migrateTestDb();
  await db.delete(schema.waitlistEntries);
  state.user = null;
});

describe('joinWaitlistAction', () => {
  it('stores the submission with the time it arrived', async () => {
    const { joinWaitlistAction } = await import('@/server/actions/waitlist');

    const result = await joinWaitlistAction(
      null,
      form({
        fullName: 'Anjali Rao',
        whatsapp: '+91 90000 11111',
        email: 'anjali@example.edu',
        mbbsYear: '2',
        university: 'Grant Medical College',
        challenge: 'Backlogs',
      }),
    );

    expect(result.ok).toBe(true);

    const [row] = await entries();
    expect(row).toMatchObject({
      fullName: 'Anjali Rao',
      whatsapp: '+91 90000 11111',
      email: 'anjali@example.edu',
      mbbsYear: 2,
      university: 'Grant Medical College',
      status: 'new',
    });
    expect(row!.createdAt).toBeInstanceOf(Date);
  });

  it('rejects a submission that is missing what we need to reach someone', async () => {
    const { joinWaitlistAction } = await import('@/server/actions/waitlist');

    const result = await joinWaitlistAction(null, form({ fullName: 'A', whatsapp: '' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toHaveProperty('whatsapp');
    expect(await entries()).toHaveLength(0);
  });

  it('updates the existing entry when the same number comes back', async () => {
    const { joinWaitlistAction } = await import('@/server/actions/waitlist');

    await joinWaitlistAction(null, form({ fullName: 'Anjali Rao', whatsapp: '+91 90000 11111' }));
    await joinWaitlistAction(
      null,
      form({ fullName: 'Anjali R Rao', whatsapp: '+91 90000 11111', university: 'Grant' }),
    );

    const rows = await entries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fullName: 'Anjali R Rao', university: 'Grant' });
  });

  it('updates the existing entry when the same email comes back on a new number', async () => {
    const { joinWaitlistAction } = await import('@/server/actions/waitlist');

    await joinWaitlistAction(
      null,
      form({ fullName: 'Anjali Rao', whatsapp: '+91 90000 11111', email: 'anjali@example.edu' }),
    );
    await joinWaitlistAction(
      null,
      // A different number, and the address typed with different capitals.
      form({ fullName: 'Anjali Rao', whatsapp: '+91 90000 22222', email: 'Anjali@Example.EDU' }),
    );

    const rows = await entries();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.whatsapp).toBe('+91 90000 22222');
  });

  it('keeps an admin’s triage when the details are corrected', async () => {
    const { joinWaitlistAction } = await import('@/server/actions/waitlist');

    await joinWaitlistAction(null, form({ fullName: 'Anjali Rao', whatsapp: '+91 90000 11111' }));
    await db.update(schema.waitlistEntries).set({ status: 'contacted', note: 'Called Tuesday' });

    await joinWaitlistAction(
      null,
      form({ fullName: 'Anjali Rao', whatsapp: '+91 90000 11111', university: 'Grant' }),
    );

    const [row] = await entries();
    expect(row).toMatchObject({ status: 'contacted', note: 'Called Tuesday', university: 'Grant' });
  });

  it('lets two different people both leave the email blank', async () => {
    const { joinWaitlistAction } = await import('@/server/actions/waitlist');

    await joinWaitlistAction(null, form({ fullName: 'Anjali', whatsapp: '+91 90000 11111' }));
    await joinWaitlistAction(null, form({ fullName: 'Imran', whatsapp: '+91 90000 22222' }));

    expect(await entries()).toHaveLength(2);
  });
});

describe('the admin side of the waitlist', () => {
  it('refuses every management action to a student', async () => {
    const {
      joinWaitlistAction,
      deleteWaitlistEntryAction,
      exportWaitlistCsvAction,
      setWaitlistStatusAction,
    } = await import('@/server/actions/waitlist');

    await joinWaitlistAction(null, form({ fullName: 'Anjali', whatsapp: '+91 90000 11111' }));
    const [row] = await entries();

    state.user = {
      id: 'user-student',
      email: 'student@test.local',
      fullName: 'Student',
      role: 'student',
      timezone: 'Asia/Kolkata',
      avatarSeed: 'test',
      avatarUrl: null,
      mbbsYear: null,
      university: null,
      whatsapp: null,
      onboardingCompletedAt: new Date('2025-08-01T00:00:00Z'),
    };

    for (const result of [
      await setWaitlistStatusAction(row!.id, 'enrolled'),
      await deleteWaitlistEntryAction(row!.id),
      await exportWaitlistCsvAction(),
    ]) {
      expect(result.ok).toBe(false);
    }

    // Nothing was read out and nothing was changed.
    const [after] = await entries();
    expect(after).toMatchObject({ id: row!.id, status: 'new' });
  });
});

describe('getWaitlistCounts', () => {
  it('counts nothing when nobody has signed up', async () => {
    const { getWaitlistCounts } = await import('@/server/queries/waitlist');
    expect(await getWaitlistCounts()).toEqual({ total: 0, new: 0 });
  });

  it('separates the untouched enquiries from the ones already triaged', async () => {
    const { joinWaitlistAction } = await import('@/server/actions/waitlist');
    const { getWaitlistCounts } = await import('@/server/queries/waitlist');

    await joinWaitlistAction(null, form({ fullName: 'Anjali', whatsapp: '+91 90000 11111' }));
    await joinWaitlistAction(null, form({ fullName: 'Imran', whatsapp: '+91 90000 22222' }));
    await joinWaitlistAction(null, form({ fullName: 'Meera', whatsapp: '+91 90000 33333' }));

    expect(await getWaitlistCounts()).toEqual({ total: 3, new: 3 });

    const [first] = await entries();
    await db
      .update(schema.waitlistEntries)
      .set({ status: 'contacted' })
      .where(eq(schema.waitlistEntries.id, first!.id));

    // The dashboard's "N new of M" reads off this: the total does not shrink when someone
    // is contacted, only the count of people still waiting to hear from anyone.
    expect(await getWaitlistCounts()).toEqual({ total: 3, new: 2 });
  });
});
