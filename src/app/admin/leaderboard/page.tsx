import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireAdmin } from '@/lib/auth/guards';
import { getCohortContext, getPrimaryCohort } from '@/server/context';
import { getAdminLeaderboard } from '@/server/queries/admin';

import { AdminLeaderboardScreen } from './leaderboard-screen';

export const metadata: Metadata = { title: 'Leaderboard' };

// Not prerendered — see the note in the admin layout. This page is all data.
export const instant = false;

/**
 * The cohort ranking, as the lead sees it.
 *
 * Same standings the students see, with the numbers they are computed from left visible
 * rather than summarised: an admin asked to explain why someone is third needs the
 * consistency, show-up rate, streak and points side by side, and a link straight to that
 * student's record.
 */
export default async function AdminLeaderboardPage() {
  await requireAdmin();
  const cohort = await getPrimaryCohort();
  if (!cohort) redirect('/admin/no-cohort');

  const ctx = await getCohortContext(cohort);
  if (!ctx) redirect('/admin/no-cohort');

  const { rows, recognitions } = await getAdminLeaderboard(ctx);

  return (
    <AdminLeaderboardScreen cohortName={cohort.name} rows={rows} recognitions={recognitions} />
  );
}
