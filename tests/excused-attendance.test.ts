/**
 * A hand-marked present is neither a show-up nor a miss.
 *
 * The rule from 0014 — an admin attendance mark cannot, on its own, assert that a student
 * was in the room — was applied to a predicate that the streak engine, the missed-day
 * counter and risk detection all read. So it did not merely withhold credit for a
 * hand-marked day; it counted the day against the student. On the morning this was found,
 * 7 of the 23 students a cohort lead had marked present or late were recorded as not having
 * shown up, and two were filed under "needs intervention" for it.
 *
 * These tests pin both halves: the day still earns nothing, and it still costs nothing.
 */
import { describe, expect, it } from 'vitest';

import { buildCalendar } from '@/lib/domain/calendar';
import { type DayRecord, calculateConsistency } from '@/lib/domain/consistency';
import { attendanceExcusedForDay, showedUpForDay } from '@/lib/domain/points';
import { calculateRiskStatus } from '@/lib/domain/risk';
import {
  calculateBestStreak,
  calculateCohortStreak,
  calculateCurrentStreak,
  consecutiveMissedActiveDays,
} from '@/lib/domain/streak';

/** Mon 2025-09-01 → Fri 2025-10-10, weekdays only. */
const cal = buildCalendar({
  timezone: 'Asia/Kolkata',
  startDate: '2025-09-01',
  endDate: '2025-10-10',
  activeWeekdays: [1, 2, 3, 4, 5],
});

const on = (dates: string[]) => (d: string) => dates.includes(d);

const ADMIN_MARK = [{ event: 'live_session_present' as const, points: 20 }];
const CHECK_IN = [{ event: 'daily_check_in' as const, points: 10 }];

describe('attendanceExcusedForDay', () => {
  it('excuses a hand-marked present the room did not corroborate', () => {
    const args = { entries: ADMIN_MARK, verifiedPresence: false };
    expect(showedUpForDay(args)).toBe(false);
    expect(attendanceExcusedForDay(args)).toBe(true);
  });

  it('does not excuse a verified join — that is a real show-up', () => {
    const args = { entries: ADMIN_MARK, verifiedPresence: true };
    expect(showedUpForDay(args)).toBe(true);
    expect(attendanceExcusedForDay(args)).toBe(false);
  });

  it('does not excuse a day the student worked under their own steam', () => {
    const args = { entries: [...ADMIN_MARK, ...CHECK_IN], verifiedPresence: false };
    expect(showedUpForDay(args)).toBe(true);
    expect(attendanceExcusedForDay(args)).toBe(false);
  });

  it('does not excuse a day marked absent — that judgement still counts as a miss', () => {
    // Marking absent pays nothing, so there is no attendance award on the day.
    const args = { entries: [], verifiedPresence: false };
    expect(showedUpForDay(args)).toBe(false);
    expect(attendanceExcusedForDay(args)).toBe(false);
  });
});

describe('streaks step over an excused day', () => {
  it('does not break a streak', () => {
    const showedUp = on(['2025-09-01', '2025-09-02', '2025-09-04', '2025-09-05']);
    const excused = on(['2025-09-03']);

    expect(calculateCurrentStreak(cal, showedUp, '2025-09-05').length).toBe(2);
    expect(calculateCurrentStreak(cal, showedUp, '2025-09-05', excused).length).toBe(4);
  });

  it('does not extend one either — no credit, no penalty', () => {
    const showedUp = on(['2025-09-04', '2025-09-05']);
    const excused = on(['2025-09-03']);
    expect(calculateCurrentStreak(cal, showedUp, '2025-09-05', excused).length).toBe(2);
  });

  it('carries the same rule into the best streak', () => {
    const showedUp = on(['2025-09-01', '2025-09-02', '2025-09-04']);
    const excused = on(['2025-09-03']);
    expect(calculateBestStreak(cal, showedUp, '2025-09-05').length).toBe(2);
    expect(calculateBestStreak(cal, showedUp, '2025-09-05', excused).length).toBe(3);
  });

  it('is not a miss today either', () => {
    const showedUp = on(['2025-09-05']);
    const excused = on(['2025-09-08', '2025-09-09', '2025-09-10']);
    expect(calculateCurrentStreak(cal, showedUp, '2025-09-11', excused).length).toBe(1);
  });
});

