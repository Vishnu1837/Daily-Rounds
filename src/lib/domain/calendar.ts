/**
 * Study-day calendar.
 *
 * Everything date-shaped in Daily Rounds is a plain `YYYY-MM-DD` *civil date* evaluated in
 * the cohort's timezone — never a browser-local `Date`. Arithmetic is done on UTC-noon
 * anchors so daylight-saving transitions can never shift a day boundary.
 *
 * The central concept is the ACTIVE STUDY DAY. A calendar date is an active study day when
 * all of these hold:
 *   - it falls inside the cohort's start/end range,
 *   - its ISO weekday is one of the cohort's active weekdays (default Mon–Fri),
 *   - it is not a cohort holiday,
 * …or it has been explicitly added as an extra study day (which overrides weekday/holiday
 * rules but still must fall inside the cohort range).
 *
 * Streaks and consistency are measured over active study days only, which is why a weekend
 * or a declared holiday can never break a streak.
 */

/** A civil date in `YYYY-MM-DD` form. */
export type ISODate = string;

export type CohortCalendar = {
  timezone: string;
  startDate: ISODate;
  endDate: ISODate;
  /** ISO weekday numbers: 1 = Monday … 7 = Sunday. */
  activeWeekdays: number[];
  holidays: ReadonlySet<ISODate>;
  extraStudyDays: ReadonlySet<ISODate>;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertISODate(date: string): asserts date is ISODate {
  if (!DATE_RE.test(date)) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
}

/** Parses a civil date into a UTC-noon anchor, safe for day arithmetic. */
export function toAnchor(date: ISODate): Date {
  assertISODate(date);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

export function fromAnchor(anchor: Date): ISODate {
  return anchor.toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  const a = toAnchor(date);
  a.setUTCDate(a.getUTCDate() + days);
  return fromAnchor(a);
}

export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((toAnchor(to).getTime() - toAnchor(from).getTime()) / 86_400_000);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: ISODate): number {
  const day = toAnchor(date).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Monday of the week containing `date`. */
export function weekStart(date: ISODate): ISODate {
  return addDays(date, -(isoWeekday(date) - 1));
}

/** Sunday of the week containing `date`. */
export function weekEnd(date: ISODate): ISODate {
  return addDays(weekStart(date), 6);
}

export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

export function isBetween(date: ISODate, from: ISODate, to: ISODate): boolean {
  return date >= from && date <= to;
}

/**
 * The current civil date in the given IANA timezone. Never uses the browser's local
 * offset — this is the only sanctioned way to ask "what day is it for this cohort?".
 */
export function todayInTimezone(timezone: string, now: Date = new Date()): ISODate {
  return formatInTimezone(now, timezone);
}

/** Formats an instant as the civil `YYYY-MM-DD` it falls on in `timezone`. */
export function formatInTimezone(instant: Date, timezone: string): ISODate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** The wall-clock `HH:mm` in the given timezone. */
export function timeInTimezone(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
}

export function buildCalendar(input: {
  timezone: string;
  startDate: ISODate;
  endDate: ISODate;
  activeWeekdays: number[];
  holidays?: Iterable<ISODate>;
  extraStudyDays?: Iterable<ISODate>;
}): CohortCalendar {
  return {
    timezone: input.timezone,
    startDate: input.startDate,
    endDate: input.endDate,
    activeWeekdays: [...input.activeWeekdays].sort((a, b) => a - b),
    holidays: new Set(input.holidays ?? []),
    extraStudyDays: new Set(input.extraStudyDays ?? []),
  };
}

export function isWithinCohort(cal: CohortCalendar, date: ISODate): boolean {
  return isBetween(date, cal.startDate, cal.endDate);
}

export function isHoliday(cal: CohortCalendar, date: ISODate): boolean {
  return cal.holidays.has(date);
}

/** A non-active day that is *not* a holiday — i.e. a normal weekend. */
export function isRestDay(cal: CohortCalendar, date: ISODate): boolean {
  return !isActiveStudyDay(cal, date) && !isHoliday(cal, date);
}

export function isActiveStudyDay(cal: CohortCalendar, date: ISODate): boolean {
  if (!isWithinCohort(cal, date)) return false;
  if (cal.extraStudyDays.has(date)) return true;
  if (cal.holidays.has(date)) return false;
  return cal.activeWeekdays.includes(isoWeekday(date));
}

/** Inclusive list of active study days in `[from, to]`, clamped to the cohort range. */
export function activeStudyDaysBetween(cal: CohortCalendar, from: ISODate, to: ISODate): ISODate[] {
  const start = maxDate(from, cal.startDate);
  const end = minDate(to, cal.endDate);
  if (start > end) return [];
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (isActiveStudyDay(cal, d)) out.push(d);
  }
  return out;
}

/** Every calendar date in `[from, to]`, active or not. */
export function datesBetween(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * The active study day immediately before `date`, or null if there isn't one inside the
 * cohort. This is what makes Friday → Monday a *consecutive* pair.
 */
export function previousActiveStudyDay(cal: CohortCalendar, date: ISODate): ISODate | null {
  let cursor = addDays(date, -1);
  while (cursor >= cal.startDate) {
    if (isActiveStudyDay(cal, cursor)) return cursor;
    cursor = addDays(cursor, -1);
  }
  return null;
}

export function nextActiveStudyDay(cal: CohortCalendar, date: ISODate): ISODate | null {
  let cursor = addDays(date, 1);
  while (cursor <= cal.endDate) {
    if (isActiveStudyDay(cal, cursor)) return cursor;
    cursor = addDays(cursor, 1);
  }
  return null;
}

/** The active study day on or before `date`. */
export function currentOrPreviousActiveStudyDay(
  cal: CohortCalendar,
  date: ISODate,
): ISODate | null {
  if (isActiveStudyDay(cal, date)) return date;
  return previousActiveStudyDay(cal, date);
}

/** 1-based cohort week number containing `date` (week 1 starts the cohort's first week). */
export function cohortWeekNumber(cal: CohortCalendar, date: ISODate): number {
  const firstWeekMonday = weekStart(cal.startDate);
  return Math.floor(diffDays(firstWeekMonday, date) / 7) + 1;
}

/** Monday of each cohort week that has begun on or before `upTo`. */
export function cohortWeekStarts(cal: CohortCalendar, upTo: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const last = minDate(upTo, cal.endDate);
  for (let d = weekStart(cal.startDate); d <= last; d = addDays(d, 7)) out.push(d);
  return out;
}
