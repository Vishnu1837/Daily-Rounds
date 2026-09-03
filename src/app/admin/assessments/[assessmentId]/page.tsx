import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { requireAdmin } from '@/lib/auth/guards';
import { getCohortContext, getPrimaryCohort } from '@/server/context';
import { getAssessmentAttempts, getAssessmentDetail } from '@/server/queries/assessments';

import { AssessmentBuilder } from './builder';

export const metadata: Metadata = { title: 'Assessment' };

// Not prerendered — see the note in the admin layout. This page is all data.
export const instant = false;

export default async function AdminAssessmentPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  await requireAdmin();
  const cohort = await getPrimaryCohort();
  if (!cohort) redirect('/admin/no-cohort');

  const ctx = await getCohortContext(cohort);
  if (!ctx) redirect('/admin/no-cohort');

  const { assessmentId } = await params;
  const [detail, attempts] = await Promise.all([
    getAssessmentDetail(ctx, assessmentId),
    getAssessmentAttempts(ctx, assessmentId),
  ]);

  if (!detail) notFound();

  return <AssessmentBuilder cohortId={cohort.id} assessment={detail} attempts={attempts} />;
}
