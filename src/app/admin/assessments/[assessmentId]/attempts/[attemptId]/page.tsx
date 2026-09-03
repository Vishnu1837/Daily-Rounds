import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { requireAdmin } from '@/lib/auth/guards';
import { getPrimaryCohort } from '@/server/context';
import { getAttemptDetail } from '@/server/queries/assessments';

import { AttemptReview } from './review';

export const metadata: Metadata = { title: 'Attempt' };

// Not prerendered — see the note in the admin layout. This page is all data.
export const instant = false;

export default async function AdminAttemptPage({
  params,
}: {
  params: Promise<{ assessmentId: string; attemptId: string }>;
}) {
  await requireAdmin();
  const cohort = await getPrimaryCohort();
  if (!cohort) redirect('/admin/no-cohort');

  const { assessmentId, attemptId } = await params;

  /*
   * The cohort id goes into the query rather than being checked afterwards, so an attempt
   * belonging to another cohort is simply not found. Admins see everything on their own
   * students' papers — score, answers, timings and the integrity log.
   */
  const detail = await getAttemptDetail({
    attemptId,
    viewer: { kind: 'admin', cohortId: cohort.id },
  });

  if (!detail || detail.assessmentId !== assessmentId) notFound();

  return <AttemptReview cohortId={cohort.id} attempt={detail} />;
}
