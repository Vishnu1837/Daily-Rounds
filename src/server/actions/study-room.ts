'use server';

import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db/client';
import { attendance, cohortMembers, studyRoomPresence, users } from '@/db/schema';
import { requireUserAction } from '@/lib/auth/guards';
import { timeInTimezone } from '@/lib/domain/calendar';
import { ledgerKey } from '@/lib/domain/points';
import {
  PRESENCE_STALE_SECONDS,
  parseHm,
  roomState,
  suspendsAwayTimer,
} from '@/lib/domain/study-room';
import { getMemberContext } from '@/server/context';
import { awardPoints, settleDay } from '@/server/scoring';

import { type Result, fail, guarded, ok } from './shared';

export type RoomOccupant = { memberId: string; name: string; avatarUrl: string | null };

export type RoomPulse = {
  /** Everyone whose heartbeat is still fresh, earliest arrival first. */
  occupants: RoomOccupant[];
  /** Cohort wall-clock minutes since midnight, so the client can resync its countdown. */
  nowMinutes: number;
};

export type JoinResult = RoomPulse & {
  url: string;
  status: 'present' | 'late';
  /** False when an admin had already marked the day and we left their call alone. */
  attendanceRecorded: boolean;
};

async function context() {
  const user = await requireUserAction();
  const ctx = await getMemberContext(user);
  if (!ctx) throw new Error('You are not in an active cohort yet.');
  return ctx;
}

/**
 * Everyone currently in the room, by fresh heartbeat.
 *
 * Deliberately not filtered by study date. The roster is a *live* fact and the heartbeat
 * cutoff below already settles it, where the date does not: students sit in thirty
 * timezones, so two people in the same room at the same instant can be on either side of
 * their own midnight, and dating the query would have shown each of them an empty room.
 */
async function occupantsOf(cohortId: string): Promise<RoomOccupant[]> {
  const cutoff = new Date(Date.now() - PRESENCE_STALE_SECONDS * 1000);

  const rows = await db
    .select({
      memberId: studyRoomPresence.memberId,
      name: users.fullName,
      avatarUrl: users.avatarUrl,
    })
    .from(studyRoomPresence)
    .innerJoin(cohortMembers, eq(cohortMembers.id, studyRoomPresence.memberId))
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(
      and(
        eq(cohortMembers.cohortId, cohortId),
        isNull(studyRoomPresence.leftAt),
        gt(studyRoomPresence.lastSeenAt, cutoff),
      ),
    )
    .orderBy(asc(studyRoomPresence.joinedAt));

  return rows;
}

/**
 * Joins today's study room.
 *
 * This is the moment the room stops being a link. It does three things in order, and each
 * is safe to repeat: it puts the student on the live roster, it records their own
 * attendance for the day (unless an admin has already ruled on it — a human call always
 * outranks a self-report), and it settles the day so points, streak and the activity cache
 * reflect the new fact immediately.
 */
export async function joinStudyRoomAction(): Promise<Result<JoinResult>> {
  return guarded(async () => {
    const ctx = await context();
    const { cohort, memberId, today } = ctx;

    if (!cohort.meetUrl) {
      return fail('No meeting link has been set for the study room yet.');
    }

    const nowMinutes = parseHm(timeInTimezone(cohort.timezone)) ?? 0;
    const state = roomState({
      startTime: cohort.meetStartTime,
      endTime: cohort.meetEndTime,
      nowMinutes,
    });

    if (state.joinStatus === null) {
      return fail(
        state.phase === 'before'
          ? `The study room opens at ${cohort.meetStartTime}. It is not open yet.`
          : `Today's study room closed at ${cohort.meetEndTime}.`,
      );
    }

    const status = state.joinStatus;
    const now = new Date();

    await db
      .insert(studyRoomPresence)
      .values({ memberId, date: today, joinedAt: now, lastSeenAt: now })
      .onConflictDoUpdate({
        target: [studyRoomPresence.memberId, studyRoomPresence.date],
        // Re-joining after a drop reuses the row: the arrival time is the one that counts.
        set: { lastSeenAt: now, leftAt: null },
      });

    const existing = await db
      .select({ id: attendance.id })
      .from(attendance)
      .where(and(eq(attendance.memberId, memberId), eq(attendance.date, today)))
      .limit(1);

    const attendanceRecorded = existing.length === 0;

    if (attendanceRecorded) {
      /*
       * `source: 'verified'` is what separates this row from a hand-marked one. It is only
       * reachable by the student's own client, alongside the `study_room_presence` row
       * written a few lines above, and `showedUpForDay` accepts it on its own where an
       * admin mark needs corroboration. See `attendanceSourceEnum`.
       */
      await db.insert(attendance).values({
        memberId,
        date: today,
        status,
        source: 'verified',
        note: 'Joined the study room',
        markedBy: ctx.user.id,
        markedAt: now,
      });

      const event = status === 'present' ? 'live_session_present' : 'live_session_late';
      await awardPoints({
        memberId,
        event,
        points: ctx.rules[event],
        occurredOn: today,
        idempotencyKey: ledgerKey.attendance(memberId, today),
        reason: status === 'present' ? 'Joined the study room' : 'Joined the study room late',
        createdBy: ctx.user.id,
      });

      await settleDay({
        memberId,
        cohortId: ctx.cohort.id,
        date: today,
        calendar: ctx.calendar,
        rules: ctx.rules,
      });
      revalidatePath('/today');
      revalidatePath('/admin/attendance');
    }

    return ok({
      url: cohort.meetUrl,
      status,
      attendanceRecorded,
      occupants: await occupantsOf(cohort.id),
      nowMinutes,
    });
  }, 'We could not put you in the study room. Please try again.');
}

