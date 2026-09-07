'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db/client';
import { checkIns, weeklyReviews } from '@/db/schema';
import { requireUserAction } from '@/lib/auth/guards';
import { ledgerKey } from '@/lib/domain/points';
import { calculateComebackState } from '@/lib/domain/streak';
import { minDate } from '@/lib/domain/calendar';
import { checkInSchema, fieldErrors, weeklyReviewSchema } from '@/lib/validation';
import { getMemberContext } from '@/server/context';
import { awardMany, awardPoints, loadActivity, settleDay } from '@/server/scoring';

import type { SettleSummary } from './study';
import { type Result, fail, guarded, ok } from './shared';

async function context() {
  const user = await requireUserAction();
  const ctx = await getMemberContext(user);
  if (!ctx) throw new Error('You are not in an active cohort yet.');
  return ctx;
}

export type CheckInResult = SettleSummary & {
  pointsFromCheckIn: number;
  wasComeback: boolean;
  alreadySubmitted: boolean;
};

/**
 * Records the daily check-in. Re-submitting updates the answers but never pays twice —
 * the ledger's idempotency key makes that a database-level guarantee.
 */
export async function submitCheckInAction(
  _prev: unknown,
  formData: FormData,
): Promise<Result<CheckInResult>> {
  return guarded(async () => {
    const ctx = await context();

    const raw = Object.fromEntries(formData);
    const parsed = checkInSchema.safeParse(raw);
    if (!parsed.success) {
      return fail('Some answers need a second look.', fieldErrors(parsed.error));
    }
    const input = parsed.data;

    // A student may only check in for today — never backfill a missed day.
    if (input.date !== ctx.today) {
      return fail('You can only check in for today.');
    }

    // Independent reads; neither needs the other's answer.
    const [existing, activity] = await Promise.all([
      db
        .select({ id: checkIns.id })
        .from(checkIns)
        .where(and(eq(checkIns.memberId, ctx.memberId), eq(checkIns.date, ctx.today)))
        .limit(1),
      loadActivity(ctx.memberId, ctx.calendar.startDate, minDate(ctx.today, ctx.calendar.endDate)),
    ]);
    const comeback = calculateComebackState(ctx.calendar, activity.showedUp, ctx.today);

    const values = {
      memberId: ctx.memberId,
      date: ctx.today,
      completion: input.completion,
      actualMinutes: input.actualMinutes,
      whatStudied: input.whatStudied,
      obstacle: input.obstacle,
      obstacleNote: input.obstacleNote ?? null,
      tomorrowTarget: input.tomorrowTarget ?? null,
      satisfaction: input.satisfaction,
      reflection: input.reflection ?? null,
      isComeback: comeback.isComeback,
      comebackReason: comeback.isComeback ? (input.comebackReason ?? null) : null,
    };

    await db
      .insert(checkIns)
      .values(values)
      .onConflictDoUpdate({
        target: [checkIns.memberId, checkIns.date],
        set: {
          completion: values.completion,
          actualMinutes: values.actualMinutes,
          whatStudied: values.whatStudied,
          obstacle: values.obstacle,
          obstacleNote: values.obstacleNote,
          tomorrowTarget: values.tomorrowTarget,
          satisfaction: values.satisfaction,
          reflection: values.reflection,
          comebackReason: values.comebackReason,
        },
      });

    /*
     * Every behaviour this check-in can pay for, written in one statement. Each still
     * carries its own idempotency key, so re-submitting a check-in pays nothing a second
     * time; only the keys the database actually accepted are counted below.
     *
     * Completing the target through the check-in counts the same as doing it on the study
     * screen — one idempotency key covers both routes.
     */
    const awards = [
      { event: 'daily_check_in' as const, when: true },
      { event: 'tomorrow_plan' as const, when: Boolean(input.tomorrowTarget) },
      { event: 'reflection' as const, when: Boolean(input.reflection) },
      { event: 'daily_target_completed' as const, when: input.completion === 'completed' },
    ]
      .filter((a) => a.when)
      .map((a) => ({
        memberId: ctx.memberId,
        event: a.event,
        points: ctx.rules[a.event],
        occurredOn: ctx.today,
        idempotencyKey: ledgerKey.daily(a.event, ctx.memberId, ctx.today),
      }));

    const written = await awardMany(awards);
    const pointsFromCheckIn = awards
      .filter((a) => written.has(a.idempotencyKey))
      .reduce((sum, a) => sum + a.points, 0);

    const outcome = await settleDay({
      memberId: ctx.memberId,
      cohortId: ctx.cohort.id,
      date: ctx.today,
      calendar: ctx.calendar,
      rules: ctx.rules,
    });

    revalidatePath('/today');
    revalidatePath('/check-in');
    revalidatePath('/progress');
    revalidatePath('/leaderboard');

    return ok({
      pointsAwarded: outcome.pointsAwarded + pointsFromCheckIn,
      pointsFromCheckIn,
      streak: outcome.streak,
      milestone: outcome.milestone,
      achievements: outcome.newAchievements.map((a) => ({
        code: a.code,
        name: a.name,
        description: a.description,
        emoji: a.emoji,
      })),
      wasComeback: comeback.isComeback,
      alreadySubmitted: existing.length > 0,
    });
  }, "We couldn't save your check-in. Your points haven't been changed. Please try again.");
}

export async function submitWeeklyReviewAction(
  _prev: unknown,
  formData: FormData,
): Promise<Result<{ points: number }>> {
  return guarded(async () => {
    const ctx = await context();
    const parsed = weeklyReviewSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return fail('Some answers need a second look.', fieldErrors(parsed.error));
    }
    const input = parsed.data;

    await db
      .insert(weeklyReviews)
      .values({
        memberId: ctx.memberId,
        weekStart: input.weekStart,
        whatWentWell: input.whatWentWell,
        whatStopped: input.whatStopped,
        whatToChange: input.whatToChange,
        subjectConfidence: input.subjectConfidence,
      })
      .onConflictDoUpdate({
        target: [weeklyReviews.memberId, weeklyReviews.weekStart],
        set: {
          whatWentWell: input.whatWentWell,
          whatStopped: input.whatStopped,
          whatToChange: input.whatToChange,
          subjectConfidence: input.subjectConfidence,
        },
      });

    const paid = await awardPoints({
      memberId: ctx.memberId,
      event: 'weekly_review',
      points: ctx.rules.weekly_review,
      occurredOn: ctx.today,
      idempotencyKey: ledgerKey.weeklyReview(ctx.memberId, input.weekStart),
    });

    await settleDay({
      memberId: ctx.memberId,
      cohortId: ctx.cohort.id,
      date: ctx.today,
      calendar: ctx.calendar,
      rules: ctx.rules,
    });

    revalidatePath('/progress');
    revalidatePath('/today');
    return ok({ points: paid ? ctx.rules.weekly_review : 0 });
  }, "We couldn't save your weekly review. Please try again.");
}
