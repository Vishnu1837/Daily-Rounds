import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { attendanceMarkSchema } from '@/lib/validation';
import { recomputeDay } from '@/server/scoring';

import { createTestCohort, createTestMember, db, schema } from './helpers/db';

/**
 * Where an attendance mark came from, and what it is allowed to assert.
 *
 * The audit's finding: a bulk mark and a student walking into the room wrote the identical
 * row, so a register could read 26 present on a morning one person attended — and the
 * leaderboard derived from it could not be defended to the students on it.
 *
 * Two rules together fix that, and both are tested here:
 *
 *   1. the *row* records its own provenance (`source`), so nothing has to be inferred;
 *   2. a mark with no corroboration cannot, on its own, make the day count as showing up —
 *      it still pays its points, because a cohort lead who was in the room knows something
 *      the software does not.
 */

const MONDAY = '2025-09-08';

async function ledger(memberId: string, event: 'live_session_present' | 'study_block_completed') {
  await db.insert(schema.pointsLedger).values({
    memberId,
    event,
    points: 20,
    occurredOn: MONDAY,
    idempotencyKey: `${event}:${memberId}:${MONDAY}`,
  });
}

describe('attendance provenance', () => {
  it('a study-room join is recorded as verified', async () => {
    const { cohort } = await createTestCohort();
    const { memberId } = await createTestMember(cohort.id);

    // Exactly what `joinStudyRoomAction` writes.
    await db.insert(schema.studyRoomPresence).values({ memberId, date: MONDAY });
    await db.insert(schema.attendance).values({
      memberId,
      date: MONDAY,
      status: 'present',
      source: 'verified',
      note: 'Joined the study room',
    });

    const [row] = await db
      .select({ source: schema.attendance.source })
      .from(schema.attendance)
      .where(and(eq(schema.attendance.memberId, memberId), eq(schema.attendance.date, MONDAY)));

    expect(row!.source).toBe('verified');
  });

  it('defaults an unlabelled mark to admin, never to verified', async () => {
    const { cohort } = await createTestCohort();
    const { memberId } = await createTestMember(cohort.id);

    // A writer that forgets to say where a mark came from must not be given the benefit of
    // the doubt: the column default is the *unverified* value on purpose.
    await db.insert(schema.attendance).values({ memberId, date: MONDAY, status: 'present' });

    const [row] = await db
      .select({ source: schema.attendance.source })
      .from(schema.attendance)
      .where(and(eq(schema.attendance.memberId, memberId), eq(schema.attendance.date, MONDAY)));

    expect(row!.source).toBe('admin');
  });

  it('an admin mark alone pays its points but does not assert the student showed up', async () => {
    const ctx = await createTestCohort();
    const { memberId } = await createTestMember(ctx.cohort.id);

    await db.insert(schema.attendance).values({
      memberId,
      date: MONDAY,
      status: 'present',
      source: 'admin',
      overrideReason: 'Was on the backup call',
    });
    await ledger(memberId, 'live_session_present');

    const record = await recomputeDay({
      memberId,
      cohortId: ctx.cohort.id,
      date: MONDAY,
      calendar: ctx.calendar,
      rules: ctx.rules,
    });

    expect(record.points).toBe(20);
    expect(record.score).toBeGreaterThan(0);
    expect(record.showedUp).toBe(false);
  });

  it('the same mark counts once the room corroborates it', async () => {
    const ctx = await createTestCohort();
    const { memberId } = await createTestMember(ctx.cohort.id);

    await db.insert(schema.attendance).values({
      memberId,
      date: MONDAY,
      status: 'present',
      source: 'admin',
      overrideReason: 'Marked from the register',
    });
    await ledger(memberId, 'live_session_present');
    await db.insert(schema.studyRoomPresence).values({ memberId, date: MONDAY });

    const record = await recomputeDay({
      memberId,
      cohortId: ctx.cohort.id,
      date: MONDAY,
      calendar: ctx.calendar,
      rules: ctx.rules,
    });

    expect(record.showedUp).toBe(true);
  });

  it('any other earned behaviour is enough on its own', async () => {
    const ctx = await createTestCohort();
    const { memberId } = await createTestMember(ctx.cohort.id);

    // No attendance at all: a student who did the work without the room still showed up.
    await ledger(memberId, 'study_block_completed');

    const record = await recomputeDay({
      memberId,
      cohortId: ctx.cohort.id,
      date: MONDAY,
      calendar: ctx.calendar,
      rules: ctx.rules,
    });

    expect(record.showedUp).toBe(true);
  });
});

describe('attendanceMarkSchema', () => {
  const entries = [
    { memberId: '00000000-0000-4000-8000-000000000001', status: 'present' as const },
  ];

  it('refuses a hand-marked sheet with no reason', () => {
    expect(attendanceMarkSchema.safeParse({ date: MONDAY, entries }).success).toBe(false);
    expect(attendanceMarkSchema.safeParse({ date: MONDAY, reason: '  ', entries }).success).toBe(
      false,
    );
  });

  it('accepts a short, real reason', () => {
    const parsed = attendanceMarkSchema.safeParse({
      date: MONDAY,
      reason: '  Room link was down  ',
      entries,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.reason).toBe('Room link was down');
  });
});
