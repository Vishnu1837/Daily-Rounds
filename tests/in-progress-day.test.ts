import { describe, expect, it } from 'vitest';

import { buildCalendar } from '@/lib/domain/calendar';
import { displayBand } from '@/lib/domain/points';
import {
  type DayRecord,
  calculateConsistency,
  calculateImprovement,
  calculateOverallConsistency,
  calculateWeeklyProgress,
  isPerfectWeek,
  isSettledWeek,
} from '@/lib/domain/consistency';

/**
 * The day a student is still living is not a day they have failed.
 *
 * Two bugs reported from the live cohort, one root cause. Both are reproduced here with the
 * real numbers before the rule that fixes them is asserted, so a regression shows up as the
 * students' own complaint rather than as an abstract assertion.
 *
 * The streak engine has always worked this way — ADR-005, "a day in progress is not a miss".
 * Consistency simply never had the same rule applied to it.
 */

/** Cohort 01 as it actually ran: opens Wed 2 Sep 2026, Mon–Fri. */
const cal = buildCalendar({
  timezone: 'Asia/Kolkata',
  startDate: '2026-09-02',
  endDate: '2026-09-30',
  activeWeekdays: [1, 2, 3, 4, 5],
});

function lookupFrom(records: Record<string, number>) {
  return (date: string): DayRecord | undefined => {
    const score = records[date];
    if (score === undefined) return undefined;
    return { date, showedUp: score > 0, score, studyMinutes: 60, points: 0 };
  };
}

/** The reporting student: three settled days averaging 89%. */
const REPORTER = {
  '2026-09-02': 0.89,
  '2026-09-03': 0.89,
  '2026-09-04': 0.89,
};

describe('"yesterday it showed 89% and now it is 67%"', () => {
  it('holds the number steady when a new day opens with nothing on it', () => {
    const lookup = lookupFrom(REPORTER);

    // Friday evening, three days settled.
    const friday = calculateOverallConsistency(cal, lookup, '2026-09-04', {
      inProgress: '2026-09-04',
    });

    // Monday morning. Nothing has happened yet; nothing about the record has changed.
    const monday = calculateOverallConsistency(cal, lookup, '2026-09-07', {
      inProgress: '2026-09-07',
    });

    expect(monday.consistencyPct).toBe(friday.consistencyPct);
    expect(monday.activeDays).toBe(3);
  });

  it('reproduces the old arithmetic exactly, so the regression is recognisable', () => {
    // Without the exclusion, Monday enters the denominator as a zero the moment it begins:
    // 0.89 x 3 / 4 = 66.75 -> 67%. This is the number the student was shown.
    const withoutRule = calculateOverallConsistency(cal, lookupFrom(REPORTER), '2026-09-07');
    expect(withoutRule.consistencyPct).toBe(67);
    expect(withoutRule.activeDays).toBe(4);
  });

  it('counts the day once it is over, whichever way it went', () => {
    const lookup = lookupFrom({ ...REPORTER, '2026-09-07': 0.25 });

    // Monday, still in progress at 25%: the average is untouched.
    expect(
      calculateOverallConsistency(cal, lookup, '2026-09-07', { inProgress: '2026-09-07' })
        .consistencyPct,
    ).toBe(89);

    // Tuesday: Monday is now part of the record, and it costs them.
    expect(
      calculateOverallConsistency(cal, lookup, '2026-09-08', { inProgress: '2026-09-08' })
        .consistencyPct,
    ).toBe(73); // (0.89 x 3 + 0.25) / 4
  });

  it('still counts minutes as they happen', () => {
    // Minutes are a fact that accrues, not a judgement waiting on the day to end. A student
    // who has just studied for an hour must see that hour.
    const result = calculateOverallConsistency(
      cal,
      lookupFrom({ ...REPORTER, '2026-09-07': 0.25 }),
      '2026-09-07',
      { inProgress: '2026-09-07' },
    );
    expect(result.activeDays).toBe(3);
    expect(result.studyMinutes).toBe(240); // three settled days plus today's
  });
});

