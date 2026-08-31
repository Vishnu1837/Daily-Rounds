import { describe, expect, it } from 'vitest';

import {
  activeStudyDaysBetween,
  addDays,
  buildCalendar,
  cohortWeekNumber,
  diffDays,
  formatInTimezone,
  isActiveStudyDay,
  isoWeekday,
  nextActiveStudyDay,
  previousActiveStudyDay,
  timeInTimezone,
  todayInTimezone,
  weekEnd,
  weekStart,
} from '@/lib/domain/calendar';

const cal = buildCalendar({
  timezone: 'Asia/Kolkata',
  startDate: '2025-09-01', // Monday
  endDate: '2025-10-10',
  activeWeekdays: [1, 2, 3, 4, 5],
  holidays: ['2025-09-17'], // Wednesday
  extraStudyDays: ['2025-09-20'], // Saturday
});

describe('date arithmetic', () => {
  it('adds and diffs days without drift', () => {
    expect(addDays('2025-09-01', 1)).toBe('2025-09-02');
    expect(addDays('2025-09-30', 1)).toBe('2025-10-01');
    expect(addDays('2025-01-01', -1)).toBe('2024-12-31');
    expect(diffDays('2025-09-01', '2025-09-08')).toBe(7);
  });

  it('crosses a leap day correctly', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
  });

  it('is immune to daylight-saving transitions', () => {
    // US DST spring-forward 2025-03-09, fall-back 2025-11-02.
    expect(addDays('2025-03-08', 1)).toBe('2025-03-09');
    expect(addDays('2025-03-09', 1)).toBe('2025-03-10');
    expect(diffDays('2025-03-08', '2025-03-10')).toBe(2);
    expect(addDays('2025-11-01', 1)).toBe('2025-11-02');
    expect(diffDays('2025-11-01', '2025-11-03')).toBe(2);
  });

  it('computes ISO weekdays and week bounds', () => {
    expect(isoWeekday('2025-09-01')).toBe(1); // Monday
    expect(isoWeekday('2025-09-07')).toBe(7); // Sunday
    expect(weekStart('2025-09-04')).toBe('2025-09-01');
    expect(weekStart('2025-09-07')).toBe('2025-09-01');
    expect(weekEnd('2025-09-01')).toBe('2025-09-07');
  });
});

describe('timezone handling', () => {
  it('resolves the civil date in the cohort timezone, not the host timezone', () => {
    // 2025-09-01T19:30Z is already 2025-09-02 in Kolkata (+05:30).
    const instant = new Date('2025-09-01T19:30:00Z');
    expect(formatInTimezone(instant, 'Asia/Kolkata')).toBe('2025-09-02');
    expect(formatInTimezone(instant, 'UTC')).toBe('2025-09-01');
    expect(formatInTimezone(instant, 'America/New_York')).toBe('2025-09-01');
  });

  it('handles the midnight boundary in both directions', () => {
    expect(formatInTimezone(new Date('2025-09-01T18:29:59Z'), 'Asia/Kolkata')).toBe('2025-09-01');
    expect(formatInTimezone(new Date('2025-09-01T18:30:00Z'), 'Asia/Kolkata')).toBe('2025-09-02');
    expect(formatInTimezone(new Date('2025-09-02T03:59:00Z'), 'America/New_York')).toBe('2025-09-01');
    expect(formatInTimezone(new Date('2025-09-02T04:00:00Z'), 'America/New_York')).toBe('2025-09-02');
  });

  it('reports wall-clock time in the cohort timezone', () => {
    expect(timeInTimezone('Asia/Kolkata', new Date('2025-09-01T00:30:00Z'))).toBe('06:00');
  });

  it('todayInTimezone agrees with formatInTimezone', () => {
    const now = new Date('2025-09-01T19:30:00Z');
    expect(todayInTimezone('Asia/Kolkata', now)).toBe(formatInTimezone(now, 'Asia/Kolkata'));
  });
});

describe('active study days', () => {
  it('counts weekdays inside the cohort', () => {
    expect(isActiveStudyDay(cal, '2025-09-02')).toBe(true);
  });

  it('excludes weekends', () => {
    expect(isActiveStudyDay(cal, '2025-09-06')).toBe(false); // Saturday
    expect(isActiveStudyDay(cal, '2025-09-07')).toBe(false); // Sunday
  });

  it('excludes holidays', () => {
    expect(isActiveStudyDay(cal, '2025-09-17')).toBe(false);
  });

  it('includes explicitly added extra study days even on a weekend', () => {
    expect(isActiveStudyDay(cal, '2025-09-20')).toBe(true);
  });

  it('excludes dates outside the cohort range', () => {
    expect(isActiveStudyDay(cal, '2025-08-29')).toBe(false); // Friday before start
    expect(isActiveStudyDay(cal, '2025-10-13')).toBe(false); // Monday after end
  });

  it('walks backwards from Monday to the previous Friday', () => {
    expect(previousActiveStudyDay(cal, '2025-09-08')).toBe('2025-09-05');
  });

  it('skips a holiday when walking backwards', () => {
    // Wed 17th is a holiday, so Thu 18th's predecessor is Tue 16th.
    expect(previousActiveStudyDay(cal, '2025-09-18')).toBe('2025-09-16');
  });

  it('returns null before the cohort begins', () => {
    expect(previousActiveStudyDay(cal, '2025-09-01')).toBeNull();
  });

  it('walks forwards across a weekend', () => {
    expect(nextActiveStudyDay(cal, '2025-09-05')).toBe('2025-09-08');
  });

  it('lists active days in a range, clamped to the cohort', () => {
    const days = activeStudyDaysBetween(cal, '2025-09-01', '2025-09-07');
    expect(days).toEqual([
      '2025-09-01',
      '2025-09-02',
      '2025-09-03',
      '2025-09-04',
      '2025-09-05',
    ]);
    expect(activeStudyDaysBetween(cal, '2025-08-01', '2025-09-02')).toEqual([
      '2025-09-01',
      '2025-09-02',
    ]);
  });

  it('numbers cohort weeks from the first week', () => {
    expect(cohortWeekNumber(cal, '2025-09-01')).toBe(1);
    expect(cohortWeekNumber(cal, '2025-09-07')).toBe(1);
    expect(cohortWeekNumber(cal, '2025-09-08')).toBe(2);
  });
});
