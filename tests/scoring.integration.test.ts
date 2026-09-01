import { and, eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  type TestCohort,
  createTestCohort,
  createTestMember,
  db,
  migrateTestDb,
  schema,
} from './helpers/db';
import { ledgerKey } from '@/lib/domain/points';
import { awardPoints, loadActivity, recomputeDay, settleDay, totalPoints } from '@/server/scoring';

let ctx: TestCohort;

beforeAll(async () => {
  await migrateTestDb();
  ctx = await createTestCohort();
});

async function member() {
  const { memberId } = await createTestMember(ctx.cohort.id);
  return memberId;
}

/** Awards a full behaviour day, exactly as the app does. */
async function completeDay(memberId: string, date: string) {
  const events = [
    ['live_session_present', ctx.rules.live_session_present],
    ['study_block_completed', ctx.rules.study_block_completed],
    ['daily_target_completed', ctx.rules.daily_target_completed],
    ['daily_check_in', ctx.rules.daily_check_in],
    ['tomorrow_plan', ctx.rules.tomorrow_plan],
    ['reflection', ctx.rules.reflection],
  ] as const;

  for (const [event, points] of events) {
    await awardPoints({
      memberId,
      event,
      points,
      occurredOn: date,
      idempotencyKey: ledgerKey.daily(event, memberId, date),
    });
  }
  return settleDay({ memberId, date, calendar: ctx.calendar, rules: ctx.rules });
}

describe('points ledger', () => {
  it('writes an entry and reports it as new', async () => {
    const memberId = await member();
    const written = await awardPoints({
      memberId,
      event: 'daily_check_in',
      points: 5,
      occurredOn: '2025-09-01',
      idempotencyKey: ledgerKey.daily('daily_check_in', memberId, '2025-09-01'),
    });
    expect(written).toBe(true);
    expect(await totalPoints(memberId)).toBe(5);
  });

  it('never pays twice for the same action, however many times it is submitted', async () => {
    const memberId = await member();
    const key = ledgerKey.daily('daily_check_in', memberId, '2025-09-01');

    const results: boolean[] = [];
    for (let i = 0; i < 20; i++) {
      results.push(
        await awardPoints({
          memberId,
          event: 'daily_check_in',
          points: 5,
          occurredOn: '2025-09-01',
          idempotencyKey: key,
        }),
      );
    }

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await totalPoints(memberId)).toBe(5);

    const rows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.pointsLedger)
      .where(eq(schema.pointsLedger.memberId, memberId));
    expect(rows[0]?.n).toBe(1);
  });

  it('keeps concurrent duplicate submissions to a single award', async () => {
    const memberId = await member();
    const key = ledgerKey.daily('study_block_completed', memberId, '2025-09-02');

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        awardPoints({
          memberId,
          event: 'study_block_completed',
          points: 20,
          occurredOn: '2025-09-02',
          idempotencyKey: key,
        }),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await totalPoints(memberId)).toBe(20);
  });

  it('separates awards across students, days and event types', async () => {
    const a = await member();
    const b = await member();

    await awardPoints({
      memberId: a,
      event: 'daily_check_in',
      points: 5,
      occurredOn: '2025-09-01',
      idempotencyKey: ledgerKey.daily('daily_check_in', a, '2025-09-01'),
    });
    await awardPoints({
      memberId: b,
      event: 'daily_check_in',
      points: 5,
      occurredOn: '2025-09-01',
      idempotencyKey: ledgerKey.daily('daily_check_in', b, '2025-09-01'),
    });
    await awardPoints({
      memberId: a,
      event: 'daily_check_in',
      points: 5,
      occurredOn: '2025-09-02',
      idempotencyKey: ledgerKey.daily('daily_check_in', a, '2025-09-02'),
    });

    expect(await totalPoints(a)).toBe(10);
    expect(await totalPoints(b)).toBe(5);
  });

  it('records an admin correction without touching earned history', async () => {
    const memberId = await member();
    await completeDay(memberId, '2025-09-01');
    const before = await totalPoints(memberId);

    await awardPoints({
      memberId,
      event: 'admin_adjustment',
      points: -15,
      occurredOn: '2025-09-01',
      idempotencyKey: ledgerKey.adminAdjustment(memberId, 'correction-1'),
      reason: 'Attendance was marked in error',
    });

    // The original entries survive; the correction is an additional, signed row.
    const rows = await db
      .select()
      .from(schema.pointsLedger)
      .where(eq(schema.pointsLedger.memberId, memberId));

    expect(rows.filter((r) => r.event === 'daily_check_in')).toHaveLength(1);
    expect(rows.filter((r) => r.event === 'admin_adjustment')).toHaveLength(1);
    expect(await totalPoints(memberId)).toBe(before - 15);
  });
});

