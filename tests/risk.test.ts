import { describe, expect, it } from 'vitest';

import { buildCalendar } from '@/lib/domain/calendar';
import type { DayRecord } from '@/lib/domain/consistency';
import { calculateRiskStatus } from '@/lib/domain/risk';

const cal = buildCalendar({
  timezone: 'Asia/Kolkata',
  startDate: '2025-09-01',
  endDate: '2025-10-10',
  activeWeekdays: [1, 2, 3, 4, 5],
});

function ctx(records: Record<string, number>) {
  const lookup = (date: string): DayRecord | undefined => {
    const score = records[date];
    if (score === undefined) return undefined;
    return { date, showedUp: score > 0, score, studyMinutes: 0, points: 0 };
  };
  return { lookup, showedUp: (d: string) => (records[d] ?? 0) > 0 };
}

describe('calculateRiskStatus', () => {
  it('is on track for a student completing every day', () => {
    const { lookup, showedUp } = ctx({
      '2025-09-08': 1,
      '2025-09-09': 1,
      '2025-09-10': 1,
      '2025-09-11': 1,
    });
    const r = calculateRiskStatus({ calendar: cal, lookup, showedUp, today: '2025-09-12' });
    expect(r.level).toBe('on_track');
    expect(r.reasons).toHaveLength(0);
  });

  it('flags at risk after two consecutive missed active days', () => {
    const { lookup, showedUp } = ctx({
      '2025-09-01': 1,
      '2025-09-02': 1,
      '2025-09-03': 1,
      '2025-09-04': 1,
      '2025-09-05': 1,
      '2025-09-08': 1,
      '2025-09-09': 1,
    });
    const r = calculateRiskStatus({ calendar: cal, lookup, showedUp, today: '2025-09-12' });
    expect(r.missedActiveDays).toBe(2);
    expect(r.level).toBe('at_risk');
  });

  it('escalates to intervention after three consecutive missed active days', () => {
    const { lookup, showedUp } = ctx({
      '2025-09-01': 1,
      '2025-09-02': 1,
      '2025-09-03': 1,
      '2025-09-04': 1,
      '2025-09-05': 1,
      '2025-09-08': 1,
    });
    const r = calculateRiskStatus({ calendar: cal, lookup, showedUp, today: '2025-09-12' });
    expect(r.missedActiveDays).toBe(3);
    expect(r.level).toBe('needs_intervention');
  });

  it('does not count a weekend gap as missed days', () => {
    const { lookup, showedUp } = ctx({
      '2025-09-01': 1,
      '2025-09-02': 1,
      '2025-09-03': 1,
      '2025-09-04': 1,
      '2025-09-05': 1,
      '2025-09-08': 1,
      '2025-09-09': 1,
      '2025-09-10': 1,
      '2025-09-11': 1,
      '2025-09-12': 1,
    });
    // Monday morning after a completed week.
    const r = calculateRiskStatus({ calendar: cal, lookup, showedUp, today: '2025-09-15' });
    expect(r.missedActiveDays).toBe(0);
    expect(r.level).toBe('on_track');
  });

  it('flags a significant week-over-week consistency drop', () => {
    const { lookup, showedUp } = ctx({
      // previous week strong
      '2025-09-08': 1,
      '2025-09-09': 1,
      '2025-09-10': 1,
      '2025-09-11': 1,
      '2025-09-12': 1,
      // this week weak but not absent
      '2025-09-15': 0.5,
      '2025-09-16': 0.4,
      '2025-09-17': 0.5,
    });
    const r = calculateRiskStatus({ calendar: cal, lookup, showedUp, today: '2025-09-17' });
    expect(r.previousWeekPct).toBeGreaterThan(r.currentWeekPct);
    expect(r.level).toBe('at_risk');
    expect(r.reasons.some((x) => x.includes('dropped'))).toBe(true);
  });

  it('escalates for very low overall participation', () => {
    const { lookup, showedUp } = ctx({
      '2025-09-01': 0.2,
      '2025-09-02': 0.1,
      '2025-09-03': 0.1,
      '2025-09-04': 0.2,
      '2025-09-05': 0.1,
      '2025-09-08': 0.1,
    });
    const r = calculateRiskStatus({ calendar: cal, lookup, showedUp, today: '2025-09-08' });
    expect(r.level).toBe('needs_intervention');
  });

  it('respects configurable thresholds', () => {
    const { lookup, showedUp } = ctx({ '2025-09-08': 1, '2025-09-09': 1 });
    const lenient = calculateRiskStatus({
      calendar: cal,
      lookup,
      showedUp,
      today: '2025-09-12',
      thresholds: { atRiskMissedDays: 4, interventionMissedDays: 6, minConsistencyPct: 10 },
    });
    expect(lenient.level).toBe('on_track');

    const strict = calculateRiskStatus({
      calendar: cal,
      lookup,
      showedUp,
      today: '2025-09-12',
      thresholds: { atRiskMissedDays: 1, interventionMissedDays: 2 },
    });
    expect(strict.level).toBe('needs_intervention');
  });

  it('does not flag a Monday morning as a week-over-week collapse', () => {
    const { lookup, showedUp } = ctx({
      '2025-09-08': 1,
      '2025-09-09': 1,
      '2025-09-10': 1,
      '2025-09-11': 1,
      '2025-09-12': 1,
    });
    // Monday, nothing done yet — the current week is too short to compare fairly.
    const r = calculateRiskStatus({ calendar: cal, lookup, showedUp, today: '2025-09-15' });
    expect(r.reasons.some((x) => x.includes('dropped'))).toBe(false);
  });

  it('ignores days before the student joined', () => {
    const { lookup, showedUp } = ctx({
      '2025-09-15': 1,
      '2025-09-16': 1,
      '2025-09-17': 1,
    });
    const r = calculateRiskStatus({
      calendar: cal,
      lookup,
      showedUp,
      today: '2025-09-17',
      since: '2025-09-15',
    });
    expect(r.consistencyPct).toBe(100);
    expect(r.level).toBe('on_track');
  });

  it('does not punish a brand new student on day one', () => {
    const { lookup, showedUp } = ctx({});
    const r = calculateRiskStatus({ calendar: cal, lookup, showedUp, today: '2025-09-01' });
    expect(r.level).toBe('on_track');
  });
});
