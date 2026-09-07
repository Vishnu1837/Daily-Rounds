'use server';

import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { db } from '@/db/client';
import { users } from '@/db/schema';
import { requireAdminAction } from '@/lib/auth/guards';
import { VIEW_AS_COOKIE, viewAsCookieOptions } from '@/lib/auth/impersonation';
import { STUDENT_HOME } from '@/lib/routes';

import { type Result, fail, guarded, recordAudit } from './shared';

/**
 * Start viewing the student app as `targetUserId`, with no credentials.
 *
 * Admin-only, and the target must be a student — an admin cannot step into another admin's
 * account this way. On success it drops the `dr_view_as` cookie and sends the caller to the
 * student dashboard; every student page and student action then resolves to the target
 * until `stopStudentViewAction` clears it. See `@/lib/auth/impersonation`.
 */
export async function startStudentViewAction(targetUserId: string): Promise<Result> {
  const result = await guarded<undefined>(async () => {
    const admin = await requireAdminAction();

    const rows = await db
      .select({ id: users.id, role: users.role, fullName: users.fullName })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    const target = rows[0];
    if (!target) return fail('That student no longer exists.');
    if (target.role !== 'student') return fail('You can only view the app as a student.');

    const store = await cookies();
    store.set(VIEW_AS_COOKIE, target.id, viewAsCookieOptions());

    await recordAudit({
      actorUserId: admin.id,
      action: 'student.view.start',
      entity: 'user',
      entityId: target.id,
    });

    redirect(STUDENT_HOME);
  }, 'Could not open the student view. Please try again.');

  return result;
}

/** End a "view as student" session and return to the admin console. */
export async function stopStudentViewAction(): Promise<Result> {
  const result = await guarded<undefined>(async () => {
    const admin = await requireAdminAction();

    const store = await cookies();
    const wasViewing = store.get(VIEW_AS_COOKIE)?.value ?? null;
    store.delete(VIEW_AS_COOKIE);

    if (wasViewing) {
      await recordAudit({
        actorUserId: admin.id,
        action: 'student.view.stop',
        entity: 'user',
        entityId: wasViewing,
      });
    }

    redirect('/admin/students');
  }, 'Could not exit the student view.');

  return result;
}
