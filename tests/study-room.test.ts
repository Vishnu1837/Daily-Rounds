import { describe, expect, it } from 'vitest';

import {
  EARLY_JOIN_MINUTES,
  LATE_AFTER_MINUTES,
  formatCountdown,
  formatHm,
  isPresenceLive,
  parseHm,
  roomState,
} from '@/lib/domain/study-room';

const ROOM = { startTime: '06:00', endTime: '07:00' };
const at = (hm: string) => roomState({ ...ROOM, nowMinutes: parseHm(hm)! });

describe('parseHm / formatHm', () => {
  it('round-trips a valid wall clock', () => {
    expect(parseHm('06:00')).toBe(360);
    expect(parseHm('23:59')).toBe(1439);
    expect(formatHm(360)).toBe('06:00');
    expect(formatHm(1439)).toBe('23:59');
  });

  it('rejects anything that is not HH:mm', () => {
    for (const bad of ['6:00', '24:00', '06:60', '', 'morning']) {
      expect(parseHm(bad)).toBeNull();
    }
  });
});

describe('roomState', () => {
  it('is closed well before the lead-in, and counts down to the start', () => {
    const state = at('04:30');
    expect(state.phase).toBe('before');
    expect(state.joinStatus).toBeNull();
    expect(state.minutesToStart).toBe(90);
  });

  it('opens EARLY_JOIN_MINUTES before the start time', () => {
    expect(at(formatHm(360 - EARLY_JOIN_MINUTES - 1)).phase).toBe('before');

    const early = at(formatHm(360 - EARLY_JOIN_MINUTES));
    expect(early.phase).toBe('open');
    // Early is still on time — the lead-in exists so nobody is punished for being punctual.
    expect(early.joinStatus).toBe('present');
    expect(early.started).toBe(false);
  });

  it('marks present through the grace period and late after it', () => {
    expect(at('06:00').joinStatus).toBe('present');
    expect(at(formatHm(360 + LATE_AFTER_MINUTES)).joinStatus).toBe('present');
    expect(at(formatHm(360 + LATE_AFTER_MINUTES + 1)).joinStatus).toBe('late');
    expect(at('06:59').joinStatus).toBe('late');
  });

  it('closes on the end time, not after it', () => {
    expect(at('06:59').phase).toBe('open');

    const ended = at('07:00');
    expect(ended.phase).toBe('ended');
    expect(ended.joinStatus).toBeNull();
    expect(ended.minutesToEnd).toBe(0);
  });

  it('never wraps an end time that is not after the start', () => {
    const state = roomState({
      startTime: '06:00',
      endTime: '06:00',
      nowMinutes: parseHm('06:00')!,
    });
    expect(state.phase).toBe('open');
    expect(state.minutesToEnd).toBe(1);
  });

  it('falls back to a sane window when the cohort times are malformed', () => {
    const state = roomState({ startTime: 'nonsense', endTime: 'also nonsense', nowMinutes: 400 });
    expect(state.phase).toBe('open');
    expect(state.joinStatus).toBe('late');
  });
});

describe('formatCountdown', () => {
  it('reads as a duration a person would say out loud', () => {
    expect(formatCountdown(0)).toBe('less than a minute');
    expect(formatCountdown(0.2)).toBe('1m');
    expect(formatCountdown(47)).toBe('47m');
    expect(formatCountdown(60)).toBe('1h 00m');
    expect(formatCountdown(125)).toBe('2h 05m');
  });
});

describe('isPresenceLive', () => {
  const now = new Date('2025-09-01T06:20:00Z');

  it('holds a recent heartbeat and drops a stale one', () => {
    expect(isPresenceLive(new Date('2025-09-01T06:19:00Z'), now)).toBe(true);
    expect(isPresenceLive(new Date('2025-09-01T06:15:00Z'), now)).toBe(false);
  });
});