describe('daily activity derivation', () => {
  it('scores a fully completed active day as perfect', async () => {
    const memberId = await member();
    await completeDay(memberId, '2025-09-01');

    const row = await db
      .select()
      .from(schema.dailyActivity)
      .where(
        and(
          eq(schema.dailyActivity.memberId, memberId),
          eq(schema.dailyActivity.date, '2025-09-01'),
        ),
      );

    expect(row[0]?.scorePct).toBe(100);
    expect(row[0]?.band).toBe('perfect');
    expect(row[0]?.showedUp).toBe(true);
    expect(row[0]?.isActiveDay).toBe(true);
  });

  it('scores a partial day proportionally and still counts as showing up', async () => {
    const memberId = await member();
    await awardPoints({
      memberId,
      event: 'daily_check_in',
      points: 5,
      occurredOn: '2025-09-02',
      idempotencyKey: ledgerKey.daily('daily_check_in', memberId, '2025-09-02'),
    });
    const record = await recomputeDay({
      memberId,
      date: '2025-09-02',
      calendar: ctx.calendar,
      rules: ctx.rules,
    });

    expect(record.score).toBeCloseTo(5 / 80, 4);
    expect(record.showedUp).toBe(true);
  });

  it('excludes quiz points from the day score entirely', async () => {
    const memberId = await member();
    await awardPoints({
      memberId,
      event: 'quiz_attempt',
      points: 5,
      occurredOn: '2025-09-03',
      idempotencyKey: ledgerKey.quizAttempt(memberId, 'quiz-1', '2025-09-03'),
    });
    await awardPoints({
      memberId,
      event: 'quiz_bonus',
      points: 5,
      occurredOn: '2025-09-03',
      idempotencyKey: ledgerKey.quizBonus(memberId, 'quiz-1', '2025-09-03'),
    });

    const record = await recomputeDay({
      memberId,
      date: '2025-09-03',
      calendar: ctx.calendar,
      rules: ctx.rules,
    });

    // Points were banked, but the day counts as missed because no behaviour happened.
    expect(record.points).toBe(10);
    expect(record.score).toBe(0);
    expect(record.showedUp).toBe(false);
  });

  it('marks a weekend as a rest day even when work was logged', async () => {
    const memberId = await member();
    await awardPoints({
      memberId,
      event: 'study_block_completed',
      points: 20,
      occurredOn: '2025-09-06', // Saturday
      idempotencyKey: ledgerKey.daily('study_block_completed', memberId, '2025-09-06'),
    });
    const record = await recomputeDay({
      memberId,
      date: '2025-09-06',
      calendar: ctx.calendar,
      rules: ctx.rules,
    });

    expect(record.showedUp).toBe(false); // not an active day, so it cannot count toward the streak
    expect(record.points).toBe(20); // but the points are still banked
  });

  it('is idempotent — recomputing changes nothing', async () => {
    const memberId = await member();
    await completeDay(memberId, '2025-09-01');
    const first = await recomputeDay({
      memberId,
      date: '2025-09-01',
      calendar: ctx.calendar,
      rules: ctx.rules,
    });
    const second = await recomputeDay({
      memberId,
      date: '2025-09-01',
      calendar: ctx.calendar,
      rules: ctx.rules,
    });
    expect(second).toEqual(first);
  });
});

