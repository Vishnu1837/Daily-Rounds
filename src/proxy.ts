import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { SESSION_COOKIE } from '@/lib/auth/session';

/**
 * Turns signed-out visitors away before a render starts.
 *
 * Every screen behind the shell verifies the session properly against the database — this
 * is not the authorisation check and must never be mistaken for one. It exists because the
 * pages are now prerendered: their static frame contains no personal data, but a visitor
 * with no session at all would still watch the nav and rail paint before the real guard
 * inside got far enough to redirect them. Checking for the cookie costs nothing and spares
 * them the flash of an app they are not signed in to.
 *
 * Deliberately one-directional. Sending a visitor who *has* a cookie onward to the
 * dashboard would look symmetrical and would be a bug: an expired cookie is still a cookie,
 * so `/login -> /today -> (real guard rejects) -> /login` becomes an infinite redirect. Only
 * the database can tell a live session from a dead one, so only the pages decide that.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const login = new URL('/login', request.url);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    '/today/:path*',
    '/roadmap/:path*',
    '/check-in/:path*',
    '/progress/:path*',
    '/leaderboard/:path*',
    '/grove/:path*',
    '/calendar/:path*',
    '/syllabus/:path*',
    '/materials/:path*',
    '/profile/:path*',
    '/study/:path*',
    '/quiz/:path*',
    '/assessments/:path*',
    '/report/:path*',
    '/how-points-work/:path*',
    '/onboarding/:path*',
    '/no-cohort/:path*',
    '/admin/:path*',
  ],
};
