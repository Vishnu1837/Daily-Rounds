import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { getMemberContext } from '@/server/context';
import { getCohortGroves } from '@/server/queries/grove';

import { CohortGroveScreen } from './cohort-grove-screen';

export const metadata: Metadata = { title: 'Cohort groves' };
export const dynamic = 'force-dynamic';

/**
 * Every grove in the cohort.
 *
 * Rendered dynamically rather than cached: the whole point is that a round finished five
 * minutes ago is already on the wall when a classmate opens it.
 */
export default async function CohortGrovePage() {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  const rows = await getCohortGroves(ctx);

  return <CohortGroveScreen rows={rows} cohortName={ctx.cohort.name} />;
}