describe('streaks and milestones through the real pipeline', () => {
  it('builds a streak across a weekend and pays the milestone exactly once', async () => {
    const memberId = await member();
    // Mon 1 → Fri 5, then Mon 8: five consecutive active study days.
    const days = ['2025-09-01', '2025-09-02', '2025-09-03', '2025-09-04', '2025-09-05'];

    let outcome;
    for (const date of days) {
      outcome = await completeDay(memberId, date);
    }

    expect(outcome?.streak).toBe(5);
    expect(outcome?.milestone).toBe(5);

    const bonusesFor = async () =>
      db
        .select()
        .from(schema.pointsLedger)
        .where(
          and(
            eq(schema.pointsLedger.memberId, memberId),
            eq(schema.pointsLedger.event, 'streak_bonus'),
          ),
        );

    // A five-day run crosses the 3-day and 5-day milestones, and each pays exactly once.
    const bonuses = await bonusesFor();
    const milestones = bonuses.map((b) => b.metadata.milestone).sort();
    expect(milestones).toEqual([3, 5]);
    expect(new Set(bonuses.map((b) => b.idempotencyKey)).size).toBe(bonuses.length);

    // Settling the same day repeatedly must not pay any milestone again.
    for (let i = 0; i < 3; i++) {
      await settleDay({
        memberId,
        date: '2025-09-05',
        calendar: ctx.calendar,
        rules: ctx.rules,
      });
    }
    expect(await bonusesFor()).toHaveLength(bonuses.length);
  });

  it('continues the streak from Friday to Monday', async () => {
    const memberId = await member();
    for (const date of ['2025-09-04', '2025-09-05']) await completeDay(memberId, date);
    const monday = await completeDay(memberId, '2025-09-08');
    expect(monday.streak).toBe(3);
  });

  it('continues the streak across a cohort holiday', async () => {
    const memberId = await member();
    // Tue 16 → holiday Wed 17 → Thu 18.
    for (const date of ['2025-09-16', '2025-09-18']) await completeDay(memberId, date);
    const activity = await loadActivity(memberId, ctx.calendar.startDate, '2025-09-18');
    expect(activity.showedUp('2025-09-16')).toBe(true);
    expect(activity.showedUp('2025-09-17')).toBe(false); // holiday, never recorded
    const outcome = await settleDay({
      memberId,
      date: '2025-09-18',
      calendar: ctx.calendar,
      rules: ctx.rules,
    });
    expect(outcome.streak).toBe(2);
  });

  it('breaks the streak on a missed active day', async () => {
    const memberId = await member();
    await completeDay(memberId, '2025-09-01');
    await completeDay(memberId, '2025-09-02');
    // Wednesday missed.
    const thursday = await completeDay(memberId, '2025-09-04');
    expect(thursday.streak).toBe(1);
  });

  it('unlocks achievements once and only once', async () => {
    const memberId = await member();
    await completeDay(memberId, '2025-09-01');

    const earned = await db
      .select()
      .from(schema.studentAchievements)
      .where(eq(schema.studentAchievements.memberId, memberId));
    expect(earned.some((a) => a.code === 'first_round')).toBe(true);

    const before = earned.length;
    await settleDay({
      memberId,
      date: '2025-09-01',
      calendar: ctx.calendar,
      rules: ctx.rules,
    });
    const after = await db
      .select()
      .from(schema.studentAchievements)
      .where(eq(schema.studentAchievements.memberId, memberId));
    expect(after).toHaveLength(before);
  });

  it('never removes points that were already earned when a later day is missed', async () => {
    const memberId = await member();
    await completeDay(memberId, '2025-09-01');
    const earned = await totalPoints(memberId);

    // Two missed days, then recompute the whole range.
    for (const date of ['2025-09-02', '2025-09-03']) {
      await recomputeDay({ memberId, date, calendar: ctx.calendar, rules: ctx.rules });
    }
    await settleDay({
      memberId,
      date: '2025-09-03',
      calendar: ctx.calendar,
      rules: ctx.rules,
    });

    expect(await totalPoints(memberId)).toBe(earned);
  });
});

