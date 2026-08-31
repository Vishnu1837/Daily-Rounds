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
import { awardPoints, loadActivity, settleDay } from '@/server/scoring';

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

    const existing = await db
      .select({ id: checkIns.id })
      .from(checkIns)
      .where(and(eq(checkIns.memberId, ctx.memberId), eq(checkIns.date, ctx.today)))
      .limit(1);

    const activity = await loadActivity(
      ctx.memberId,
      ctx.calendar.startDate,
      minDate(ctx.today, ctx.calendar.endDate),
    );
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

    let pointsFromCheckIn = 0;

    if (
      await awardPoints({
        memberId: ctx.memberId,
        event: 'daily_check_in',
        points: ctx.rules.daily_check_in,
        occurredOn: ctx.today,
        idempotencyKey: ledgerKey.daily('daily_check_in', ctx.memberId, ctx.today),
      })
    ) {
      pointsFromCheckIn += ctx.rules.daily_check_in;
    }

    if (input.tomorrowTarget) {
      if (
        await awardPoints({
          memberId: ctx.memberId,
          event: 'tomorrow_plan',
          points: ctx.rules.tomorrow_plan,
          occurredOn: ctx.today,
          idempotencyKey: ledgerKey.daily('tomorrow_plan', ctx.memberId, ctx.today),
        })
      ) {
        pointsFromCheckIn += ctx.rules.tomorrow_plan;
      }
    }

    if (input.reflection) {
      if (
        await awardPoints({
          memberId: ctx.memberId,
          event: 'reflection',
          points: ctx.rules.reflection,
          occurredOn: ctx.today,
          idempotencyKey: ledgerKey.daily('reflection', ctx.memberId, ctx.today),
        })
      ) {
        pointsFromCheckIn += ctx.rules.reflection;
      }
    }

    // Completing the target through the check-in counts the same as doing it on the
    // study screen — one idempotency key covers both routes.
    if (input.completion === 'completed') {
      if (
        await awardPoints({
          memberId: ctx.memberId,
          event: 'daily_target_completed',
          points: ctx.rules.daily_target_completed,
          occurredOn: ctx.today,
          idempotencyKey: ledgerKey.daily('daily_target_completed', ctx.memberId, ctx.today),
        })
      ) {
        pointsFromCheckIn += ctx.rules.daily_target_completed;
      }
    }

    const outcome = await settleDay({
      memberId: ctx.memberId,
      date: ctx.today,
      calendar: ctx.calendar,
      rules: ctx.rules,
    });

    revalidatePath('/');
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
      date: ctx.today,
      calendar: ctx.calendar,
      rules: ctx.rules,
    });

    revalidatePath('/progress');
    revalidatePath('/');
    return ok({ points: paid ? ctx.rules.weekly_review : 0 });
  }, "We couldn't save your weekly review. Please try again.");
}
