import { describe, expect, it } from 'vitest';

import {
  MAX_SEGMENT_SECONDS,
  MAX_SESSION_SECONDS,
  STALE_SESSION_SECONDS,
  accruedSeconds,
  cappedTotal,
  isImplausibleTotal,
  isStale,
  lastSignOfLife,
} from '@/lib/domain/study-session';

/**
 * The arithmetic that produced the audit's worst number: a student with 1,173 study minutes
 * and not one completed focus round. A block accrued against the wall clock and nothing ever
 * closed it, so an overnight gap was banked as study time.
 */

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000);
const HOUR = 3600;

describe('accruedSeconds', () => {
  it('counts the running segment', () => {
    expect(accruedSeconds({ elapsedSeconds: 0, resumedAt: ago(600), startedAt: ago(600) })).toBe(
      600,
    );
  });

  it('counts nothing for a paused block, which has no running segment', () => {
    expect(accruedSeconds({ elapsedSeconds: 900, resumedAt: null, startedAt: ago(3000) })).toBe(0);
  });

  it('refuses to bank a tab that was left open overnight', () => {
    const overnight = { elapsedSeconds: 0, resumedAt: ago(14 * HOUR), startedAt: ago(14 * HOUR) };
    expect(accruedSeconds(overnight)).toBe(MAX_SEGMENT_SECONDS);
  });

  it('never returns a negative segment for a clock that moved backwards', () => {
    const future = new Date(Date.now() + 60_000);
    expect(accruedSeconds({ elapsedSeconds: 0, resumedAt: future, startedAt: future })).toBe(0);
  });
});

describe('cappedTotal', () => {
  it('adds banked time to the live segment', () => {
    const total = cappedTotal({ elapsedSeconds: 1200, resumedAt: ago(300), startedAt: ago(2000) });
    expect(total).toBe(1500);
  });

  it('caps the whole block however it was assembled', () => {
    const corrupt = {
      elapsedSeconds: 40 * HOUR,
      resumedAt: ago(2 * HOUR),
      startedAt: ago(50 * HOUR),
    };
    expect(cappedTotal(corrupt)).toBe(MAX_SESSION_SECONDS);
  });

  it('the audit case: an overnight block reports hours, not a day and a half', () => {
    const laptopClosed = {
      elapsedSeconds: 0,
      resumedAt: ago(20 * HOUR),
      startedAt: ago(20 * HOUR),
    };
    expect(cappedTotal(laptopClosed) / 60).toBeLessThanOrEqual(MAX_SEGMENT_SECONDS / 60);
    expect(cappedTotal(laptopClosed) / 60).toBeLessThan(1173);
  });
});

describe('lastSignOfLife', () => {
  it('is the resume for a running block', () => {
    const resumedAt = ago(100);
    expect(lastSignOfLife({ elapsedSeconds: 0, resumedAt, startedAt: ago(9999) })).toBe(resumedAt);
  });

  it('falls back to the start for a paused block, which writes no timestamp of its own', () => {
    const startedAt = ago(9999);
    expect(lastSignOfLife({ elapsedSeconds: 60, resumedAt: null, startedAt })).toBe(startedAt);
  });
});

describe('isStale', () => {
  it('leaves a block alone while someone could still be sitting at it', () => {
    expect(isStale({ elapsedSeconds: 0, resumedAt: ago(HOUR), startedAt: ago(HOUR) })).toBe(false);
  });

  it('closes a block that has shown no sign of life for hours', () => {
    const quiet = ago(STALE_SESSION_SECONDS + 60);
    expect(isStale({ elapsedSeconds: 0, resumedAt: quiet, startedAt: quiet })).toBe(true);
  });

  it('waits longer than a segment can accrue, so nothing is closed while still earning', () => {
    // If staleness bit first, a student sitting through a long block would have time taken
    // away from them by the sweep. The ordering is the guarantee, so it is asserted.
    expect(STALE_SESSION_SECONDS).toBeGreaterThan(MAX_SEGMENT_SECONDS);
  });
});

describe('isImplausibleTotal', () => {
  it('flags the rows the old uncapped arithmetic wrote', () => {
    expect(isImplausibleTotal(MAX_SESSION_SECONDS + 1)).toBe(true);
    expect(isImplausibleTotal(1173 * 60)).toBe(true);
  });

  it('leaves a long but possible day alone', () => {
    expect(isImplausibleTotal(8 * HOUR)).toBe(false);
    expect(isImplausibleTotal(MAX_SESSION_SECONDS)).toBe(false);
  });
});
