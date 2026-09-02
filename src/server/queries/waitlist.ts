import 'server-only';

import { desc } from 'drizzle-orm';

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
