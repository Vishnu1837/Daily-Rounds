import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TIMEZONE,
  TIMEZONES,
  TIMEZONE_GROUPS,
  formatTimeInZone,
  isKnownTimezone,
  timezoneLabel,
} from '@/lib/timezones';

describe('timezone catalogue', () => {
  it('offers every region the brief names', () => {
    const ids = new Set(TIMEZONES.map((z) => z.id));
    for (const required of [
      'Asia/Kolkata', // India
      'Asia/Tashkent', // Uzbekistan
      'Africa/Cairo', // Egypt
      'Asia/Ho_Chi_Minh', // Vietnam
      'Asia/Dubai', // UAE
      'Asia/Riyadh', // Saudi Arabia
      'Asia/Qatar', // Qatar
      'Asia/Tbilisi', // Georgia
      'Asia/Bishkek', // Kyrgyzstan
      'Asia/Dushanbe', // Tajikistan
    ]) {
      expect(ids.has(required), required).toBe(true);
    }
  });

  it('offers more than one zone for Russia and Kazakhstan', () => {
    // The brief calls these out specifically: a country name alone is not enough.
    const russia = TIMEZONE_GROUPS.find((g) => g.region === 'Russia')!;
    const kazakhstan = TIMEZONE_GROUPS.find((g) => g.region === 'Kazakhstan')!;
    expect(russia.zones.length).toBeGreaterThan(1);
    expect(kazakhstan.zones.length).toBeGreaterThan(1);
  });

  it('has no duplicate identifiers', () => {
    const ids = TIMEZONES.map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only offers identifiers the runtime actually accepts', () => {
    for (const zone of TIMEZONES) {
      expect(
        () => new Intl.DateTimeFormat('en-GB', { timeZone: zone.id }).format(new Date(0)),
        zone.id,
      ).not.toThrow();
    }
  });

  it('defaults to India', () => {
    expect(isKnownTimezone(DEFAULT_TIMEZONE)).toBe(true);
    expect(DEFAULT_TIMEZONE).toBe('Asia/Kolkata');
  });
});

describe('timezoneLabel', () => {
  it('gives a friendly label for a known zone', () => {
    expect(timezoneLabel('Asia/Kolkata')).toContain('India');
    expect(timezoneLabel('Africa/Cairo')).toContain('Egypt');
  });

  it('falls back to a readable identifier rather than relabelling an unknown zone', () => {
    // Silently calling a Yakutsk student "India" would be worse than showing the raw id.
    expect(timezoneLabel('Asia/Yakutsk')).toBe('Asia — Yakutsk');
    expect(timezoneLabel('Asia/Yakutsk')).not.toContain('India');
  });
});

describe('formatTimeInZone', () => {
  it('returns the time unchanged when the zones match', () => {
    expect(formatTimeInZone('06:00', '2026-09-01', 'Asia/Kolkata', 'Asia/Kolkata')).toBe('06:00');
  });

  it('shifts a cohort session time into the student’s zone', () => {
    // Kolkata is UTC+5:30, Dubai UTC+4 — a 06:00 IST session is 04:30 in Dubai.
    expect(formatTimeInZone('06:00', '2026-09-01', 'Asia/Kolkata', 'Asia/Dubai')).toBe('04:30');
  });

  it('shifts forward as well as back', () => {
    // Tashkent is UTC+5, half an hour behind Kolkata's UTC+5:30.
    expect(formatTimeInZone('06:00', '2026-09-01', 'Asia/Kolkata', 'Asia/Tashkent')).toBe('05:30');
  });

  it('handles a zone that crosses midnight backwards', () => {
    // 01:00 IST (UTC+5:30) is 19:30 UTC the previous day; Cairo runs UTC+3 in September,
    // so it reads 22:30 on 31 August — a different calendar day from the one passed in.
    expect(formatTimeInZone('01:00', '2026-09-01', 'Asia/Kolkata', 'Africa/Cairo')).toBe('22:30');
  });

  it('respects daylight saving at the date given, not a fixed offset', () => {
    // London is UTC+1 in July and UTC+0 in January, so the same IST time lands differently.
    const summer = formatTimeInZone('12:00', '2026-07-01', 'Asia/Kolkata', 'Europe/London');
    const winter = formatTimeInZone('12:00', '2026-01-01', 'Asia/Kolkata', 'Europe/London');
    expect(summer).toBe('07:30');
    expect(winter).toBe('06:30');
    expect(summer).not.toBe(winter);
  });

  it('returns the input unchanged rather than throwing on a malformed time', () => {
    expect(formatTimeInZone('not-a-time', '2026-09-01', 'Asia/Kolkata', 'Asia/Dubai')).toBe(
      'not-a-time',
    );
  });
});
