/**
 * The morning study room.
 *
 * The room is a recurring wall-clock window in the cohort's timezone — `06:00 – 07:00` by
 * default — not an instant, so every question about it ("is it open?", "am I late?") is
 * answered in minutes-since-midnight rather than with `Date` arithmetic. That keeps the
 * server and the browser agreeing even when the student's device is in another timezone.
 *
 * Three rules define the room:
 *
 *   - It opens a short lead-in BEFORE the start time, because a room you can only enter at
 *     exactly 06:00 is a room half the cohort misses.
 *   - Joining within the grace period counts as `present`; after it, `late`. Never joining
 *     is not recorded here at all — absence is the admin's call at the end of the day.
 *   - Presence is a heartbeat, not a flag. A student who closes the tab drops off the live
 *     roster on their own once the beats stop, so the roster can never lie upward.
 */

/** How long before the start time the room accepts joins. */
export const EARLY_JOIN_MINUTES = 15;

/** Join within this many minutes of the start time and you are `present`, not `late`. */
export const LATE_AFTER_MINUTES = 10;

/** Heartbeat cadence the client uses while it holds a place in the room. */
export const HEARTBEAT_SECONDS = 45;

/** No heartbeat for this long and the student is treated as gone. */
export const PRESENCE_STALE_SECONDS = 150;

export type RoomPhase =
  /** Too early to join — the card counts down. */
  | 'before'
  /** Inside the lead-in, or inside the window itself. */
  | 'open'
  /** The window has passed for today. */
  | 'ended';

export type RoomState = {
  phase: RoomPhase;
  /** True once the window itself has started (as opposed to the lead-in). */
  started: boolean;
  /** What joining right now would be recorded as, or null when joining is closed. */
  joinStatus: 'present' | 'late' | null;
  /** Minutes until joining is allowed — the lead-in, not the start time. 0 once open. */
  minutesToOpen: number;
  /** Minutes until the window itself starts; 0 once it has. */
  minutesToStart: number;
  /** Minutes until the window closes; 0 once it has. */
  minutesToEnd: number;
};

const HM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `HH:mm` → minutes since midnight. Returns null for anything malformed. */
export function parseHm(value: string): number | null {
  const match = HM_RE.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minutes since midnight → `HH:mm`, wrapping across a day boundary. */
export function formatHm(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** A human duration for a countdown: `2h 05m`, `47m`, `<1m`. */
export function formatCountdown(minutes: number): string {
  const total = Math.max(0, Math.ceil(minutes));
  if (total === 0) return 'less than a minute';
  if (total < 60) return `${total}m`;
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`;
}

/**
 * Where the room is in its day, given the cohort wall clock.
 *
 * `nowMinutes` is minutes since midnight in the cohort's timezone. A window whose end time
 * is at or before its start time (an overnight room) is treated as ending at midnight
 * rather than silently wrapping — nobody runs a study room across the date boundary, and
 * guessing would put attendance on the wrong day.
 */
export function roomState(input: {
  startTime: string;
  endTime: string;
  nowMinutes: number;
}): RoomState {
  const start = parseHm(input.startTime) ?? 6 * 60;
  const end = Math.max(parseHm(input.endTime) ?? start + 60, start + 1);
  const now = input.nowMinutes;

  const opensAt = start - EARLY_JOIN_MINUTES;
  const minutesToOpen = Math.max(0, opensAt - now);
  const minutesToStart = Math.max(0, start - now);
  const minutesToEnd = Math.max(0, end - now);

  if (now < opensAt) {
    return {
      phase: 'before',
      started: false,
      joinStatus: null,
      minutesToOpen,
      minutesToStart,
      minutesToEnd,
    };
  }
  if (now >= end) {
    return {
      phase: 'ended',
      started: true,
      joinStatus: null,
      minutesToOpen: 0,
      minutesToStart: 0,
      minutesToEnd: 0,
    };
  }

  return {
    phase: 'open',
    started: now >= start,
    joinStatus: now <= start + LATE_AFTER_MINUTES ? 'present' : 'late',
    minutesToOpen: 0,
    minutesToStart,
    minutesToEnd,
  };
}

/** Whether a heartbeat that old still counts as "in the room". */
export function isPresenceLive(lastSeenAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - lastSeenAt.getTime() <= PRESENCE_STALE_SECONDS * 1000;
}
