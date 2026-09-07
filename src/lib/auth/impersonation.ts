import 'server-only';

import { cookies } from 'next/headers';
import { cache } from 'react';

import { type SessionUser, getCurrentUser, getSessionUserById } from './session';

/**
 * The "view as student" cookie.
 *
 * It holds a target user id, and it only ever *does* anything when the real session behind
 * the request belongs to an admin — see `readViewAsTarget`. A student who sets this cookie
 * by hand gets nothing: the guard checks the real role first. That is the whole security
 * model, so it is stated in one place.
 */
export const VIEW_AS_COOKIE = 'dr_view_as';

/** Twelve hours. Long enough for a working session in a student's shoes, not indefinite. */
const VIEW_AS_TTL_SECONDS = 12 * 60 * 60;

export function viewAsCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/' as const,
    maxAge: VIEW_AS_TTL_SECONDS,
  };
}

/** The target user id currently in the cookie, or null. */
export async function getViewAsTargetId(): Promise<string | null> {
  const store = await cookies();
  return store.get(VIEW_AS_COOKIE)?.value ?? null;
}

/**
 * The student an admin is currently viewing as, as a `SessionUser`, or null.
 *
 * Callers must have already established that the *real* session user is an admin — this
 * function does not re-check, because the guard that calls it (`@/lib/auth/guards`) has the
 * real user in hand and the admin page guards deliberately never call it at all.
 *
 * A cookie that points at a missing user, or at anyone who is not a student, is treated as
 * absent rather than as an error: it is stale, and the admin simply stays themselves.
 */
export const readViewAsTarget = cache(async (): Promise<SessionUser | null> => {
  const targetId = await getViewAsTargetId();
  if (!targetId) return null;

  const target = await getSessionUserById(targetId);
  if (!target || target.role !== 'student') return null;

  return target;
});

/**
 * Banner data for the student shell: who is being viewed, and which admin is doing it.
 * Null whenever no view-as session is active for a real admin.
 */
export const getViewingAs = cache(
  async (): Promise<{ adminName: string; studentName: string; studentId: string } | null> => {
    const realUser = await getCurrentUser();
    if (!realUser || realUser.role !== 'admin') return null;

    const target = await readViewAsTarget();
    if (!target) return null;

    return { adminName: realUser.fullName, studentName: target.fullName, studentId: target.id };
  },
);
