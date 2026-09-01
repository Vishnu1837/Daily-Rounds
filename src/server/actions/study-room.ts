'use server';

import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db/client';
import { attendance, cohortMembers, studyRoomPresence, users } from '@/db/schema';
import { requireUserAction } from '@/lib/auth/guards';
import { timeInTimezone } from '@/lib/domain/calendar';
import { ledgerKey } from '@/lib/domain/points';
import { PRESENCE_STALE_SECONDS, parseHm, roomState } from '@/lib/domain/study-room';
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

/** Everyone currently in the room for `date`, by fresh heartbeat. */
async function occupantsOf(cohortId: string, date: string): Promise<RoomOccupant[]> {
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
        eq(studyRoomPresence.date, date),
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
      await db.insert(attendance).values({
        memberId,
        date: today,
        status,
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

      await settleDay({ memberId, date: today, calendar: ctx.calendar, rules: ctx.rules });
      revalidatePath('/today');
      revalidatePath('/admin/attendance');
    }

    return ok({
      url: cohort.meetUrl,
      status,
      attendanceRecorded,
      occupants: await occupantsOf(cohort.id, today),
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
      occupants: await occupantsOf(ctx.cohort.id, ctx.today),
      nowMinutes: parseHm(timeInTimezone(ctx.cohort.timezone)) ?? 0,
    });
  }, 'We lost the study room connection.');
}

/** Read-only roster poll, for a student who is watching the room but has not joined. */
export async function studyRoomPulseAction(): Promise<Result<RoomPulse>> {
  return guarded(async () => {
    const ctx = await context();
    return ok({
      occupants: await occupantsOf(ctx.cohort.id, ctx.today),
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
      occupants: await occupantsOf(ctx.cohort.id, ctx.today),
      nowMinutes: parseHm(timeInTimezone(ctx.cohort.timezone)) ?? 0,
    });
  }, 'We could not sign you out of the study room.');
}
