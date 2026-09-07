import 'server-only';

import { redirect } from 'next/navigation';

import { readViewAsTarget } from './impersonation';
import { type SessionUser, getCurrentUser } from './session';
import { STUDENT_HOME } from '@/lib/routes';

/**
 * Swaps in the student an admin is "viewing as", if there is one.
 *
 * Only an admin can trigger the swap: the view-as cookie is inert for anyone else, so a
 * student cannot set it by hand and become someone else. The admin *page* guards
 * (`requireAdmin`, `requireAdminAction`) deliberately never call this — the console must
 * keep working, as the real admin, while a view-as session is open.
 */
async function resolveEffectiveUser(realUser: SessionUser): Promise<SessionUser> {
  if (realUser.role !== 'admin') return realUser;
  const target = await readViewAsTarget();
  return target ?? realUser;
}

/** Thrown by action-layer guards. Server actions convert this into a typed error result. */
export class AuthorizationError extends Error {
  constructor(message = 'You are not allowed to do that.') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/** For pages: redirects to the login screen when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return resolveEffectiveUser(user);
}

/** For pages: additionally forces onboarding to be finished first. */
export async function requireOnboardedUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.onboardingCompletedAt && user.role !== 'admin') redirect('/onboarding');
  return user;
}

/**
 * For pages: admin-only. Students are sent back to their dashboard, never shown the UI.
 *
 * Reads the *real* session, not the effective one — an admin with a "view as student"
 * session open must still be able to reach the console (and the control that ends the
 * session lives there).
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect(STUDENT_HOME);
  return user;
}

/** For server actions: throws instead of redirecting so the caller can return an error. */
export async function requireUserAction(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError('Your session has expired. Please sign in again.');
  return resolveEffectiveUser(user);
}

/**
 * For admin server actions. Reads the *real* session — see `requireAdmin` — so the actions
 * that manage a "view as student" session (start it, end it) still run for the admin who
 * opened it.
 */
export async function requireAdminAction(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError('Your session has expired. Please sign in again.');
  if (user.role !== 'admin') throw new AuthorizationError('Administrator access is required.');
  return user;
}
