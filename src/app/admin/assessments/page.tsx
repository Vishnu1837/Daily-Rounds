import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireAdmin } from '@/lib/auth/guards';
import { getCohortContext, getPrimaryCohort } from '@/server/context';
import { getAssessments } from '@/server/queries/assessments';

import { AssessmentsScreen } from './assessments-screen';

export const metadata: Metadata = { title: 'Assessments' };

// Not prerendered — see the note in the admin layout. This page is all data.
export const instant = false;

export default async function AdminAssessmentsPage() {
  await requireAdmin();
  const cohort = await getPrimaryCohort();
  if (!cohort) redirect('/admin/no-cohort');

  const ctx = await getCohortContext(cohort);
  if (!ctx) redirect('/admin/no-cohort');

  const rows = await getAssessments(ctx);
  return <AssessmentsScreen cohortId={cohort.id} rows={rows} />;
}
