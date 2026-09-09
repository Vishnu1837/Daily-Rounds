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
    // Thursday: Mon–Wed have finished, so there are three settled days to judge. Today is
    // excluded from the sample, so the comparison needs the week to have got that far.
    const r = calculateRiskStatus({ calendar: cal, lookup, showedUp, today: '2025-09-18' });
    expect(r.previousWeekPct).toBeGreaterThan(r.currentWeekPct);
    expect(r.level).toBe('at_risk');
    expect(r.reasons.some((x) => x.includes('dropped'))).toBe(true);
  });

  it('will not call a week a collapse before enough of it has finished', () => {
    // The same student, judged on Wednesday: only Monday and Tuesday have settled. Two days
    // is not a week, and comparing them against a full one is how every student got flagged
    // at the start of every week.
    const { lookup, showedUp } = ctx({
      '2025-09-08': 1,
      '2025-09-09': 1,
      '2025-09-10': 1,
      '2025-09-11': 1,
      '2025-09-12': 1,
      '2025-09-15': 0.5,
      '2025-09-16': 0.4,
    });
    const r = calculateRiskStatus({ calendar: cal, lookup, showedUp, today: '2025-09-17' });
    expect(r.reasons.some((x) => x.includes('dropped'))).toBe(false);
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

describe('low participation is a warning before it is an intervention', () => {
  /*
   * The 2026-09-09 members list. A student attending every session but recording only the
   * study room and a check-in scored 37% every day — under the 40% floor, which escalated
   * straight to red. Nine of ten active students carried the same badge as the one who had
   * genuinely stopped coming.
   */
  const thin = {
    '2025-09-01': 0.37,
    '2025-09-02': 0.37,
    '2025-09-03': 0.37,
    '2025-09-04': 0.37,
    '2025-09-05': 0.37,
    '2025-09-08': 0.37,
  };

  it('flags a thin but unbroken record as at risk, not intervention', () => {
    const { lookup, showedUp } = ctx(thin);
    const r = calculateRiskStatus({ calendar: cal, lookup, showedUp, today: '2025-09-09' });
    expect(r.missedActiveDays).toBe(0);
    expect(r.recentConsistencyPct).toBeLessThan(40);
    expect(r.level).toBe('at_risk');
    expect(r.reasons.some((x) => x.includes('Recent consistency'))).toBe(true);
  });

  it('still escalates when the thin record comes with missed days', () => {
    // Same participation, but the student has since stopped turning up.
    const { lookup, showedUp } = ctx({ ...thin, '2025-09-09': 0, '2025-09-10': 0 });
    const r = calculateRiskStatus({ calendar: cal, lookup, showedUp, today: '2025-09-11' });
    expect(r.missedActiveDays).toBe(2);
    expect(r.level).toBe('needs_intervention');
  });

  it('still escalates when participation is negligible rather than merely low', () => {
    const { lookup, showedUp } = ctx({
      '2025-09-01': 0.1,
      '2025-09-02': 0.1,
      '2025-09-03': 0.15,
      '2025-09-04': 0.1,
      '2025-09-05': 0.1,
      '2025-09-08': 0.1,
    });
    const r = calculateRiskStatus({ calendar: cal, lookup, showedUp, today: '2025-09-09' });
    expect(r.missedActiveDays).toBe(0);
    expect(r.recentConsistencyPct).toBeLessThan(20);
    expect(r.level).toBe('needs_intervention');
  });

  it('keeps the two populations apart', () => {
    // The whole point of the amber band: the student who is logging less than the model
    // asks for must not be indistinguishable from the student who has gone.
    const present = ctx(thin);
    const absent = ctx({
      '2025-09-01': 1,
      '2025-09-02': 1,
      '2025-09-03': 1,
    });
    const a = calculateRiskStatus({ ...present, calendar: cal, today: '2025-09-09' });
    const b = calculateRiskStatus({ ...absent, calendar: cal, today: '2025-09-09' });
    expect(b.missedActiveDays).toBeGreaterThanOrEqual(3);
    expect(a.level).not.toBe(b.level);
    expect(b.level).toBe('needs_intervention');
  });

  it('lets a cohort lead put the intervention floor back where it was', () => {
    const { lookup, showedUp } = ctx(thin);
    const r = calculateRiskStatus({
      calendar: cal,
      lookup,
      showedUp,
      today: '2025-09-09',
      thresholds: { interventionConsistencyPct: 40 },
    });
    expect(r.level).toBe('needs_intervention');
  });
});
