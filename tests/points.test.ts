import { describe, expect, it } from 'vitest';

import {
  BEHAVIOUR_EVENTS,
  DEFAULT_POINT_RULES,
  bandForDay,
  behaviourSlot,
  dayScore,
  expectedBehaviours,
  ledgerKey,
  maxDailyBehaviourPoints,
  quizPoints,
  showedUpForDay,
  showedUpOnMarkAlone,
} from '@/lib/domain/points';

const rules = DEFAULT_POINT_RULES;

describe('behaviour scoring', () => {
  it('sums only the behaviour events into the daily maximum', () => {
    // 20 session + 20 block + 15 target + 5 check-in + 10 plan + 10 reflection
    expect(maxDailyBehaviourPoints(rules)).toBe(80);
  });

  it('scores a fully completed day at 1', () => {
    const entries = BEHAVIOUR_EVENTS.map((event) => ({ event, points: rules[event] }));
    expect(dayScore(entries, rules)).toBe(1);
  });

  it('scores an empty day at 0', () => {
    expect(dayScore([], rules)).toBe(0);
  });

  it('scores a partial day proportionally', () => {
    const entries = [
      { event: 'daily_check_in' as const, points: 5 },
      { event: 'tomorrow_plan' as const, points: 10 },
      { event: 'study_block_completed' as const, points: 20 },
    ];
    expect(dayScore(entries, rules)).toBeCloseTo(35 / 80, 5);
  });

  it('treats late attendance as filling the attendance slot at reduced value', () => {
    expect(behaviourSlot('live_session_late')).toBe('live_session_present');
    const late = dayScore([{ event: 'live_session_late', points: 10 }], rules);
    const present = dayScore([{ event: 'live_session_present', points: 20 }], rules);
    expect(late).toBeGreaterThan(0);
    expect(late).toBeLessThan(present);
  });

  it('gives absence zero attendance credit', () => {
    expect(dayScore([], rules)).toBe(0);
  });
});

describe('quiz performance cannot dominate the score', () => {
  it('excludes quiz points from the day score entirely', () => {
    const perfectQuiz = [
      { event: 'quiz_attempt' as const, points: 5 },
      { event: 'quiz_bonus' as const, points: 5 },
    ];
    expect(dayScore(perfectQuiz, rules)).toBe(0);
    expect(behaviourSlot('quiz_attempt')).toBeNull();
    expect(behaviourSlot('quiz_bonus')).toBeNull();
  });

  it('a perfect quiz is worth less than a single study block', () => {
    const { attempt, bonus } = quizPoints(5, 5, rules);
    expect(attempt + bonus).toBeLessThanOrEqual(rules.study_block_completed);
  });

  it('pays for attempting even with a score of zero', () => {
    expect(quizPoints(0, 5, rules)).toEqual({ attempt: 5, bonus: 0 });
  });

  it('scales the bonus with accuracy', () => {
    expect(quizPoints(4, 5, rules).bonus).toBe(4);
    expect(quizPoints(5, 5, rules).bonus).toBe(5);
  });

  it('excludes streak, achievement and admin points from the day score', () => {
    const inflated = [
      { event: 'streak_bonus' as const, points: 100 },
      { event: 'achievement' as const, points: 50 },
      { event: 'admin_adjustment' as const, points: 500 },
    ];
    expect(dayScore(inflated, rules)).toBe(0);
  });
});

