import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { CohortReport } from '@/components/report/cohort-report';
import { requireAdmin } from '@/lib/auth/guards';
import { getCohortContext, getPrimaryCohort } from '@/server/context';
import { getEndOfCohortReport } from '@/server/queries/admin';

export const metadata: Metadata = { title: 'Cohort report' };
export const dynamic = 'force-dynamic';

export default async function AdminReportPage({
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
  const report = await getEndOfCohortReport(ctx, memberId);
  if (!report) notFound();

  return (
    <div className="space-y-4">
      <Link
        href={`/admin/students/${memberId}`}
        className="tap text-fg-muted hover:text-fg inline-flex items-center gap-1.5 px-1 py-2 text-sm font-semibold"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to student
      </Link>

      <CohortReport
        data={{
          name: report.member.name,
          cohortName: report.cohortName,
          cohortStart: report.cohortStart,
          cohortEnd: report.cohortEnd,
          overall: report.overall,
          bestStreak: report.bestStreak,
          sessionsAttended: report.sessionsAttended,
          sessionsPossible: report.sessionsPossible,
          topicsCompleted: report.topics.completed,
          topicsTotal: report.topics.total,
          subjectName: report.goals?.subjectName ?? null,
          weeks: report.weeks,
          improvement: report.improvement,
          heatmap: report.heatmap,
          baseline: report.goals
            ? {
                daysStudiedLastWeek: report.goals.baselineDaysStudiedLastWeek,
                consistencyRating: report.goals.baselineConsistencyRating,
                confidence: report.goals.baselineConfidence,
                obstacle: report.goals.biggestObstacle,
              }
            : null,
          finalConfidence: report.reviews[0]?.subjectConfidence ?? null,
        }}
      />
    </div>
  );
}