describe('missed-day counting', () => {
  it('does not count an excused day as missed', () => {
    const showedUp = on(['2025-09-01']);
    const excused = on(['2025-09-02', '2025-09-03', '2025-09-04']);
    expect(consecutiveMissedActiveDays(cal, showedUp, '2025-09-05')).toBe(3);
    expect(consecutiveMissedActiveDays(cal, showedUp, '2025-09-05', excused)).toBe(0);
  });

  it('still counts a genuinely absent day', () => {
    const showedUp = on(['2025-09-01']);
    const excused = on(['2025-09-02']);
    expect(consecutiveMissedActiveDays(cal, showedUp, '2025-09-05', excused)).toBe(2);
  });
});

describe('risk detection', () => {
  const lookupFrom =
    (excusedDays: string[], showed: string[]) =>
    (date: string): DayRecord | undefined => {
      if (excusedDays.includes(date))
        return { date, showedUp: false, excused: true, score: 0.4, studyMinutes: 0, points: 20 };
      if (showed.includes(date))
        return { date, showedUp: true, score: 1, studyMinutes: 60, points: 50 };
      return undefined;
    };

  /** The exact shape of the 2026-09-07 report: three days a lead confirmed, flagged red. */
  it('does not flag a student for days a cohort lead marked them present', () => {
    const showed = ['2025-09-01', '2025-09-02'];
    const excusedDays = ['2025-09-03', '2025-09-04', '2025-09-05'];
    const lookup = lookupFrom(excusedDays, showed);
    const showedUp = on(showed);
    const excused = on(excusedDays);

    const before = calculateRiskStatus({ calendar: cal, lookup, showedUp, today: '2025-09-08' });
    expect(before.level).toBe('needs_intervention');
    expect(before.reasons[0]).toBe('Missed 3 consecutive study days');

    const after = calculateRiskStatus({
      calendar: cal,
      lookup,
      showedUp,
      excused,
      today: '2025-09-08',
    });
    expect(after.level).toBe('on_track');
    expect(after.missedActiveDays).toBe(0);
  });
});

describe('consistency', () => {
  it('leaves an excused day out of both the numerator and the denominator', () => {
    const lookup = (date: string): DayRecord | undefined =>
      date === '2025-09-03'
        ? { date, showedUp: false, excused: true, score: 0.4, studyMinutes: 30, points: 20 }
        : { date, showedUp: true, score: 1, studyMinutes: 60, points: 50 };

    const r = calculateConsistency(cal, lookup, '2025-09-01', '2025-09-05');
    expect(r.activeDays).toBe(4);
    expect(r.missedDays).toBe(0);
    expect(r.consistencyPct).toBe(100);
    // Minutes are a fact that happened, so they still count.
    expect(r.studyMinutes).toBe(4 * 60 + 30);
  });
});

describe('cohort streak', () => {
  it('excuses hand-marked students out of the denominator rather than counting them absent', () => {
    // 25 students: 15 verified, 7 marked present by hand, 3 genuinely absent.
    const turnout = () => ({ showedUp: 15, total: 25 - 7 });
    expect(calculateCohortStreak(cal, turnout, 55, '2025-09-05').length).toBeGreaterThan(0);

    // Without the exclusion the same day reads 60% and the streak dies at an 84% threshold.
    const naive = () => ({ showedUp: 15, total: 25 });
    expect(calculateCohortStreak(cal, naive, 84, '2025-09-05').length).toBe(0);
  });
});
