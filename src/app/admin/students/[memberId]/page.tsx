import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { requireAdmin } from '@/lib/auth/guards';
import { getCohortContext, getPrimaryCohort } from '@/server/context';
import { getStudentDetail, getStudentTopicPlan } from '@/server/queries/admin';

import { StudentDetailScreen } from './student-detail';

export const metadata: Metadata = { title: 'Student' };
export const dynamic = 'force-dynamic';

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  await requireAdmin();
  const cohort = await getPrimaryCohort();
  if (!cohort) redirect('/admin/no-cohort');

  const ctx = await getCohortContext(cohort);
  if (!ctx) redirect('/admin/no-cohort');

  const { memberId } = await params;

  // Both reads key on the same member and neither depends on the other, so they go out
  // together rather than adding a serial round trip to the page.
  const [detail, topicPlan] = await Promise.all([
    getStudentDetail(ctx, memberId),
    getStudentTopicPlan(cohort.id, memberId, ctx.today),
  ]);
  if (!detail) notFound();

  return (
    <StudentDetailScreen
      cohortId={cohort.id}
      today={ctx.today}
      cohortEnded={ctx.today > ctx.calendar.endDate}
      detail={detail}
      topicPlan={topicPlan}
    />
  );
}
