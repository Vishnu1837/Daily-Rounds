import 'server-only';

import { createHash } from 'node:crypto';

import { and, eq, gt, lt } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { cache } from 'react';

import { db } from '@/db/client';
import { authSessions, users } from '@/db/schema';

import { generateToken } from './password';

export const SESSION_COOKIE = 'dr_session';
const SESSION_TTL_DAYS = 30;

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: 'student' | 'admin';
  timezone: string;
  avatarSeed: string;
  /** An uploaded profile picture as a data URL, or null for the generated monogram. */
  avatarUrl: string | null;
  mbbsYear: number | null;
  university: string | null;
  whatsapp: string | null;
  onboardingCompletedAt: Date | null;
};

/** A session cookie, ready to be written to whichever response is about to be sent. */
export type SessionCookie = {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    sameSite: 'lax';
    secure: boolean;
    path: '/';
    expires: Date;
  };
};

/**
 * Mints a session and hands back the cookie that carries it, without writing anything.
 *
 * Sessions are deliberately not exclusive. Nothing here touches the user's other rows, so a
 * student signed in on a laptop stays signed in on it when they sign in on a phone, and
 * signing out of one leaves the other alone — see `destroySession`, which deletes exactly
 * the token it was given. That is what makes the QR device-link flow possible at all, and
 * it is the reason this function only ever inserts.
 *
 * Separate from `createSession` because a route handler returning a `NextResponse` wants to
 * put the cookie on that response itself rather than rely on the request-scoped cookie store
 * being merged into a redirect it constructed by hand.
 */
export async function issueSession(userId: string): Promise<SessionCookie> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  await db.insert(authSessions).values({ userId, tokenHash: hashSessionToken(token), expiresAt });

  // Opportunistic cleanup of this user's expired sessions. Expired ones only: a live session
  // on another device is not this sign-in's business.
  await db
    .delete(authSessions)
    .where(and(eq(authSessions.userId, userId), lt(authSessions.expiresAt, new Date())));

  return {
    name: SESSION_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: expiresAt,
    },
  };
}

export async function createSession(userId: string): Promise<void> {
  const cookie = await issueSession(userId);
  const store = await cookies();
  store.set(cookie.name, cookie.value, cookie.options);
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(authSessions).where(eq(authSessions.tokenHash, hashSessionToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

/**
 * The signed-in user, or null. Memoised per request so that a page rendering a dozen
 * server components still performs exactly one session lookup.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      timezone: users.timezone,
      avatarSeed: users.avatarSeed,
      avatarUrl: users.avatarUrl,
      mbbsYear: users.mbbsYear,
      university: users.university,
      whatsapp: users.whatsapp,
      onboardingCompletedAt: users.onboardingCompletedAt,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(
      and(
        eq(authSessions.tokenHash, hashSessionToken(token)),
        gt(authSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
});
