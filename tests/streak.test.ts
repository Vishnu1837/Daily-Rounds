import { describe, expect, it } from 'vitest';

import { buildCalendar } from '@/lib/domain/calendar';
import {
  calculateBestStreak,
  calculateCohortStreak,
  calculateComebackState,
  calculateCurrentStreak,
  consecutiveMissedActiveDays,
  milestoneBonusPoints,
  nextMilestone,
  reachedMilestone,
} from '@/lib/domain/streak';

/** Mon 2025-09-01 → Fri 2025-10-10. Wed 17 Sep is a cohort holiday. */
const cal = buildCalendar({
  timezone: 'Asia/Kolkata',
  startDate: '2025-09-01',
  endDate: '2025-10-10',
  activeWeekdays: [1, 2, 3, 4, 5],
  holidays: ['2025-09-17'],
});

const showedUpOn = (dates: string[]) => (d: string) => dates.includes(d);

describe('calculateCurrentStreak', () => {
  it('counts consecutive weekdays', () => {
    const dates = ['2025-09-01', '2025-09-02', '2025-09-03'];
    expect(calculateCurrentStreak(cal, showedUpOn(dates), '2025-09-03').length).toBe(3);
  });

  it('carries a streak across the weekend: Friday → Monday is 6', () => {
    const dates = [
      '2025-09-01',
      '2025-09-02',
      '2025-09-03',
      '2025-09-04',
      '2025-09-05', // Friday
      '2025-09-08', // Monday
    ];
    const result = calculateCurrentStreak(cal, showedUpOn(dates), '2025-09-08');
    expect(result.length).toBe(6);
    expect(result.startedOn).toBe('2025-09-01');
    expect(result.lastDay).toBe('2025-09-08');
  });

  it('does not break over a weekend when evaluated on the weekend itself', () => {
    const dates = ['2025-09-04', '2025-09-05'];
    // Sunday: last active day was Friday, which was completed.
    expect(calculateCurrentStreak(cal, showedUpOn(dates), '2025-09-07').length).toBe(2);
  });

  it('carries a streak across a cohort holiday', () => {
    // Tue 16 → holiday Wed 17 → Thu 18.
    const dates = ['2025-09-15', '2025-09-16', '2025-09-18'];
    expect(calculateCurrentStreak(cal, showedUpOn(dates), '2025-09-18').length).toBe(3);
  });

  it('carries a streak across multiple consecutive holidays', () => {
    const multi = buildCalendar({
      timezone: 'Asia/Kolkata',
      startDate: '2025-09-01',
      endDate: '2025-10-10',
      activeWeekdays: [1, 2, 3, 4, 5],
      holidays: ['2025-09-16', '2025-09-17', '2025-09-18'],
    });
    const dates = ['2025-09-15', '2025-09-19'];
    expect(calculateCurrentStreak(multi, showedUpOn(dates), '2025-09-19').length).toBe(2);
  });

  it('breaks when an active weekday is missed', () => {
    // Missed Tuesday 2nd.
    const dates = ['2025-09-01', '2025-09-03', '2025-09-04'];
    expect(calculateCurrentStreak(cal, showedUpOn(dates), '2025-09-04').length).toBe(2);
  });

  it('breaks when Monday is missed after a full previous week', () => {
    const dates = [
      '2025-09-01',
      '2025-09-02',
      '2025-09-03',
      '2025-09-04',
      '2025-09-05',
      // 2025-09-08 Monday missed
      '2025-09-09',
    ];
    expect(calculateCurrentStreak(cal, showedUpOn(dates), '2025-09-09').length).toBe(1);
  });

  it('keeps yesterday\'s streak while today is still in progress', () => {
    const dates = ['2025-09-01', '2025-09-02'];
    // Wednesday has not been completed yet — the streak must not read as broken.
    expect(calculateCurrentStreak(cal, showedUpOn(dates), '2025-09-03').length).toBe(2);
  });

  it('is zero on the first study day before anything is done', () => {
    expect(calculateCurrentStreak(cal, showedUpOn([]), '2025-09-01').length).toBe(0);
  });

  it('is one on the first study day once completed', () => {
    const result = calculateCurrentStreak(cal, showedUpOn(['2025-09-01']), '2025-09-01');
    expect(result.length).toBe(1);
    expect(result.startedOn).toBe('2025-09-01');
  });

  it('is zero with no activity at all', () => {
    expect(calculateCurrentStreak(cal, showedUpOn([]), '2025-09-19').length).toBe(0);
  });

  it('restarts at 1 after a comeback', () => {
    const dates = ['2025-09-01', '2025-09-02', /* missed 3rd */ '2025-09-04'];
    expect(calculateCurrentStreak(cal, showedUpOn(dates), '2025-09-04').length).toBe(1);
  });

  it('does not count days before the cohort start date', () => {
    const dates = ['2025-08-28', '2025-08-29', '2025-09-01'];
    expect(calculateCurrentStreak(cal, showedUpOn(dates), '2025-09-01').length).toBe(1);
  });

  it('reports the final streak after the cohort has ended', () => {
    const dates = ['2025-10-08', '2025-10-09', '2025-10-10'];
    expect(calculateCurrentStreak(cal, showedUpOn(dates), '2025-10-20').length).toBe(3);
  });
});

