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

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: 'student' | 'admin';
  timezone: string;
  avatarSeed: string;
  mbbsYear: number | null;
  university: string | null;
  whatsapp: string | null;
  onboardingCompletedAt: Date | null;
};

export async function createSession(userId: string): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  await db.insert(authSessions).values({ userId, tokenHash: hashToken(token), expiresAt });

  // Opportunistic cleanup of this user's expired sessions.
  await db
    .delete(authSessions)
    .where(and(eq(authSessions.userId, userId), lt(authSessions.expiresAt, new Date())));

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(authSessions).where(eq(authSessions.tokenHash, hashToken(token)));
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
      mbbsYear: users.mbbsYear,
      university: users.university,
      whatsapp: users.whatsapp,
      onboardingCompletedAt: users.onboardingCompletedAt,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.tokenHash, hashToken(token)), gt(authSessions.expiresAt, new Date())))
    .limit(1);

  return rows[0] ?? null;
});
