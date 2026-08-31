'use server';

import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db/client';
import { dailyAssignments, roadmapTopics, roadmaps, studentAchievements, studySessions } from '@/db/schema';
import { requireUserAction } from '@/lib/auth/guards';
import { ledgerKey } from '@/lib/domain/points';
import { getMemberContext } from '@/server/context';
import { awardPoints, settleDay } from '@/server/scoring';

import { type Result, fail, guarded, ok } from './shared';

export type StudySessionState = {
  id: string;
  status: 'running' | 'paused' | 'completed' | 'abandoned';
  elapsedSeconds: number;
  resumedAt: string | null;
  plannedMinutes: number;
};

export type SettleSummary = {
  pointsAwarded: number;
  streak: number;
  milestone: number | null;
  achievements: { code: string; name: string; description: string; emoji: string }[];
};

export type FinishSummary = SettleSummary & {
  /** False when the block was too short to count as completed. */
  qualified: boolean;
  minutes: number;
  /** The minimum a block must run before it pays out. */
  requiredMinutes: number;
};

async function context() {
  const user = await requireUserAction();
  const ctx = await getMemberContext(user);
  if (!ctx) throw new Error('You are not in an active cohort yet.');
  return ctx;
}

function summarise(outcome: Awaited<ReturnType<typeof settleDay>>): SettleSummary {
  return {
    pointsAwarded: outcome.pointsAwarded,
    streak: outcome.streak,
    milestone: outcome.milestone,
    achievements: outcome.newAchievements.map((a) => ({
      code: a.code,
      name: a.name,
      description: a.description,
      emoji: a.emoji,
    })),
  };
}

/** Starts today's study block, or returns the one already in progress. */
export async function startSessionAction(): Promise<Result<StudySessionState>> {
  return guarded(async () => {
    const ctx = await context();

    const existing = await db
      .select()
      .from(studySessions)
      .where(
        and(
          eq(studySessions.memberId, ctx.memberId),
          eq(studySessions.date, ctx.today),
          inArray(studySessions.status, ['running', 'paused']),
        ),
      )
      .orderBy(desc(studySessions.startedAt))
      .limit(1);

    if (existing[0]) {
      const row = existing[0];
      // Resume a paused session rather than starting a second one.
      if (row.status === 'paused') {
        const [resumed] = await db
          .update(studySessions)
          .set({ status: 'running', resumedAt: new Date() })
          .where(eq(studySessions.id, row.id))
          .returning();
        return ok(toState(resumed!));
      }
      return ok(toState(row));
    }

    const assignment = await db
      .select({ topicId: dailyAssignments.topicId, plannedMinutes: dailyAssignments.plannedMinutes })
      .from(dailyAssignments)
      .where(and(eq(dailyAssignments.memberId, ctx.memberId), eq(dailyAssignments.date, ctx.today)))
      .limit(1);

    const [created] = await db
      .insert(studySessions)
      .values({
        memberId: ctx.memberId,
        date: ctx.today,
        topicId: assignment[0]?.topicId ?? null,
        plannedMinutes: assignment[0]?.plannedMinutes ?? 90,
        status: 'running',
        resumedAt: new Date(),
      })
      .returning();

    revalidatePath('/');
    return ok(toState(created!));
  }, 'We could not start your study session. Nothing has been lost — please try again.');
}

export async function pauseSessionAction(sessionId: string): Promise<Result<StudySessionState>> {
  return guarded(async () => {
    const ctx = await context();
    const rows = await db
      .select()
      .from(studySessions)
      .where(and(eq(studySessions.id, sessionId), eq(studySessions.memberId, ctx.memberId)))
      .limit(1);

    const session = rows[0];
    if (!session) return fail('That study session could not be found.');
    if (session.status !== 'running') return ok(toState(session));

    const accrued = session.resumedAt
      ? Math.floor((Date.now() - session.resumedAt.getTime()) / 1000)
      : 0;

    const [updated] = await db
      .update(studySessions)
      .set({
        status: 'paused',
        resumedAt: null,
        elapsedSeconds: session.elapsedSeconds + Math.max(0, accrued),
      })
      .where(eq(studySessions.id, session.id))
      .returning();

    return ok(toState(updated!));
  }, 'We could not pause your session. Your time so far is safe.');
}

/**
 * Finishes the block and pays for it. The elapsed time is recomputed server-side from
 * `resumedAt`; the client value is never trusted for scoring.
 */
