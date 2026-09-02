import 'server-only';

import { and, eq, lt } from 'drizzle-orm';

import { db } from '@/db/client';
import { focusTrees } from '@/db/schema';
import { ABANDON_SWEEP_SECONDS } from '@/lib/domain/grove';

/**
 * Settles rounds nobody came back to.
 *
 * A student who closes the laptop mid-round leaves a `growing` row behind, and there is no
 * background worker in this product to tidy it up. So the sweep runs lazily: every read of
 * the grove and every plant settles the caller's own overdue trees first. That keeps the
 * grove honest without a cron job, and — because it only ever touches rows belonging to the
 * member doing the reading — it cannot become a way to poke at anyone else's data.
 *
 * The cutoff is generous on purpose. A tree is only swept once it is past its due time *plus*
 * the sweep window, so a browser that is a few seconds slow to report a finished round still
 * gets to claim it.
 */
export async function sweepAbandonedTrees(memberId: string): Promise<number> {
  const cutoff = new Date(Date.now() - ABANDON_SWEEP_SECONDS * 1000);

  const settled = await db
    .update(focusTrees)
    .set({ status: 'withered', witherReason: 'abandoned', settledAt: new Date() })
    .where(
      and(
        eq(focusTrees.memberId, memberId),
        eq(focusTrees.status, 'growing'),
        lt(focusTrees.dueAt, cutoff),
      ),
    )
    .returning({ id: focusTrees.id });

  return settled.length;
}