describe('check-in uniqueness', () => {
  it('rejects a second check-in row for the same student and day', async () => {
    const memberId = await member();
    const values = {
      memberId,
      date: '2025-09-01',
      completion: 'completed' as const,
      actualMinutes: 90,
      whatStudied: 'Acute inflammation',
      obstacle: 'none' as const,
      satisfaction: 4,
    };

    await db.insert(schema.checkIns).values(values);
    await expect(db.insert(schema.checkIns).values(values)).rejects.toThrow();

    const rows = await db
      .select()
      .from(schema.checkIns)
      .where(eq(schema.checkIns.memberId, memberId));
    expect(rows).toHaveLength(1);
  });

  it('updates in place on conflict, which is how re-submitting works', async () => {
    const memberId = await member();
    const base = {
      memberId,
      date: '2025-09-02',
      completion: 'partial' as const,
      actualMinutes: 30,
      whatStudied: 'Started the chapter',
      obstacle: 'sleep' as const,
      satisfaction: 2,
    };

    await db.insert(schema.checkIns).values(base);
    await db
      .insert(schema.checkIns)
      .values({ ...base, completion: 'completed', actualMinutes: 95, satisfaction: 5 })
      .onConflictDoUpdate({
        target: [schema.checkIns.memberId, schema.checkIns.date],
        set: { completion: 'completed', actualMinutes: 95, satisfaction: 5 },
      });

    const rows = await db
      .select()
      .from(schema.checkIns)
      .where(eq(schema.checkIns.memberId, memberId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.completion).toBe('completed');
    expect(rows[0]?.actualMinutes).toBe(95);
  });
});

describe('attendance', () => {
  it('scores present, late and absent differently', async () => {
    const present = await member();
    const late = await member();
    const absent = await member();

    await awardPoints({
      memberId: present,
      event: 'live_session_present',
      points: ctx.rules.live_session_present,
      occurredOn: '2025-09-01',
      idempotencyKey: ledgerKey.attendance(present, '2025-09-01'),
    });
    await awardPoints({
      memberId: late,
      event: 'live_session_late',
      points: ctx.rules.live_session_late,
      occurredOn: '2025-09-01',
      idempotencyKey: ledgerKey.attendance(late, '2025-09-01'),
    });
    // Absent: no award at all.

    const [p, l, a] = await Promise.all([
      recomputeDay({
        memberId: present,
        date: '2025-09-01',
        calendar: ctx.calendar,
        rules: ctx.rules,
      }),
      recomputeDay({
        memberId: late,
        date: '2025-09-01',
        calendar: ctx.calendar,
        rules: ctx.rules,
      }),
      recomputeDay({
        memberId: absent,
        date: '2025-09-01',
        calendar: ctx.calendar,
        rules: ctx.rules,
      }),
    ]);

    expect(p.score).toBeGreaterThan(l.score);
    expect(l.score).toBeGreaterThan(a.score);
    expect(a.score).toBe(0);
    expect(a.showedUp).toBe(false);
  });

  it('re-cuts attendance points when an admin changes the mark', async () => {
    const memberId = await member();
    const key = ledgerKey.attendance(memberId, '2025-09-01');

    await awardPoints({
      memberId,
      event: 'live_session_present',
      points: 20,
      occurredOn: '2025-09-01',
      idempotencyKey: key,
    });
    expect(await totalPoints(memberId)).toBe(20);

    // Admin corrects it to "late": the old award is withdrawn, a new one issued.
    const { revokeAward } = await import('@/server/scoring');
    await revokeAward(key);
    await awardPoints({
      memberId,
      event: 'live_session_late',
      points: 10,
      occurredOn: '2025-09-01',
      idempotencyKey: key,
    });

    expect(await totalPoints(memberId)).toBe(10);

    const rows = await db
      .select()
      .from(schema.pointsLedger)
      .where(eq(schema.pointsLedger.memberId, memberId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.event).toBe('live_session_late');
  });
});
