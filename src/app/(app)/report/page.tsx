import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, BarChart3 } from 'lucide-react';

import { CohortReport } from '@/components/report/cohort-report';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { requireOnboardedUser } from '@/lib/auth/guards';
import { getCohortContext, getMemberContext } from '@/server/context';
import { getEndOfCohortReport } from '@/server/queries/admin';
import { STUDENT_HOME } from '@/lib/routes';

export const metadata: Metadata = { title: 'Your cohort report' };
export const dynamic = 'force-dynamic';

export default async function ReportPage() {
  const user = await requireOnboardedUser();
  const memberCtx = await getMemberContext(user);
  if (!memberCtx) redirect('/admin');

  const ctx = await getCohortContext(memberCtx.cohort.id);
  if (!ctx) redirect(STUDENT_HOME);

  const report = await getEndOfCohortReport(ctx, memberCtx.memberId);
  if (!report) redirect(STUDENT_HOME);

  const daysLeft =
    new Date(`${ctx.calendar.endDate}T12:00:00Z`).getTime() -
    new Date(`${ctx.today}T12:00:00Z`).getTime();

  if (daysLeft > 0) {
    return (
      <div className="space-y-4">
        <Link
          href="/progress"
          className="tap text-fg-muted hover:text-fg inline-flex items-center gap-1.5 px-1 py-2 text-sm font-semibold"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Progress
        </Link>
        <Card>
          <EmptyState
            icon={<BarChart3 className="size-6" aria-hidden />}
            title="Your report is not ready yet"
            description={`It unlocks when the cohort finishes on ${ctx.calendar.endDate}. Until then, everything you do still counts toward it.`}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        href="/progress"
        className="tap text-fg-muted hover:text-fg inline-flex items-center gap-1.5 px-1 py-2 text-sm font-semibold"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Progress
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