/**
 * Keeps the student on the live roster and returns who else is there.
 *
 * Called on a timer by the card while the room is open. It never creates presence — only a
 * deliberate join does that — so a page left open overnight cannot fake an arrival.
 */
export async function heartbeatStudyRoomAction(): Promise<Result<RoomPulse>> {
  return guarded(async () => {
    const ctx = await context();

    await db
      .update(studyRoomPresence)
      .set({ lastSeenAt: new Date() })
      .where(
        and(
          eq(studyRoomPresence.memberId, ctx.memberId),
          eq(studyRoomPresence.date, ctx.today),
          isNull(studyRoomPresence.leftAt),
        ),
      );

    return ok({
      occupants: await occupantsOf(ctx.cohort.id),
      nowMinutes: parseHm(timeInTimezone(ctx.cohort.timezone)) ?? 0,
    });
  }, 'We lost the study room connection.');
}

/** Read-only roster poll, for a student who is watching the room but has not joined. */
export async function studyRoomPulseAction(): Promise<Result<RoomPulse>> {
  return guarded(async () => {
    const ctx = await context();
    return ok({
      occupants: await occupantsOf(ctx.cohort.id),
      nowMinutes: parseHm(timeInTimezone(ctx.cohort.timezone)) ?? 0,
    });
  }, 'We could not refresh the study room.');
}

/** Steps out of the room. Attendance already recorded for the day is left untouched. */
export async function leaveStudyRoomAction(): Promise<Result<RoomPulse>> {
  return guarded(async () => {
    const ctx = await context();

    await db
      .update(studyRoomPresence)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(studyRoomPresence.memberId, ctx.memberId),
          eq(studyRoomPresence.date, ctx.today),
          isNull(studyRoomPresence.leftAt),
        ),
      );

    return ok({
      occupants: await occupantsOf(ctx.cohort.id),
      nowMinutes: parseHm(timeInTimezone(ctx.cohort.timezone)) ?? 0,
    });
  }, 'We could not sign you out of the study room.');
}

/**
 * Whether the grove's away timer should stand down for this student right now.
 *
 * Called from the study screen at the moment the timer would fire — not when it is armed —
 * so the answer is always fresh and the round trip is only spent when a round is genuinely
 * about to be killed.
 *
 * The decision is `suspendsAwayTimer`'s and is made entirely from server-side facts: a
 * presence row this student opened by joining, and the cohort clock. Nothing the caller
 * sends is consulted.
 */
export async function studyRoomHoldAction(): Promise<Result<{ suspended: boolean }>> {
  return guarded(async () => {
    const ctx = await context();

    const [presence] = await db
      .select({ id: studyRoomPresence.id })
      .from(studyRoomPresence)
      .where(
        and(
          eq(studyRoomPresence.memberId, ctx.memberId),
          eq(studyRoomPresence.date, ctx.today),
          isNull(studyRoomPresence.leftAt),
        ),
      )
      .limit(1);

    const { phase } = roomState({
      startTime: ctx.cohort.meetStartTime,
      endTime: ctx.cohort.meetEndTime,
      nowMinutes: parseHm(timeInTimezone(ctx.cohort.timezone)) ?? 0,
    });

    return ok({ suspended: suspendsAwayTimer({ hasOpenPresence: Boolean(presence), phase }) });
  }, 'We could not check the study room.');
}
