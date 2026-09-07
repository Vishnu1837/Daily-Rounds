import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { sweepRuns } from '@/db/schema';
import { settleOverdueTrees } from '@/server/grove';
import { closeStaleSessions } from '@/server/session-lifecycle';

export { closeStaleSessions, repairImplausibleSessions } from '@/server/session-lifecycle';

/**
 * The background sweep: everything the app cannot finish on its own.
 *
 * Two jobs, deliberately in one place. Both settle records the student's browser was
 * supposed to close and did not, both are decided entirely from server timestamps, and both
 * are idempotent — the predicates match only unsettled rows and each update moves its rows
 * out of that set, so a double-fired schedule, a retry and the lazy per-student call are all
 * safe to overlap.
 *
 * Nothing here awards or removes a point directly. The sweep's job is to make the *source*
 * records honest; the derived `daily_activity` cache follows from them through
 * `recomputeDay`, exactly as it always has.
 */

export type SweepCounts = {
  /** Overdue focus rounds resolved as grown. */
  treesGrown: number;
  /** Study blocks nobody closed, auto-closed at the time they had genuinely earned. */
  sessionsClosed: number;
};

/**
 * Runs every sweep and records that it happened.
 *
 * The `sweep_runs` row is written *before* the work and updated after, so a run that dies
 * mid-flight leaves a row with a null `ok` rather than no trace at all — which is the whole
 * point of the table. A sweep that quietly stopped running is otherwise indistinguishable
 * from a cohort with nothing to sweep, and that is precisely the state the audit found:
 * three trees growing for three days, and no way for anyone to notice.
 */
export async function runSweep(): Promise<SweepCounts & { runId: string }> {
  const [run] = await db.insert(sweepRuns).values({ kind: 'all' }).returning({ id: sweepRuns.id });
  const runId = run!.id;

  try {
    const treesGrown = await settleOverdueTrees();
    const sessionsClosed = await closeStaleSessions();

    await db
      .update(sweepRuns)
      .set({
        finishedAt: new Date(),
        ok: true,
        affected: { trees_grown: treesGrown, sessions_closed: sessionsClosed },
      })
      .where(eq(sweepRuns.id, runId));

    return { runId, treesGrown, sessionsClosed };
  } catch (error) {
    await db
      .update(sweepRuns)
      .set({
        finishedAt: new Date(),
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
      .where(eq(sweepRuns.id, runId));
    throw error;
  }
}

export type SweepStatusRow = {
  /** Minutes since the run began, measured against the server clock. */
  ageMinutes: number;
  finished: boolean;
  ok: boolean | null;
  affected: Record<string, number>;
  error: string | null;
};

/**
 * The newest sweep run, for the admin panel. Null before the first one has ever run.
 *
 * The age is computed here rather than handed to the screen as a timestamp. Two reasons, and
 * both matter: "has the sweep stopped running?" is a timing decision, and every timing
 * decision in this product is now taken against the server's clock rather than a browser's;
 * and reading the current time inside a component — server or client — is exactly the
 * impurity the React compiler refuses, correctly.
 */
export async function latestSweepRun(): Promise<SweepStatusRow | null> {
  const rows = await db
    .select({
      ageMinutes: sql<number>`greatest(
        0, floor(extract(epoch FROM (now() - ${sweepRuns.startedAt})) / 60)
      )::int`,
      finishedAt: sweepRuns.finishedAt,
      ok: sweepRuns.ok,
      affected: sweepRuns.affected,
      error: sweepRuns.error,
    })
    .from(sweepRuns)
    .orderBy(sql`${sweepRuns.startedAt} DESC`)
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    ageMinutes: row.ageMinutes,
    finished: row.finishedAt !== null,
    ok: row.ok,
    affected: row.affected,
    error: row.error,
  };
}