describe('day bands', () => {
  it('maps scores to the right band', () => {
    expect(bandForDay(1, true)).toBe('perfect');
    expect(bandForDay(0.8, true)).toBe('strong');
    expect(bandForDay(0.5, true)).toBe('active');
    expect(bandForDay(0.1, true)).toBe('weak');
    expect(bandForDay(0, true)).toBe('missed');
  });

  it('marks an untouched non-active day as a rest day', () => {
    expect(bandForDay(0, false)).toBe('off');
  });

  it('marks a non-active day the student worked as a bonus day', () => {
    // The audit's 18 uncredited student-days: the points were banked all along, and the
    // calendar drew the same empty square as for a weekend spent asleep.
    expect(bandForDay(0.1, false)).toBe('bonus');
    expect(bandForDay(1, false)).toBe('bonus');
  });

  it('never promotes a bonus day into a scoring band', () => {
    // A perfect Sunday is a bonus day, not a perfect day. The distinction is what keeps the
    // consistency denominator from silently growing to include weekends.
    expect(bandForDay(1, false)).not.toBe('perfect');
    expect(bandForDay(1, true)).toBe('perfect');
  });

  it('counts an empty day as not showing up', () => {
    expect(showedUpForDay({ entries: [], verifiedPresence: false })).toBe(false);
  });

  it('counts any student-driven behaviour as showing up', () => {
    expect(
      showedUpForDay({
        entries: [{ event: 'daily_check_in', points: rules.daily_check_in }],
        verifiedPresence: false,
      }),
    ).toBe(true);
  });

  it('lets an admin attendance mark stand in for showing up', () => {
    const marked = [{ event: 'live_session_present', points: rules.live_session_present }] as const;
    expect(showedUpForDay({ entries: marked, verifiedPresence: false })).toBe(true);
    expect(showedUpForDay({ entries: marked, verifiedPresence: true })).toBe(true);
    // The mark counts; the console is told it was only a mark. See `showedUpOnMarkAlone`.
    expect(showedUpOnMarkAlone({ entries: marked, verifiedPresence: false })).toBe(true);
    expect(showedUpOnMarkAlone({ entries: marked, verifiedPresence: true })).toBe(false);
  });

  it('treats a late mark the same way as a present one', () => {
    const late = [{ event: 'live_session_late', points: rules.live_session_late }] as const;
    expect(showedUpForDay({ entries: late, verifiedPresence: false })).toBe(true);
    expect(showedUpForDay({ entries: late, verifiedPresence: true })).toBe(true);
  });

  it('ignores points that are not behaviour, however large', () => {
    expect(
      showedUpForDay({
        entries: [
          { event: 'achievement', points: 100 },
          { event: 'quiz_attempt', points: 25 },
        ],
        verifiedPresence: false,
      }),
    ).toBe(false);
  });

  it('still shows up when attendance is joined by real work', () => {
    expect(
      showedUpForDay({
        entries: [
          { event: 'live_session_present', points: rules.live_session_present },
          { event: 'study_block_completed', points: rules.study_block_completed },
        ],
        verifiedPresence: false,
      }),
    ).toBe(true);
  });
});

describe('idempotency keys', () => {
  it('is stable for the same student and day', () => {
    expect(ledgerKey.daily('daily_check_in', 'm1', '2025-09-01')).toBe(
      ledgerKey.daily('daily_check_in', 'm1', '2025-09-01'),
    );
  });

  it('differs across students, days and events', () => {
    const a = ledgerKey.daily('daily_check_in', 'm1', '2025-09-01');
    expect(a).not.toBe(ledgerKey.daily('daily_check_in', 'm2', '2025-09-01'));
    expect(a).not.toBe(ledgerKey.daily('daily_check_in', 'm1', '2025-09-02'));
    expect(a).not.toBe(ledgerKey.daily('tomorrow_plan', 'm1', '2025-09-01'));
  });

  it('scopes streak bonuses to the milestone so each pays once', () => {
    expect(ledgerKey.streakMilestone('m1', 5)).not.toBe(ledgerKey.streakMilestone('m1', 10));
    expect(ledgerKey.streakMilestone('m1', 5)).toBe(ledgerKey.streakMilestone('m1', 5));
  });

  it('scopes quiz points per quiz per day', () => {
    expect(ledgerKey.quizAttempt('m1', 'q1', '2025-09-01')).not.toBe(
      ledgerKey.quizAttempt('m1', 'q2', '2025-09-01'),
    );
  });
});