describe('calculateBestStreak', () => {
  it('finds the longest historical run, not the current one', () => {
    const dates = [
      '2025-09-01',
      '2025-09-02',
      '2025-09-03',
      '2025-09-04', // run of 4
      // missed Friday
      '2025-09-08', // run of 1
    ];
    const best = calculateBestStreak(cal, showedUpOn(dates), '2025-09-08');
    expect(best.length).toBe(4);
    expect(best.startedOn).toBe('2025-09-01');
    expect(best.endedOn).toBe('2025-09-04');
    expect(calculateCurrentStreak(cal, showedUpOn(dates), '2025-09-08').length).toBe(1);
  });

  it('is zero with no activity', () => {
    expect(calculateBestStreak(cal, showedUpOn([]), '2025-09-10').length).toBe(0);
  });

  it('never decreases when a later streak is shorter', () => {
    const dates = ['2025-09-01', '2025-09-02', '2025-09-03', '2025-09-05'];
    expect(calculateBestStreak(cal, showedUpOn(dates), '2025-09-05').length).toBe(3);
  });
});

describe('comeback detection', () => {
  it('flags a comeback the day after a single miss', () => {
    const dates = ['2025-09-01', '2025-09-02'];
    const state = calculateComebackState(cal, showedUpOn(dates), '2025-09-04');
    expect(state.isComeback).toBe(true);
    expect(state.missedDays).toEqual(['2025-09-03']);
    expect(state.lastShowedUpOn).toBe('2025-09-02');
  });

  it('collects several missed days in order', () => {
    const dates = ['2025-09-01'];
    const state = calculateComebackState(cal, showedUpOn(dates), '2025-09-04');
    expect(state.missedDays).toEqual(['2025-09-02', '2025-09-03']);
    expect(consecutiveMissedActiveDays(cal, showedUpOn(dates), '2025-09-04')).toBe(2);
  });

  it('is not a comeback when the previous active day was completed', () => {
    const dates = ['2025-09-03'];
    expect(calculateComebackState(cal, showedUpOn(dates), '2025-09-04').isComeback).toBe(false);
  });

  it('is not a comeback on the very first study day', () => {
    expect(calculateComebackState(cal, showedUpOn([]), '2025-09-01').isComeback).toBe(false);
  });

  it('ignores weekends when counting missed days', () => {
    // Missed Friday only; evaluated on Monday.
    const dates = ['2025-09-04'];
    const state = calculateComebackState(cal, showedUpOn(dates), '2025-09-08');
    expect(state.missedDays).toEqual(['2025-09-05']);
  });
});

describe('milestones', () => {
  it('recognises milestone lengths only', () => {
    expect(reachedMilestone(5)).toBe(5);
    expect(reachedMilestone(10)).toBe(10);
    expect(reachedMilestone(7)).toBeNull();
  });

  it('reports the next milestone', () => {
    expect(nextMilestone(1)).toBe(3);
    expect(nextMilestone(5)).toBe(10);
    expect(nextMilestone(50)).toBeNull();
  });

  it('scales the bonus with the milestone', () => {
    expect(milestoneBonusPoints(5)).toBeLessThan(milestoneBonusPoints(10));
    expect(milestoneBonusPoints(20)).toBeLessThan(milestoneBonusPoints(30));
  });
});

describe('cohort streak', () => {
  const turnout = (map: Record<string, [number, number]>) => (d: string) => {
    const entry = map[d];
    return entry ? { showedUp: entry[0], total: entry[1] } : { showedUp: 0, total: 0 };
  };

  it('survives days that hit the threshold and skips weekends', () => {
    const map = {
      '2025-09-03': [20, 27] as [number, number], // 74%
      '2025-09-04': [19, 27] as [number, number], // 70.4%
      '2025-09-05': [21, 27] as [number, number], // 78%
      '2025-09-08': [24, 27] as [number, number], // 89%
    };
    expect(calculateCohortStreak(cal, turnout(map), 70, '2025-09-08').length).toBe(4);
  });

  it('breaks on a day below the threshold', () => {
    const map = {
      '2025-09-03': [20, 27] as [number, number],
      '2025-09-04': [10, 27] as [number, number], // 37%
      '2025-09-05': [21, 27] as [number, number],
    };
    expect(calculateCohortStreak(cal, turnout(map), 70, '2025-09-05').length).toBe(1);
  });
});