export async function finishSessionAction(sessionId: string): Promise<Result<FinishSummary>> {
  return guarded(async () => {
    const ctx = await context();
    const rows = await db
      .select()
      .from(studySessions)
      .where(and(eq(studySessions.id, sessionId), eq(studySessions.memberId, ctx.memberId)))
      .limit(1);

    const session = rows[0];
    if (!session) return fail('That study session could not be found.');

    const accrued = session.resumedAt
      ? Math.floor((Date.now() - session.resumedAt.getTime()) / 1000)
      : 0;
    const elapsed = Math.min(24 * 3600, session.elapsedSeconds + Math.max(0, accrued));

    if (session.status !== 'completed') {
      await db
        .update(studySessions)
        .set({
          status: 'completed',
          resumedAt: null,
          elapsedSeconds: elapsed,
          endedAt: new Date(),
        })
        .where(eq(studySessions.id, session.id));
    }

    // A block counts once it passes a meaningful fraction of the plan. Below that the
    // session is still recorded — it just does not pay out as a completed block.
    const requiredSeconds = Math.min(10 * 60, session.plannedMinutes * 30);
    const qualifies = elapsed >= requiredSeconds;

    let blockPoints = 0;
    if (qualifies) {
      const written = await awardPoints({
        memberId: ctx.memberId,
        event: 'study_block_completed',
        points: ctx.rules.study_block_completed,
        occurredOn: session.date,
        idempotencyKey: ledgerKey.daily('study_block_completed', ctx.memberId, session.date),
        reason: `${Math.round(elapsed / 60)} minutes studied`,
        metadata: { sessionId: session.id, elapsedSeconds: elapsed },
      });
      if (written) blockPoints = ctx.rules.study_block_completed;
    }

    const outcome = await settleDay({
      memberId: ctx.memberId,
      date: session.date,
      calendar: ctx.calendar,
      rules: ctx.rules,
    });

    revalidatePath('/');
    revalidatePath('/progress');
    return ok({
      // settleDay only reports what *it* awarded (milestones, achievements), so the block
      // itself has to be added or the celebration under-reports the student's points.
      ...summarise(outcome),
      pointsAwarded: outcome.pointsAwarded + blockPoints,
      qualified: qualifies,
      minutes: Math.round(elapsed / 60),
      requiredMinutes: Math.ceil(requiredSeconds / 60),
    });
  }, "We could not save your study block. Your points have not changed — please try again.");
}

/** Marks today's assigned topic complete and advances the roadmap. */
export async function completeTargetAction(): Promise<Result<SettleSummary>> {
  return guarded(async () => {
    const ctx = await context();

    const assignment = await db
      .select({ topicId: dailyAssignments.topicId })
      .from(dailyAssignments)
      .where(and(eq(dailyAssignments.memberId, ctx.memberId), eq(dailyAssignments.date, ctx.today)))
      .limit(1);

    const topicId = assignment[0]?.topicId ?? null;

    if (topicId) {
      // Ownership check: the topic must belong to a roadmap this student owns.
      const owned = await db
        .select({ id: roadmapTopics.id })
        .from(roadmapTopics)
        .innerJoin(roadmaps, eq(roadmaps.id, roadmapTopics.roadmapId))
        .where(and(eq(roadmapTopics.id, topicId), eq(roadmaps.memberId, ctx.memberId)))
        .limit(1);

      if (owned.length > 0) {
        await db
          .update(roadmapTopics)
          .set({ status: 'completed', completedAt: new Date() })
          .where(eq(roadmapTopics.id, topicId));

        // Promote the next upcoming topic to in-progress.
        const next = await db
          .select({ id: roadmapTopics.id })
          .from(roadmapTopics)
          .innerJoin(roadmaps, eq(roadmaps.id, roadmapTopics.roadmapId))
          .where(and(eq(roadmaps.memberId, ctx.memberId), eq(roadmapTopics.status, 'upcoming')))
          .orderBy(roadmapTopics.position)
          .limit(1);

        if (next[0]) {
          await db
            .update(roadmapTopics)
            .set({ status: 'in_progress' })
            .where(eq(roadmapTopics.id, next[0].id));
        }
      }
    }

    await awardPoints({
      memberId: ctx.memberId,
      event: 'daily_target_completed',
      points: ctx.rules.daily_target_completed,
      occurredOn: ctx.today,
      idempotencyKey: ledgerKey.daily('daily_target_completed', ctx.memberId, ctx.today),
      metadata: topicId ? { topicId } : {},
    });

    const outcome = await settleDay({
      memberId: ctx.memberId,
      date: ctx.today,
      calendar: ctx.calendar,
      rules: ctx.rules,
    });

    revalidatePath('/');
    revalidatePath('/roadmap');
    revalidatePath('/progress');
    return ok(summarise(outcome));
  }, "We could not mark today's target complete. Please try again.");
}

/** Toggles a roadmap topic's state from the roadmap screen. */
export async function setTopicStatusAction(
  topicId: string,
  status: 'upcoming' | 'in_progress' | 'completed',
): Promise<Result> {
  return guarded(async () => {
    const ctx = await context();

    const owned = await db
      .select({ id: roadmapTopics.id })
      .from(roadmapTopics)
      .innerJoin(roadmaps, eq(roadmaps.id, roadmapTopics.roadmapId))
      .where(and(eq(roadmapTopics.id, topicId), eq(roadmaps.memberId, ctx.memberId)))
      .limit(1);

    if (owned.length === 0) return fail('That topic is not on your roadmap.');

    await db
      .update(roadmapTopics)
      .set({ status, completedAt: status === 'completed' ? new Date() : null })
      .where(eq(roadmapTopics.id, topicId));

    revalidatePath('/roadmap');
    revalidatePath('/');
    return ok();
  }, 'We could not update that topic. Please try again.');
}

/** Marks celebrations as shown so they only fire once. */
export async function markAchievementsSeenAction(codes: string[]): Promise<Result> {
  return guarded(async () => {
    const ctx = await context();
    if (codes.length === 0) return ok();
    await db
      .update(studentAchievements)
      .set({ seenAt: new Date() })
      .where(
        and(
          eq(studentAchievements.memberId, ctx.memberId),
          inArray(studentAchievements.code, codes),
          isNull(studentAchievements.seenAt),
        ),
      );
    return ok();
  }, 'We could not update your achievements.');
}

function toState(row: typeof studySessions.$inferSelect): StudySessionState {
  return {
    id: row.id,
    status: row.status,
    elapsedSeconds: row.elapsedSeconds,
    resumedAt: row.resumedAt?.toISOString() ?? null,
    plannedMinutes: row.plannedMinutes,
  };
}
