import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { db } from '@/db/client';
import { users } from '@/db/schema';
import { redeemDeviceLink } from '@/lib/auth/device-link';
import { issueSession } from '@/lib/auth/session';
import { homeForRole } from '@/lib/routes';
import { eq } from 'drizzle-orm';

/**
 * The other end of the QR: the phone that scanned it lands here and is signed in.
 *
 * Public on purpose — the device arriving has no session, which is the entire reason it came
 * — and outside `proxy.ts`'s matcher for the same reason. The code in the path is the only
 * credential involved, and `redeemDeviceLink` spends it in one atomic UPDATE, so a scan that
 * arrives second is refused rather than served a second session.
 *
 * A GET that signs you in is not something to do lightly. It is done here because it is what
 * makes the feature the feature: the camera opens a URL, and a student who had to then find
 * and press a button on a phone might as well have typed their password. Two things keep it
 * honest. The code is single-use and two minutes old at most, so a link preview fetcher that
 * happens to consume one costs the student a tap on "show a new code" and nothing else. And
 * the code never travels through anything that has previews — it is drawn on a screen and
 * read by a lens, and if it ever starts being emailed or messaged instead, this handler must
 * grow a confirmation step first.
 *
 * Nothing about the outcome is special. It is an ordinary session row with the ordinary
 * lifetime, sitting alongside whatever session the laptop still holds; neither displaces the
 * other, which is the point of the whole exercise.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;

  const redeemed = await redeemDeviceLink(token, request.headers.get('user-agent'));

  if (!redeemed.ok) {
    // Back to the login form with something true to read. The reasons are distinct because
    // "you already used this" and "this ran out" call for different next steps, and neither
    // tells the reader anything they could not have discovered by trying.
    const login = new URL('/login', request.url);
    login.searchParams.set('link', redeemed.reason);
    return NextResponse.redirect(login);
  }

  const [user] = await db
    .select({ role: users.role, onboardingCompletedAt: users.onboardingCompletedAt })
    .from(users)
    .where(eq(users.id, redeemed.userId))
    .limit(1);

  // The code outlived its account — deleted between minting and scanning. Vanishingly rare,
  // and there is nothing to sign in to.
  if (!user) {
    const login = new URL('/login', request.url);
    login.searchParams.set('link', 'unknown');
    return NextResponse.redirect(login);
  }

  const cookie = await issueSession(redeemed.userId);

  // A student paired mid-onboarding should carry on where they left off rather than be
  // dropped on a dashboard that has nothing in it yet.
  const destination =
    !user.onboardingCompletedAt && user.role !== 'admin' ? '/onboarding' : homeForRole(user.role);

  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