describe('the admin "improvement" column reading -89% for everyone', () => {
  /** Week 1 is the cohort's three opening days; week 2 is one unfinished Monday. */
  const weeksOn = (today: string, records: Record<string, number>) =>
    calculateWeeklyProgress(cal, lookupFrom(records), today, { inProgress: today });

  it('reports no comparison from a single week of data', () => {
    const improvement = calculateImprovement(weeksOn('2026-09-07', REPORTER));

    expect(improvement.comparable).toBe(false);
    expect(improvement.deltaPct).toBe(0);
  });

  it('reproduces the old fallback, which subtracted week one from an unfinished Monday', () => {
    // The bug: fewer than two representative weeks fell back to comparing the ones that were
    // not representative — so every student's improvement was minus their week-one score,
    // which is the column of -89%, -75%, -74% the cohort lead was looking at.
    const weeks = calculateWeeklyProgress(cal, lookupFrom(REPORTER), '2026-09-07');
    const weekOne = weeks[0]!;
    const weekTwo = weeks[1]!;

    expect(weekOne.consistencyPct).toBe(89);
    expect(weekTwo.consistencyPct).toBe(0);
    expect(weekTwo.consistencyPct - weekOne.consistencyPct).toBe(-89);

    // And the rule that now prevents it reaching anyone.
    expect(calculateImprovement(weeks.filter((w) => isSettledWeek(w, '2026-09-07')))).toMatchObject(
      { comparable: false, deltaPct: 0 },
    );
  });

  it('appears partway through week two, not a week later', () => {
    // The number must reflect the week the student is actually in. Requiring both weeks to
    // have *finished* would lag a full week behind their own effort.
    const records: Record<string, number> = {};
    for (const d of ['2026-09-02', '2026-09-03', '2026-09-04']) records[d] = 0.5;
    for (const d of ['2026-09-07', '2026-09-08', '2026-09-09']) records[d] = 0.9;

    // Thursday of week two: Mon-Wed have settled, so week two is a fair sample at last.
    const thursday = calculateImprovement(weeksOn('2026-09-10', records));
    expect(thursday.comparable).toBe(true);
    expect(thursday.deltaPct).toBe(40);

    // Wednesday, with only two settled days, is still too little to compare.
    expect(calculateImprovement(weeksOn('2026-09-09', records)).comparable).toBe(false);
  });

  it('compares once two finished weeks exist', () => {
    const records: Record<string, number> = {};
    for (const d of ['2026-09-02', '2026-09-03', '2026-09-04']) records[d] = 0.5;
    for (const d of ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']) {
      records[d] = 0.9;
    }

    // Monday of week 3: both previous weeks have finished.
    const weeks = weeksOn('2026-09-14', records).filter((w) => isSettledWeek(w, '2026-09-14'));
    const improvement = calculateImprovement(weeks);

    expect(improvement.comparable).toBe(true);
    expect(improvement.firstPct).toBe(50);
    expect(improvement.latestPct).toBe(90);
    expect(improvement.deltaPct).toBe(40);
  });
});

describe('a week cannot be judged from inside it', () => {
  it('is not a perfect week on Tuesday because Monday went well', () => {
    const lookup = lookupFrom({ '2026-09-07': 1 });
    expect(isPerfectWeek(cal, lookup, '2026-09-08', { inProgress: '2026-09-08' })).toBe(false);
  });

  it('is a perfect week once the week has ended', () => {
    const lookup = lookupFrom({
      '2026-09-07': 1,
      '2026-09-08': 1,
      '2026-09-09': 1,
      '2026-09-10': 1,
      '2026-09-11': 1,
    });
    expect(isPerfectWeek(cal, lookup, '2026-09-07', { inProgress: '2026-09-14' })).toBe(true);
  });

  it('isSettledWeek is false for the week holding the in-progress day', () => {
    const weeks = calculateWeeklyProgress(cal, lookupFrom(REPORTER), '2026-09-07', {
      inProgress: '2026-09-07',
    });
    expect(weeks.map((w) => isSettledWeek(w, '2026-09-07'))).toEqual([true, false]);
  });
});

describe('the exclusion is scoped to the day that is actually in progress', () => {
  it('leaves a window entirely in the past alone', () => {
    const lookup = lookupFrom(REPORTER);
    const past = calculateConsistency(cal, lookup, '2026-09-02', '2026-09-04', {
      inProgress: '2026-09-07',
    });
    expect(past.activeDays).toBe(3);
    expect(past.consistencyPct).toBe(89);
  });

  it('behaves exactly as before when no in-progress day is given', () => {
    const lookup = lookupFrom(REPORTER);
    expect(calculateConsistency(cal, lookup, '2026-09-02', '2026-09-04')).toEqual(
      calculateConsistency(cal, lookup, '2026-09-02', '2026-09-04', { inProgress: null }),
    );
  });
});

describe('today is not painted as a failure before it has happened', () => {
  it('shows an untouched active day as a rest square while it is still today', () => {
    // `recomputeRange` writes a daily_activity row for today, so after an admin pressed
    // Recalculate every student had a stored `missed` band for a day that had barely begun —
    // and the calendar drew it red.
    expect(displayBand('missed', true)).toBe('off');
  });

  it('still marks it missed once the day is over', () => {
    expect(displayBand('missed', false)).toBe('missed');
  });

  it('leaves every other band alone, so a day fills in as it is worked through', () => {
    for (const band of ['perfect', 'strong', 'active', 'weak', 'off', 'bonus'] as const) {
      expect(displayBand(band, true)).toBe(band);
      expect(displayBand(band, false)).toBe(band);
    }
  });
});
