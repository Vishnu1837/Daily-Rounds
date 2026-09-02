import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireAdmin } from '@/lib/auth/guards';
import { getPrimaryCohort } from '@/server/context';
import { getCohortGroves } from '@/server/queries/grove';

import { CohortGroveScreen } from '../../(app)/grove/cohort/cohort-grove-screen';

export const metadata: Metadata = { title: 'Grove' };

// Not prerendered — see the note in the admin layout. A grove wall five minutes stale is
// the one thing this screen must not be.
export const instant = false;

/**
 * The cohort's groves, for the cohort lead.
 *
 * An admin has no membership and therefore no grove of their own, so the console shows the
 * wall rather than a personal plot: every student, what they have grown, and when they last
 * grew anything — which is the read a lead actually wants before a check-in call. Each tile
 * opens that student's record instead of the peer view a classmate would get.
 */
export default async function AdminGrovePage() {
  await requireAdmin();
  const cohort = await getPrimaryCohort();
  if (!cohort) redirect('/admin/no-cohort');

  const rows = await getCohortGroves({ cohort: { id: cohort.id } });

  return (
    <CohortGroveScreen rows={rows} cohortName={cohort.name} rowBasePath="/admin/students" />
  );
}
