import 'server-only';

import { and, eq } from 'drizzle-orm';
import { updateTag } from 'next/cache';

import { db } from '@/db/client';
import { cohortMembers } from '@/db/schema';

/**
 * The cache tags, and the only sanctioned way to clear them.
 *
 * Three domains, chosen so that each maps to a single kind of write rather than to a single
 * screen. Tagging per screen is the version of this that rots: a new page that reads cohort
 * standings would silently miss every invalidation, because nothing would have told it which
 * tag it was supposed to be listening to.
 *
 *  - `config`   the shape of the cohort's calendar and what each behaviour pays. Changes
 *               only when a cohort lead edits settings, holidays or point rules.
 *  - `activity` anything a student did that moves a number: points, attendance, check-ins,
 *               study sessions, and the derived daily activity built from them.
 *  - `library`  the cohort's materials shelf.
 *
 * Reads are tagged where the data is loaded; writes clear the tag from the one function that
 * actually performs the write. Keeping both ends inside this module means the tag strings
 * themselves are never written out by hand anywhere else, which is what makes a typo a
 * compile error rather than a stale leaderboard nobody notices for a week.
 */
export const cohortTag = {
  config: (cohortId: string) => `cohort:${cohortId}:config`,
  activity: (cohortId: string) => `cohort:${cohortId}:activity`,
  library: (cohortId: string) => `cohort:${cohortId}:library`,
} as const;

/**
 * `updateTag`, not `revalidateTag`.
 *
 * The difference decides whether a student sees their own check-in. `revalidateTag` marks an
 * entry stale and refreshes it in the background, so the render that happens immediately
 * after the action — the one the student is watching — can still be served the old numbers.
 * `updateTag` expires the entry there and then, so the refresh that follows the action reads
 * through to the database. For a screen whose entire purpose is to reflect what you just did,
 * eventual consistency is the wrong default.
 *
 * Invalidation also runs outside a request: the seeder and the migration scripts recompute
 * activity with no cache in front of them and no request context to update. That is not an
 * error worth failing a seed over, so it is swallowed here rather than at every call site.
 */
function clear(tag: string): void {
  try {
    updateTag(tag);
  } catch {
    /* No request context — a script, not a server action. Nothing is cached to clear. */
  }
}

/** Call after changing a cohort's calendar, settings or point rules. */
export function invalidateCohortConfig(cohortId: string): void {
  clear(cohortTag.config(cohortId));
}

/**
 * Call after anything that moves a student's numbers.
 *
 * In practice this has exactly one caller — `recomputeDay`, the sole writer of the derived
 * activity table — plus the roster changes that add or remove people from the ranking.
 * Every check-in, study block, quiz and attendance mark funnels through that one function,
 * so new features inherit the invalidation instead of having to remember it.
 */
export function invalidateCohortActivity(cohortId: string): void {
  clear(cohortTag.activity(cohortId));
}

/** Call after adding, editing or removing a material. */
export function invalidateCohortLibrary(cohortId: string): void {
  clear(cohortTag.library(cohortId));
}

/**
 * Clears the cohort ranking after someone edits their own name or picture.
 *
 * Both are carried in the cached leaderboard rows next to the numbers, so without this a
 * student changes their photo and then finds the old one still looking back at them from
 * the rankings. The membership lookup is one query on an action somebody performs perhaps
 * twice a year, which is a fair price for the alternative not being confusing.
 */
export async function invalidateOwnRanking(userId: string): Promise<void> {
  const rows = await db
    .select({ cohortId: cohortMembers.cohortId })
    .from(cohortMembers)
    .where(and(eq(cohortMembers.userId, userId), eq(cohortMembers.status, 'active')))
    .limit(1);
  if (rows[0]) invalidateCohortActivity(rows[0].cohortId);
}
