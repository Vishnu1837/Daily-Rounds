/**
 * Study-block lifecycle enforcement, at the database.
 *
 * Deliberately **not** marked `server-only`, unlike its neighbours. These two functions are
 * the body of `npm run db:repair-sessions`, a standalone `tsx` script that runs outside
 * Next entirely, and the marker throws the moment such a script imports it. The alternative
 * was to reimplement the same queries in the script, which is precisely how a repair tool
 * ends up applying a slightly different rule from the sweep it is meant to match.
 *
 * Nothing here reads a request, a session or a secret; it is SQL over `study_sessions` and
 * pure functions from `@/lib/domain/study-session`. It would fail to bundle into a client
 * component regardless, because it imports the database driver.
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { studySessions } from '@/db/schema';
import {
  MAX_SESSION_SECONDS,
  STALE_SESSION_SECONDS,
  accruedSeconds,
  cappedTotal,
} from '@/lib/domain/study-session';

/**
 * Closes study blocks that have gone quiet.
 *
 * The audit's worst single number came from here: 32 paused and 8 running blocks that had
 * never been closed, and one student credited with 1,173 study minutes and zero completed
 * focus rounds. Nothing but the student pressing Finish ended a block, so a closed laptop
 * left one accruing against the wall clock indefinitely.
 *
 * A closed block is marked `abandoned`, not `completed`, and pays nothing. That is the
 * honest reading: nobody finished it, and paying for a browser that went silent would be
 * exactly the kind of unearned credit the rest of this work removes.
 *
 * Two columns keep it auditable rather than destructive:
 *
 *   - `auto_closed_at` records that the server ended the block, so a student looking at a
 *     short one can see it was not their own Finish;
 *   - `raw_elapsed_seconds` preserves whatever the row said before the cap, so a correction
 *     can be inspected and, if it was wrong, reversed.
 *
 * @param memberId restricts the sweep to one student. Omitted for the scheduled pass.
 */
export async function closeStaleSessions(memberId?: string): Promise<number> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - STALE_SESSION_SECONDS * 1000);

  /*
   * A block's last sign of life is `resumed_at` while it is running and `started_at` once it
   * has been paused — a pause writes no timestamp of its own. `coalesce` picks whichever
   * applies, which makes the test conservative for a long-paused block: it waits longer
   * before closing one, which is the right direction to be wrong in.
   *
   * The comparison and its cast live inside the template on purpose. Written as
   * `lt(sql\`coalesce(...)\`, cutoff)` there is no column on the left for Drizzle to take an
   * encoder from, so the `Date` is handed to the driver raw — which PGlite accepts and
   * postgres.js rejects outright ("must be of type string... Received an instance of Date").
   * Every test passed against the embedded database and the sweep failed on the first run in
   * production. An ISO string with an explicit `::timestamptz` is unambiguous to both.
   */
  const stale = await db
    .select({
      id: studySessions.id,
      elapsedSeconds: studySessions.elapsedSeconds,
      resumedAt: studySessions.resumedAt,
      startedAt: studySessions.startedAt,
    })
    .from(studySessions)
    .where(
      and(
        inArray(studySessions.status, ['running', 'paused']),
        sql`coalesce(${studySessions.resumedAt}, ${studySessions.startedAt}) < ${cutoff.toISOString()}::timestamptz`,
        memberId ? eq(studySessions.memberId, memberId) : undefined,
      ),
    );

  let closed = 0;
  for (const row of stale) {
    const earned = cappedTotal(row, now);
    const wasCapped = earned !== Math.max(0, row.elapsedSeconds) + accruedSeconds(row, now);

    /*
     * The status predicate is repeated here so a concurrent `finishSessionAction` wins the
     * race rather than being overwritten. The student's own Finish is always the better
     * record of what happened.
     */
    const updated = await db
      .update(studySessions)
      .set({
        status: 'abandoned',
        resumedAt: null,
        elapsedSeconds: earned,
        rawElapsedSeconds: wasCapped ? row.elapsedSeconds : null,
        endedAt: now,
        autoClosedAt: now,
      })
      .where(
        and(eq(studySessions.id, row.id), inArray(studySessions.status, ['running', 'paused'])),
      )
      .returning({ id: studySessions.id });

    closed += updated.length;
  }

  return closed;
}

/**
 * Corrects blocks the *old* uncapped arithmetic already wrote.
 *
 * Separate from `closeStaleSessions` because it repairs history rather than settling live
 * state: a block closed weeks ago carrying forty hours is not stale, it is wrong, and it is
 * still inside every minutes total the student is shown.
 *
 * The original value moves to `raw_elapsed_seconds` in every case, so nothing is destroyed
 * and a wrong correction can be undone. Repeat runs are no-ops — a repaired row no longer
 * matches the predicate.
 *
 * @param options.dryRun when true (the default) nothing is written; the count of rows that
 *   *would* be corrected is returned instead.
 */
export async function repairImplausibleSessions(
  options: { dryRun?: boolean } = {},
): Promise<{ found: number; repaired: number }> {
  const dryRun = options.dryRun ?? true;

  const candidates = await db
    .select({ id: studySessions.id, elapsedSeconds: studySessions.elapsedSeconds })
    .from(studySessions)
    .where(
      and(
        sql`${studySessions.elapsedSeconds} > ${MAX_SESSION_SECONDS}`,
        isNull(studySessions.rawElapsedSeconds),
      ),
    );

  if (dryRun || candidates.length === 0) return { found: candidates.length, repaired: 0 };

  const repaired = await db
    .update(studySessions)
    .set({
      rawElapsedSeconds: sql`${studySessions.elapsedSeconds}`,
      elapsedSeconds: MAX_SESSION_SECONDS,
    })
    .where(
      inArray(
        studySessions.id,
        candidates.map((c) => c.id),
      ),
    )
    .returning({ id: studySessions.id });

  return { found: candidates.length, repaired: repaired.length };
}
