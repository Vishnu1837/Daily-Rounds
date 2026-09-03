'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Clock, RotateCcw, ShieldAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, SectionTitle } from '@/components/ui/card';
import { TextArea, TextInput } from '@/components/ui/form';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { reviewAttemptAction } from '@/server/actions/assessments';
import type { AttemptDetail } from '@/server/queries/assessments';

const INTEGRITY_LABELS: Record<string, string> = {
  focus_lost: 'Left the assessment',
  focus_returned: 'Came back within the grace period',
  threshold_breached: 'Away past the threshold',
  restarted: 'Attempt restarted',
};

function formatSeconds(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export function AttemptReview({ cohortId, attempt }: { cohortId: string; attempt: AttemptDetail }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState(attempt.feedback ?? '');

  const written = attempt.answers.filter(
    (a) => a.type === 'short_answer' || a.type === 'long_answer',
  );
  const [marks, setMarks] = useState<Record<string, { points: number; note: string }>>(() =>
    Object.fromEntries(
      written.map((a) => [a.answerId, { points: a.awardedPoints, note: a.reviewerNote ?? '' }]),
    ),
  );

  const breaches = attempt.integrity.filter((e) => e.kind !== 'focus_returned');

  function save() {
    startTransition(async () => {
      const result = await reviewAttemptAction(cohortId, {
        attemptId: attempt.attemptId,
        feedback: feedback || undefined,
        marks: written.map((a) => ({
          answerId: a.answerId,
          awardedPoints: marks[a.answerId]?.points ?? 0,
          reviewerNote: marks[a.answerId]?.note || undefined,
        })),
      });
      if (!result.ok) {
        toast.error('Could not save the review', result.message);
        return;
      }
      toast.success('Review saved', 'The student can see their full result now.');
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <Link
        href={`/admin/assessments/${attempt.assessmentId}`}
        className="text-fg-muted hover:text-fg inline-flex items-center gap-1.5 text-sm font-semibold"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to {attempt.assessmentTitle}
      </Link>

      <PageHeader
        eyebrow={`Attempt #${attempt.attemptNumber}`}
        title={attempt.studentName}
        description={
          attempt.status === 'invalidated'
            ? 'This sitting was restarted after an integrity breach. It is kept as part of the record.'
            : `${attempt.assessmentTitle} · submitted ${attempt.submittedAt ? attempt.submittedAt.toLocaleString('en-GB') : '—'}`
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Score"
          value={`${attempt.pct}%`}
          sub={
            attempt.provisional
              ? 'Provisional — written answers still to mark'
              : `${attempt.earned} of ${attempt.outOf} marks`
          }
        />
        <StatTile
          label="Correct"
          value={String(attempt.correct)}
          sub={`${attempt.incorrect} wrong · ${attempt.unanswered} unanswered`}
        />
        <StatTile label="Time taken" value={formatSeconds(attempt.secondsTaken)} />
        <StatTile
          label="Restarts"
          value={String(attempt.restartCount)}
          sub={breaches.length > 0 ? `${breaches.length} integrity events` : 'Clean run'}
        />
      </div>

      {/* -------------------------------------------------------- integrity */}
      <Card className="p-0">
        <CardHeader
          title="Integrity log"
          icon={<ShieldAlert className="text-fg-subtle size-4" aria-hidden />}
          description="Focus detection is a deterrent, not proctoring. It cannot prove a second device was used — read it as behaviour, not as a verdict."
        />
        {attempt.integrity.length === 0 ? (
          <p className="text-fg-muted px-5 pb-5 text-sm">
            Nothing recorded. The tab stayed in front for the whole attempt.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {attempt.integrity.map((event, index) => (
              <li key={index} className="flex items-center gap-3 px-5 py-3">
                <span
                  className={cn(
                    'grid size-8 shrink-0 place-items-center rounded-full',
                    event.kind === 'focus_returned'
                      ? 'bg-bg-sunken text-fg-subtle'
                      : 'bg-warning/15 text-warning-strong dark:text-warning',
                  )}
                >
                  {event.kind === 'restarted' ? (
                    <RotateCcw className="size-4" aria-hidden />
                  ) : (
                    <AlertTriangle className="size-4" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-fg text-sm font-semibold">
                    {INTEGRITY_LABELS[event.kind] ?? event.kind}
                  </p>
                  <p className="text-fg-subtle text-xs">
                    {event.occurredAt.toLocaleString('en-GB')}
                    {event.awayMs !== null ? ` · away ${(event.awayMs / 1000).toFixed(1)}s` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ------------------------------------------------------ the answers */}
      <div>
        <SectionTitle>Answers</SectionTitle>
        <div className="mt-3 space-y-3">
          {attempt.answers.map((answer) => {
            const isWritten = answer.type === 'short_answer' || answer.type === 'long_answer';
            const mark = marks[answer.answerId];

            return (
              <Card key={answer.questionId} className="p-5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-fg-subtle text-2xs font-bold tracking-[0.14em] uppercase">
                    Q{answer.position + 1}
                  </span>
                  {answer.expired && <Badge tone="neutral">Timed out</Badge>}
                  {!isWritten && answer.isCorrect === true && <Badge tone="success">Correct</Badge>}
                  {!isWritten && answer.isCorrect === false && <Badge tone="danger">Wrong</Badge>}
                  {isWritten && <Badge tone="iris">Written</Badge>}
                  <span className="text-fg-subtle ml-auto inline-flex items-center gap-1 text-xs">
                    <Clock className="size-3.5" aria-hidden />
                    {formatSeconds(answer.secondsTaken)}
                  </span>
                </div>

                <p className="text-fg text-sm font-semibold">{answer.prompt}</p>

                {answer.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={answer.imageUrl}
                    alt=""
                    className="rounded-panel border-border mt-3 max-h-64 border object-contain"
                  />
                )}

                {!isWritten && (
                  <ul className="mt-3 space-y-1.5">
                    {answer.options.map((option, index) => (
                      <li
                        key={index}
                        className={cn(
                          'rounded-panel border px-3 py-2 text-sm',
                          index === answer.correctIndex
                            ? 'border-success/50 bg-success/8 text-fg'
                            : index === answer.selectedIndex
                              ? 'border-danger/50 bg-danger/8 text-fg'
                              : 'border-border text-fg-muted',
                        )}
                      >
                        <span className="mr-2 font-bold">{String.fromCharCode(65 + index)}</span>
                        {option}
                        {index === answer.selectedIndex && (
                          <span className="text-fg-subtle ml-2 text-xs">— their answer</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {isWritten && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <p className="eyebrow">Their answer</p>
                      <p className="rounded-panel bg-bg-sunken text-fg mt-1 p-3 text-sm whitespace-pre-wrap">
                        {answer.textAnswer?.trim() || 'Nothing written.'}
                      </p>
                    </div>
                    {answer.referenceAnswer && (
                      <div>
                        <p className="eyebrow">Model answer</p>
                        <p className="text-fg-muted mt-1 text-sm whitespace-pre-wrap">
                          {answer.referenceAnswer}
                        </p>
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                      <TextInput
                        label={`Marks (of ${answer.points})`}
                        type="number"
                        min={0}
                        max={answer.points}
                        value={mark?.points ?? 0}
                        onChange={(e) =>
                          setMarks((current) => ({
                            ...current,
                            [answer.answerId]: {
                              points: Math.max(
                                0,
                                Math.min(answer.points, Number(e.target.value) || 0),
                              ),
                              note: current[answer.answerId]?.note ?? '',
                            },
                          }))
                        }
                      />
                      <TextInput
                        label="Note for the student (optional)"
                        value={mark?.note ?? ''}
                        onChange={(e) =>
                          setMarks((current) => ({
                            ...current,
                            [answer.answerId]: {
                              points: current[answer.answerId]?.points ?? 0,
                              note: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                )}

                {answer.explanation && (
                  <p className="text-fg-muted mt-3 text-sm">
                    <span className="text-fg-subtle font-semibold">Explanation: </span>
                    {answer.explanation}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* --------------------------------------------------------- feedback */}
      {(written.length > 0 || attempt.reviewStatus !== 'auto') && (
        <Card className="p-5">
          <SectionTitle>Feedback</SectionTitle>
          <p className="text-fg-muted mt-1 mb-3 text-sm">
            {written.length > 0
              ? 'Saving releases the final score to the student. Until then their result shows the written questions as pending.'
              : 'A note the student sees on their private result.'}
          </p>
          <TextArea
            label="Note for the student"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Revise the brachial plexus before moving on — the rest was strong."
          />
          <Button size="lg" className="mt-4" loading={pending} onClick={save}>
            {written.length > 0 ? 'Save marks and release result' : 'Save feedback'}
          </Button>
        </Card>
      )}
    </div>
  );
}
