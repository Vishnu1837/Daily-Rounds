import { describe, expect, it } from 'vitest';

import {
  BEHAVIOUR_EVENTS,
  DEFAULT_POINT_RULES,
  bandForDay,
  behaviourSlot,
  dayScore,
  ledgerKey,
  maxDailyBehaviourPoints,
  quizPoints,
  showedUpFromScore,
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

  it('marks non-active days as rest days regardless of score', () => {
    expect(bandForDay(0, false)).toBe('off');
    expect(bandForDay(1, false)).toBe('off');
  });

  it('counts any activity as showing up', () => {
    expect(showedUpFromScore(0)).toBe(false);
    expect(showedUpFromScore(0.05)).toBe(true);
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