describe('the denominator is what the cohort actually asks for', () => {
  it('drops the study-room slot for a cohort that has no room', () => {
    const expected = expectedBehaviours({ hasStudyRoom: false });
    expect(expected).not.toContain('live_session_present');
    expect(maxDailyBehaviourPoints(rules, expected)).toBe(60);
  });

  it('keeps all six for a cohort that runs a room', () => {
    const expected = expectedBehaviours({ hasStudyRoom: true });
    expect(expected).toEqual([...BEHAVIOUR_EVENTS]);
    expect(maxDailyBehaviourPoints(rules, expected)).toBe(80);
  });

  it('lets a student of a roomless cohort still reach a perfect day', () => {
    // The bug this fixes: marked out of 80 with only 60 obtainable, a student who did
    // everything asked of them scored 75% — and 40% intervention was 35 points away.
    const expected = expectedBehaviours({ hasStudyRoom: false });
    const entries = expected.map((event) => ({ event, points: rules[event] }));
    expect(dayScore(entries, rules)).toBeCloseTo(60 / 80, 5);
    expect(dayScore(entries, rules, { expected })).toBe(1);
  });

  it('honours a cohort lead narrowing the set', () => {
    const expected = expectedBehaviours({
      hasStudyRoom: true,
      override: ['live_session_present', 'daily_check_in'],
    });
    expect(expected).toEqual(['live_session_present', 'daily_check_in']);
    expect(maxDailyBehaviourPoints(rules, expected)).toBe(25);
  });

  it('never lets an override add back a behaviour the cohort cannot run', () => {
    const expected = expectedBehaviours({
      hasStudyRoom: false,
      override: ['live_session_present', 'daily_check_in'],
    });
    expect(expected).toEqual(['daily_check_in']);
  });

  it('falls back to the derived set when the override is empty', () => {
    expect(expectedBehaviours({ hasStudyRoom: true, override: [] })).toEqual([...BEHAVIOUR_EVENTS]);
  });

  it('still caps at 1 when a student does more than was asked', () => {
    const expected = expectedBehaviours({
      hasStudyRoom: true,
      override: ['daily_check_in'],
    });
    const entries = BEHAVIOUR_EVENTS.map((event) => ({ event, points: rules[event] }));
    expect(dayScore(entries, rules, { expected })).toBe(1);
  });
});

describe('verified study-room presence fills the attendance slot', () => {
  it('scores a presence-only day as attendance, not as nothing', () => {
    // `showedUpForDay` has always accepted presence on its own. The score did not, so the
    // same day read as "showed up" and "0%" at once.
    expect(showedUpForDay({ entries: [], verifiedPresence: true })).toBe(true);
    expect(dayScore([], rules)).toBe(0);
    expect(dayScore([], rules, { verifiedPresence: true })).toBeCloseTo(20 / 80, 5);
  });

  it('does not pay the slot twice when the join was already scored', () => {
    const scored = [{ event: 'live_session_present' as const, points: 20 }];
    expect(dayScore(scored, rules, { verifiedPresence: true })).toBeCloseTo(20 / 80, 5);
  });

  it('leaves a late arrival at its reduced value', () => {
    const late = [{ event: 'live_session_late' as const, points: 10 }];
    expect(dayScore(late, rules, { verifiedPresence: true })).toBeCloseTo(10 / 80, 5);
  });

  it('credits nothing where the cohort has no room to attend', () => {
    const expected = expectedBehaviours({ hasStudyRoom: false });
    expect(dayScore([], rules, { expected, verifiedPresence: true })).toBe(0);
  });

  it('lifts a study-room-plus-check-in day off the intervention floor', () => {
    /*
     * The 2026-09-09 members list: students doing the study room and the check-in and
     * nothing else scored 25/80 = 31%, under the 40% floor, every single day — so the
     * whole cohort read `needs_intervention` while attending daily.
     */
    const checkInOnly = [{ event: 'daily_check_in' as const, points: 5 }];
    expect(dayScore(checkInOnly, rules)).toBeCloseTo(5 / 80, 5);

    const expected = expectedBehaviours({
      hasStudyRoom: true,
      override: ['live_session_present', 'daily_check_in', 'study_block_completed'],
    });
    const score = dayScore(checkInOnly, rules, { expected, verifiedPresence: true });
    expect(score).toBeCloseTo(25 / 45, 5);
    expect(score).toBeGreaterThan(0.4);
  });
});
