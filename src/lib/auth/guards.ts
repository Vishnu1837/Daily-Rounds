import 'server-only';

import { redirect } from 'next/navigation';

import { type SessionUser, getCurrentUser } from './session';
import { STUDENT_HOME } from '@/lib/routes';

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
  return user;
}

/** For pages: additionally forces onboarding to be finished first. */
export async function requireOnboardedUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.onboardingCompletedAt && user.role !== 'admin') redirect('/onboarding');
  return user;
}

/** For pages: admin-only. Students are sent back to their dashboard, never shown the UI. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'admin') redirect(STUDENT_HOME);
  return user;
}

/** For server actions: throws instead of redirecting so the caller can return an error. */
export async function requireUserAction(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError('Your session has expired. Please sign in again.');
  return user;
}

export async function requireAdminAction(): Promise<SessionUser> {
  const user = await requireUserAction();
  if (user.role !== 'admin') throw new AuthorizationError('Administrator access is required.');
  return user;
}
