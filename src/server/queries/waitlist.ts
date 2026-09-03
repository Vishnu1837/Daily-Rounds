import 'server-only';

import { desc, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { waitlistEntries } from '@/db/schema';
import type { WaitlistRow } from '@/lib/domain/waitlist';

/**
 * Every next-cohort enquiry, newest first.
 *
 * Read in one go rather than paged. The whole point of the screen is that an admin can
 * search, filter and export the *complete* list, and a waitlist that grew large enough for
 * paging to matter would be a very good problem to have — at which point the filter moves
 * into SQL and this comment gets deleted.
 *
 * There is deliberately no student-facing counterpart to this file. Contact details on this
 * table are only ever read by an admin-guarded surface.
 */
export async function getWaitlistEntries(): Promise<WaitlistRow[]> {
  const rows = await db.select().from(waitlistEntries).orderBy(desc(waitlistEntries.createdAt));

  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    whatsapp: row.whatsapp,
    email: row.email,
    mbbsYear: row.mbbsYear,
    university: row.university,
    challenge: row.challenge,
    status: row.status,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * How many enquiries are waiting, and how many nobody has spoken to yet.
 *
 * A separate read from `getWaitlistEntries` rather than a `.length` on it, because the only
 * caller is the admin overview: aggregating in Postgres keeps every contact detail on the
 * server for a screen that just wants to show a number. Unlike everything else on that
 * dashboard this is not cohort-scoped — the waitlist is for the *next* cohort, so it has no
 * cohort to be scoped to yet.
 */
export async function getWaitlistCounts(): Promise<{ total: number; new: number }> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      fresh: sql<number>`count(*) FILTER (WHERE ${waitlistEntries.status} = 'new')::int`,
    })
    .from(waitlistEntries);

  return { total: row?.total ?? 0, new: row?.fresh ?? 0 };
}
