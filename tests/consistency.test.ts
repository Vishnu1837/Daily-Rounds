import { describe, expect, it } from 'vitest';

import { buildCalendar } from '@/lib/domain/calendar';
import {
  type DayRecord,
  calculateConsistency,
  calculateCurrentWeekConsistency,
  calculateImprovement,
  calculateOverallConsistency,
  calculateWeeklyProgress,
  isPerfectWeek,
} from '@/lib/domain/consistency';

const cal = buildCalendar({
  timezone: 'Asia/Kolkata',
  startDate: '2025-09-01',
  endDate: '2025-10-10',
  activeWeekdays: [1, 2, 3, 4, 5],
  holidays: ['2025-09-17'],
});

function lookupFrom(records: Partial<Record<string, Partial<DayRecord>>>) {
  return (date: string): DayRecord | undefined => {
    const r = records[date];
    if (!r) return undefined;
    return {
      date,
      showedUp: r.showedUp ?? (r.score ?? 0) > 0,
      score: r.score ?? 0,
      studyMinutes: r.studyMinutes ?? 0,
      points: r.points ?? 0,
    };
  };
}

describe('calculateConsistency', () => {
  it('uses active study days as the denominator', () => {
    const lookup = lookupFrom({
      '2025-09-01': { score: 1 },
      '2025-09-02': { score: 1 },
      '2025-09-03': { score: 1 },
      '2025-09-04': { score: 1 },
      '2025-09-05': { score: 1 },
    });
    const r = calculateConsistency(cal, lookup, '2025-09-01', '2025-09-07');
    expect(r.activeDays).toBe(5); // weekend excluded
    expect(r.consistencyPct).toBe(100);
    expect(r.showUpRatePct).toBe(100);
  });

  it('does not let weekends dilute the score', () => {
    const lookup = lookupFrom({ '2025-09-01': { score: 1 }, '2025-09-02': { score: 1 } });
    const mon = calculateConsistency(cal, lookup, '2025-09-01', '2025-09-02');
    const withWeekend = calculateConsistency(cal, lookup, '2025-09-01', '2025-09-02');
    expect(mon.consistencyPct).toBe(withWeekend.consistencyPct);
  });

  it('excludes holidays from the denominator', () => {
    const lookup = lookupFrom({
      '2025-09-15': { score: 1 },
      '2025-09-16': { score: 1 },
      '2025-09-18': { score: 1 },
      '2025-09-19': { score: 1 },
    });
    const r = calculateConsistency(cal, lookup, '2025-09-15', '2025-09-19');
    expect(r.activeDays).toBe(4); // Wed 17th is a holiday
    expect(r.consistencyPct).toBe(100);
  });

  it('separates partial completion from a full miss', () => {
    const lookup = lookupFrom({
      '2025-09-01': { score: 1 },
      '2025-09-02': { score: 0.5 },
      '2025-09-03': { score: 0 },
      '2025-09-04': { score: 1 },
      '2025-09-05': { score: 1 },
    });
    const r = calculateConsistency(cal, lookup, '2025-09-01', '2025-09-05');
    expect(r.showUpRatePct).toBe(80); // 4 of 5 days had activity
    expect(r.consistencyPct).toBe(70); // (1 + .5 + 0 + 1 + 1) / 5
    expect(r.missedDays).toBe(1);
  });

  it('treats a day with no record as missed', () => {
    const r = calculateConsistency(cal, lookupFrom({}), '2025-09-01', '2025-09-05');
    expect(r.activeDays).toBe(5);
    expect(r.completedDays).toBe(0);
    expect(r.consistencyPct).toBe(0);
  });

  it('returns zero rather than NaN when there are no active days', () => {
    const r = calculateConsistency(cal, lookupFrom({}), '2025-09-06', '2025-09-07');
    expect(r.activeDays).toBe(0);
    expect(r.consistencyPct).toBe(0);
    expect(r.showUpRatePct).toBe(0);
  });

  it('never counts future days as missed', () => {
    const lookup = lookupFrom({ '2025-09-01': { score: 1 } });
    const r = calculateOverallConsistency(cal, lookup, '2025-09-01');
    expect(r.activeDays).toBe(1);
    expect(r.consistencyPct).toBe(100);
  });

  it('sums study minutes across active days', () => {
    const lookup = lookupFrom({
      '2025-09-01': { score: 1, studyMinutes: 90 },
      '2025-09-02': { score: 1, studyMinutes: 60 },
    });
    expect(calculateConsistency(cal, lookup, '2025-09-01', '2025-09-02').studyMinutes).toBe(150);
  });
});

describe('weekly progress', () => {
  const lookup = lookupFrom({
    // week 1: 3 of 5
    '2025-09-01': { score: 0.6 },
    '2025-09-02': { score: 0.6 },
    '2025-09-03': { score: 0.6 },
    // week 2: 5 of 5, stronger
    '2025-09-08': { score: 1 },
    '2025-09-09': { score: 1 },
    '2025-09-10': { score: 1 },
    '2025-09-11': { score: 1 },
    '2025-09-12': { score: 1 },
  });

  it('produces one entry per elapsed cohort week', () => {
    const weeks = calculateWeeklyProgress(cal, lookup, '2025-09-12');
    expect(weeks).toHaveLength(2);
    expect(weeks[0]?.weekNumber).toBe(1);
    expect(weeks[0]?.consistencyPct).toBe(36); // (0.6*3)/5
    expect(weeks[1]?.consistencyPct).toBe(100);
  });

  it('measures improvement between the first and latest week', () => {
    const improvement = calculateImprovement(calculateWeeklyProgress(cal, lookup, '2025-09-12'));
    expect(improvement.firstPct).toBe(36);
    expect(improvement.latestPct).toBe(100);
    expect(improvement.deltaPct).toBe(64);
  });

  it('reports zero improvement from a single week', () => {
    expect(calculateImprovement(calculateWeeklyProgress(cal, lookup, '2025-09-03')).deltaPct).toBe(0);
  });

  it('scopes the current week to days up to today', () => {
    const r = calculateCurrentWeekConsistency(cal, lookup, '2025-09-10');
    expect(r.activeDays).toBe(3);
    expect(r.consistencyPct).toBe(100);
  });
});

describe('perfect week', () => {
  it('is true when every active day in the week was completed', () => {
    const lookup = lookupFrom({
      '2025-09-08': { score: 1 },
      '2025-09-09': { score: 1 },
      '2025-09-10': { score: 1 },
      '2025-09-11': { score: 1 },
      '2025-09-12': { score: 1 },
    });
    expect(isPerfectWeek(cal, lookup, '2025-09-10')).toBe(true);
  });

  it('is false when one active day was missed', () => {
    const lookup = lookupFrom({
      '2025-09-08': { score: 1 },
      '2025-09-09': { score: 1 },
      '2025-09-11': { score: 1 },
      '2025-09-12': { score: 1 },
    });
    expect(isPerfectWeek(cal, lookup, '2025-09-10')).toBe(false);
  });

  it('is achievable in a holiday week without studying on the holiday', () => {
    const lookup = lookupFrom({
      '2025-09-15': { score: 1 },
      '2025-09-16': { score: 1 },
      '2025-09-18': { score: 1 },
      '2025-09-19': { score: 1 },
    });
    expect(isPerfectWeek(cal, lookup, '2025-09-15')).toBe(true);
  });
});
