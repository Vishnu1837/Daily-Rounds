'use client';

import Link from 'next/link';
import { ClipboardList, Clock, PlayCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/page-header';
import type { StudentAssessmentRow } from '@/server/queries/assessments';

function describeLength(row: StudentAssessmentRow): string {
  if (row.totalTimeSeconds) return `${Math.round(row.totalTimeSeconds / 60)} min`;
  return 'Timed per question';
}

/**
 * The student's assessment list.
 *
 * Their own history against each paper and nothing about anyone else's — no cohort average,
 * no ranking, no "12 of 27 have passed". Assessment results are private, and a list is
 * exactly the sort of screen where a comparison sneaks in by accident.
 */
export function AssessmentsListScreen({ rows }: { rows: StudentAssessmentRow[] }) {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Check your recall"
        title="Assessments"
        description="Timed papers set by your cohort lead. Your results are private to you and them."
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList className="size-6" aria-hidden />}
            title="Nothing set right now"
            description="When your cohort lead publishes an assessment it will appear here."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id} className="p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="eyebrow">{row.subjectName ?? 'Assessment'}</p>
                  <h2 className="text-fg mt-1 text-lg font-extrabold">{row.title}</h2>
                  <p className="text-fg-muted mt-1 flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3.5" aria-hidden />
                      {describeLength(row)}
                    </span>
                    <span aria-hidden>·</span>
                    <span>
                      {row.questionCount} {row.questionCount === 1 ? 'question' : 'questions'}
                    </span>
                    <span aria-hidden>·</span>
                    <span>pass {row.passMarkPct}%</span>
                  </p>
                </div>

                {row.lastAttempt && (
                  <Badge
                    tone={
                      row.lastAttempt.provisional
                        ? 'warning'
                        : row.lastAttempt.passed
                          ? 'success'
                          : 'danger'
                    }
                  >
                    {row.lastAttempt.provisional ? 'Being marked' : `${row.lastAttempt.pct}%`}
                  </Badge>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {row.inProgressAttemptId ? (
                  <Link
                    href={`/assessments/${row.id}/attempt/${row.inProgressAttemptId}`}
                    className="bg-pulse-600 hover:bg-pulse-500 rounded-panel inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white transition-colors"
                  >
                    <PlayCircle className="size-4" aria-hidden />
                    Resume
                  </Link>
                ) : (
                  <Link
                    href={`/assessments/${row.id}`}
                    className="bg-pulse-600 hover:bg-pulse-500 rounded-panel inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white transition-colors"
                  >
                    <PlayCircle className="size-4" aria-hidden />
                    {row.lastAttempt ? 'Sit it again' : 'Start'}
                  </Link>
                )}

                {row.lastAttempt && (
                  <Link
                    href={`/assessments/${row.id}/result/${row.lastAttempt.attemptId}`}
                    className="border-border text-fg hover:bg-bg-sunken rounded-panel inline-flex items-center gap-2 border px-4 py-2.5 text-sm font-bold transition-colors"
                  >
                    View your result
                  </Link>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
