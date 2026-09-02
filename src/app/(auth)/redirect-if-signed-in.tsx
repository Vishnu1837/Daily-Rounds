import 'server-only';

import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/session';
import { homeForRole } from '@/lib/routes';

/**
 * Sends someone who is already signed in on to their own home.
 *
 * Rendered inside a Suspense boundary so the sign-in form itself stays static and
 * prerendered — this is the app's front door, and it should paint from the CDN rather than
 * wait on a session lookup that comes back empty for almost everyone who sees it.
 *
 * The redirect therefore arrives a beat after the form does. That is the right way round:
 * the visitor who needs the form gets it immediately, and the rarer already-signed-in
 * visitor is moved along a moment later.
 */
export async function RedirectIfSignedIn() {
  const user = await getCurrentUser();
  if (user) redirect(homeForRole(user.role));
  return null;
}
