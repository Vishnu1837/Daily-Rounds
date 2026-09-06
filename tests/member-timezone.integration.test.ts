import { afterEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import type { SessionUser } from '@/lib/auth/session';
import { getMemberContext } from '@/server/context';

import { createTestCohort, createTestMember, db, schema } from './helpers/db';

/**
 * Whose day is it?
 *
 * `ctx.today` used to be the *cohort's* date for everybody, which made the timezone picker
 * in the profile a decoration: a student in Toronto was told their study day had rolled
 * over — and that today's check-in was already missed — while it was still yesterday
 * evening where they were sitting. Every date-shaped thing in the product hangs off this
 * one field, so it is the single place worth pinning down.
 *
 * The cohort's own date does not disappear. It moves to `cohortToday`, which is what the
 * things that belong to everyone at once — the ranking, the cohort pulse — are cut on.
 */

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
  cacheTag: () => {},
  cacheLife: () => {},
}));

afterEach(() => {
  vi.useRealTimers();
});

function sessionUserFrom(user: typeof schema.users.$inferSelect): SessionUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    timezone: user.timezone,
    avatarSeed: user.avatarSeed,
    avatarUrl: user.avatarUrl,
    mbbsYear: user.mbbsYear,
    university: user.university,
    whatsapp: user.whatsapp,
    onboardingCompletedAt: user.onboardingCompletedAt,
  };
}

async function contextIn(timezone: string) {
  const { cohort } = await createTestCohort();
  const { user } = await createTestMember(cohort.id);

  const [updated] = await db
    .update(schema.users)
    .set({ timezone })
    .where(eq(schema.users.id, user.id))
    .returning();

  return getMemberContext(sessionUserFrom(updated!));
}

describe('the day a student is on', () => {
  it('is cut in their own timezone, not the cohort’s', async () => {
    // 19:30 in Toronto on the 15th is already 05:00 on the 16th in Kolkata, where the
    // cohort lives. The student has not finished the 15th yet.
    vi.setSystemTime(new Date('2025-09-15T23:30:00Z'));

    const ctx = await contextIn('America/Toronto');

    expect(ctx?.today).toBe('2025-09-15');
    expect(ctx?.timezone).toBe('America/Toronto');
  });

  it('still reports the cohort’s own date alongside it', async () => {
    vi.setSystemTime(new Date('2025-09-15T23:30:00Z'));

    const ctx = await contextIn('America/Toronto');

    // Cohort-wide facts — the ranking, "how many of us showed up today" — are cut on this
    // one, so every student reads the same sentence.
    expect(ctx?.cohortToday).toBe('2025-09-16');
  });

  it('agrees with the cohort when the student is in the cohort’s zone', async () => {
    vi.setSystemTime(new Date('2025-09-15T23:30:00Z'));

    const ctx = await contextIn('Asia/Kolkata');

    expect(ctx?.today).toBe('2025-09-16');
    expect(ctx?.cohortToday).toBe('2025-09-16');
  });

  it('falls back to the cohort’s zone for a membership with no choice recorded', async () => {
    vi.setSystemTime(new Date('2025-09-15T23:30:00Z'));

    const ctx = await contextIn('');

    expect(ctx?.timezone).toBe('Asia/Kolkata');
    expect(ctx?.today).toBe('2025-09-16');
  });
});
