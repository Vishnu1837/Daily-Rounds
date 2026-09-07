/**
 * A cohort lead's attendance mark counts as showing up.
 *
 * This has been settled in both directions, so the tests spell out which one holds. 0014
 * required the study room to corroborate an admin mark before it could assert attendance,
 * on the reasoning that a bulk mark is one click and worth more points than any other
 * behaviour. The reasoning is sound and the effect was wrong for how the cohort is run:
 * nobody uses the join button, so every mark is a hand mark, and turnout reported 68% on a
 * morning 23 of 25 students were present.
 *
 * The mark is trusted. The exposure is handled by reporting it — `showedUpOnMarkAlone`
 * flags the days that rest on a mark and nothing else, and the console shows that split
 * beside the headline. These tests pin both halves: the mark counts everywhere that scores,
 * and the flag stays accurate enough to be worth showing.
 */
import { describe, expect, it } from 'vitest';

import { buildCalendar } from '@/lib/domain/calendar';
import { showedUpForDay, showedUpOnMarkAlone } from '@/lib/domain/points';
import { calculateRiskStatus } from '@/lib/domain/risk';
import { calculateCurrentStreak } from '@/lib/domain/streak';
import type { DayRecord } from '@/lib/domain/consistency';

/** Mon 2025-09-01 → Fri 2025-10-10, weekdays only. */
const cal = buildCalendar({
  timezone: 'Asia/Kolkata',
  startDate: '2025-09-01',
  endDate: '2025-10-10',
  activeWeekdays: [1, 2, 3, 4, 5],
});

const PRESENT = [{ event: 'live_session_present' as const, points: 20 }];
const LATE = [{ event: 'live_session_late' as const, points: 10 }];
const CHECK_IN = [{ event: 'daily_check_in' as const, points: 5 }];

describe('showedUpForDay', () => {
  it('counts a hand-marked present', () => {
    expect(showedUpForDay({ entries: PRESENT, verifiedPresence: false })).toBe(true);
  });

  it('counts a hand-marked late', () => {
    expect(showedUpForDay({ entries: LATE, verifiedPresence: false })).toBe(true);
  });

  it('counts a verified join', () => {
    expect(showedUpForDay({ entries: PRESENT, verifiedPresence: true })).toBe(true);
  });

  it('counts work the student did on their own', () => {
    expect(showedUpForDay({ entries: CHECK_IN, verifiedPresence: false })).toBe(true);
  });

  it('is false for a day marked absent — that pays nothing, so nothing is recorded', () => {
    expect(showedUpForDay({ entries: [], verifiedPresence: false })).toBe(false);
  });

  it('is false for a day whose only points are outside the behaviour set', () => {
    const quiz = [{ event: 'quiz_attempt' as const, points: 5 }];
    expect(showedUpForDay({ entries: quiz, verifiedPresence: false })).toBe(false);
  });
});

describe('showedUpOnMarkAlone', () => {
  it('flags a show-up that rests on the mark and nothing else', () => {
    expect(showedUpOnMarkAlone({ entries: PRESENT, verifiedPresence: false })).toBe(true);
  });

  it('does not flag a verified join', () => {
    expect(showedUpOnMarkAlone({ entries: PRESENT, verifiedPresence: true })).toBe(false);
  });

  it('does not flag a day the student also worked under their own steam', () => {
    expect(
      showedUpOnMarkAlone({ entries: [...PRESENT, ...CHECK_IN], verifiedPresence: false }),
    ).toBe(false);
  });

  it('does not flag a day with no show-up at all', () => {
    expect(showedUpOnMarkAlone({ entries: [], verifiedPresence: false })).toBe(false);
  });

  it('never contradicts showedUpForDay — a flagged day is always a show-up', () => {
    const cases = [PRESENT, LATE, CHECK_IN, [...PRESENT, ...CHECK_IN], []];
    for (const entries of cases) {
      for (const verifiedPresence of [true, false]) {
        const args = { entries, verifiedPresence };
        if (showedUpOnMarkAlone(args)) expect(showedUpForDay(args)).toBe(true);
      }
    }
  });
});

describe('a hand-marked week scores like any other', () => {
  /** Every day marked present by a lead, nothing else on any of them. */
  const marked = ['2025-09-01', '2025-09-02', '2025-09-03', '2025-09-04', '2025-09-05'];
  const showedUp = (d: string) => marked.includes(d);
  const lookup = (date: string): DayRecord | undefined =>
    marked.includes(date)
      ? { date, showedUp: true, score: 0.25, studyMinutes: 0, points: 20 }
      : undefined;

  it('builds a streak', () => {
    expect(calculateCurrentStreak(cal, showedUp, '2025-09-05').length).toBe(5);
  });

  it('records no missed days', () => {
    const r = calculateRiskStatus({ calendar: cal, lookup, showedUp, today: '2025-09-08' });
    expect(r.missedActiveDays).toBe(0);
    expect(r.reasons).not.toContain('Missed 5 consecutive study days');
  });

  /*
   * Showing up and doing nothing else is still a signal, and a different one from absence.
   * A week of bare attendance scores 25% of the behaviour maximum, which trips the low
   * participation rule — correctly, and with a reason that says so rather than claiming the
   * student was not there.
   */
  it('is flagged on low participation, not on absence', () => {
    const r = calculateRiskStatus({ calendar: cal, lookup, showedUp, today: '2025-09-08' });
    expect(r.reasons).toEqual(['Recent consistency is only 25%']);
  });

  it('leaves a student who also does the work on track', () => {
    const full = (date: string): DayRecord | undefined =>
      marked.includes(date)
        ? { date, showedUp: true, score: 1, studyMinutes: 90, points: 80 }
        : undefined;
    const r = calculateRiskStatus({
      calendar: cal,
      lookup: full,
      showedUp,
      today: '2025-09-08',
    });
    expect(r.level).toBe('on_track');
  });
});
