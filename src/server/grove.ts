import 'server-only';

import { and, eq, lt, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { focusTrees } from '@/db/schema';
import { SWEEP_DELAY_SECONDS } from '@/lib/domain/grove';

/**
 * Settles rounds whose due time passed while nobody was looking.
 *
 * The outcome is decided by `resolveOverdueRound`: a round whose promised interval has
 * elapsed on the *server's* clock is grown, because that is the whole of what the round
 * asked for. This used to wither every overdue row on the theory that a browser which
 * stopped talking had walked away — which punished the students who put the phone down and
 * sat there, and produced most of the stumps in the grove.
 *
 * Quitting still leaves a stump. It is recorded by `witherTreeAction` when the student says
 * so, never inferred here from silence.
 *
 * Two properties this relies on:
 *
 *  - **It is idempotent.** The `WHERE` clause matches only `growing` rows past their due
 *    time, and the update moves them out of that set, so running it twice settles nothing
 *    twice. It is safe from the lazy read path and from the scheduled sweep at once.
 *  - **It is time-truthful.** The cutoff is `due_at`, which was computed from `planted_at`
 *    when the round started. Nothing the client sends reaches this decision.
 *
 * The `SWEEP_DELAY_SECONDS` grace is only about *who* settles the round, not whether it
 * survived: it leaves the browser a window to claim its own tree and fire its own
 * celebration before the server quietly does it on the student's behalf.
 *
 * @param memberId restricts the sweep to one student's rows. Omit it for the scheduled
 *   whole-cohort sweep; the lazy call sites always pass their own id, so a read of the
 *   grove can never touch anyone else's data.
 */
export async function settleOverdueTrees(memberId?: string): Promise<number> {
  const cutoff = new Date(Date.now() - SWEEP_DELAY_SECONDS * 1000);

  const overdue = and(
    eq(focusTrees.status, 'growing'),
    lt(focusTrees.dueAt, cutoff),
    memberId ? eq(focusTrees.memberId, memberId) : undefined,
  );

  const settled = await db
    .update(focusTrees)
    .set({ status: 'grown', witherReason: null, settledAt: sql`now()` })
    .where(overdue)
    .returning({ id: focusTrees.id });

  return settled.length;
}
