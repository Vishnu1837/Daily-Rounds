/**
 * Study-block lifecycle.
 *
 * A block is a stopwatch with two server timestamps: `elapsed_seconds` banked by previous
 * pauses, and `resumed_at` marking when the current running segment began. Elapsed time is
 * always recomputed from those on the server; the browser's own counter is a drawing.
 *
 * The rules here exist because of one class of bug the audit found. Nothing but the student
 * pressing Finish ever ended a block, so a closed laptop left a row `running` for as long as
 * the database cared to keep it, and every read that summed `elapsed_seconds` inherited the
 * arithmetic — one student had 1,173 study minutes and not a single completed focus round.
 * Three defences, in order of how early they catch it:
 *
 *   1. `accruedSeconds` — a *single* running segment is capped, so time spent asleep cannot
 *      be banked no matter how long the row sat there.
 *   2. `staleness` — a block whose last sign of life is old enough is not in progress, and
 *      is auto-closed by the sweep at the value it had genuinely earned.
 *   3. `cappedTotal` — no block, however it was assembled, may report more than a day's
 *      worth of study.
 *
 * Every function is pure and takes its `now`, so both the sweeper and the finish path reach
 * the same number from the same row, and both are testable without a clock.
 */

/**
 * The longest a *single uninterrupted running segment* may bank.
 *
 * A block genuinely sat through is punctuated: the student pauses, finishes, or starts
 * another round. A segment that runs longer than this without a single interaction is a tab
 * that was left open, and crediting it is how a stopwatch turns into a fiction. Four hours
 * is far past any real sitting and far short of the overnight gaps that caused the damage.
 */
export const MAX_SEGMENT_SECONDS = 4 * 3600;

/**
 * The longest total a block may report, however many segments it was assembled from.
 *
 * A backstop, not a rule anyone should reach: it exists so a corrupt row can never poison
 * a consistency percentage or a leaderboard.
 */
export const MAX_SESSION_SECONDS = 12 * 3600;

/**
 * No sign of life for this long and a block is not in progress any more.
 *
 * Deliberately longer than `MAX_SEGMENT_SECONDS`, so the sweep only ever closes blocks whose
 * running segment has already stopped accruing. Closing one earlier would take time away
 * from a student who was still sitting there.
 */
export const STALE_SESSION_SECONDS = 6 * 3600;

export type SessionTiming = {
  elapsedSeconds: number;
  resumedAt: Date | null;
  startedAt: Date;
};

/**
 * Seconds earned by the segment currently running, capped.
 *
 * Zero for a paused or finished block, which has no running segment.
 */
export function accruedSeconds(session: SessionTiming, now: Date = new Date()): number {
  if (!session.resumedAt) return 0;
  const raw = Math.floor((now.getTime() - session.resumedAt.getTime()) / 1000);
  return Math.min(MAX_SEGMENT_SECONDS, Math.max(0, raw));
}

/** What a block has genuinely earned as of `now`: banked time plus the live segment, capped. */
export function cappedTotal(session: SessionTiming, now: Date = new Date()): number {
  const banked = Math.max(0, session.elapsedSeconds);
  return Math.min(MAX_SESSION_SECONDS, banked + accruedSeconds(session, now));
}

/**
 * The last moment this block showed any sign of life.
 *
 * `resumed_at` for a running block, `started_at` for a paused one — a pause writes no
 * timestamp of its own, so the start is the most recent thing the row can prove. That makes
 * the staleness test conservative for a long-paused block, which is the right direction: it
 * waits longer before closing it.
 */
export function lastSignOfLife(session: SessionTiming): Date {
  return session.resumedAt ?? session.startedAt;
}

/** True when a `running` or `paused` block has gone quiet long enough to be closed. */
export function isStale(session: SessionTiming, now: Date = new Date()): boolean {
  return now.getTime() - lastSignOfLife(session).getTime() > STALE_SESSION_SECONDS * 1000;
}

/**
 * True when a stored total is larger than a block could honestly have earned.
 *
 * Used by the repair script to find the rows the old, uncapped arithmetic already wrote —
 * they are corrected in place, with the original kept in `raw_elapsed_seconds`.
 */
export function isImplausibleTotal(elapsedSeconds: number): boolean {
  return elapsedSeconds > MAX_SESSION_SECONDS;
}
