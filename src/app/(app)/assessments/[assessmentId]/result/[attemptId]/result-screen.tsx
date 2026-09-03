'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, Clock, HelpCircle, Lock, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardAurora, SectionTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat';
import { cn } from '@/lib/cn';
import { feedbackBand } from '@/lib/assessments/grade';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import type { AttemptDetail } from '@/server/queries/assessments';

function formatSeconds(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * The student's own result.
 *
 * Private by construction — the page that renders this only ever loads the caller's own
 * attempt. What is left is a design problem rather than a privacy one: a score is a blunt
 * thing to hand someone, so the screen leads with the number, then says what it means in
 * words, then shows the working. When written answers are still with the cohort lead it
 * says so rather than quietly counting them as zero.
 */
export function ResultScreen({ attempt }: { attempt: AttemptDetail }) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(0);

  const band = feedbackBand(attempt.pct, attempt.passMarkPct);
  const passed = attempt.pct >= attempt.passMarkPct;
  const reviewable = attempt.answers.some((a) => a.correctIndex !== null || a.explanation);

  /*
   * The number counts up once on arrival — the one flourish on this screen.
   *
   * Reduced motion skips the animation rather than fast-forwarding it: the effect does not
   * run at all, and the final value is read straight from the score below.
   */
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const steps = 28;
    const id = setInterval(() => {
      frame += 1;
      setShown(Math.round((attempt.pct * frame) / steps));
      if (frame >= steps) clearInterval(id);
    }, 22);
    return () => clearInterval(id);
  }, [attempt.pct, reduced]);

  const display = reduced ? attempt.pct : shown;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link
        href="/assessments"
        className="text-fg-muted hover:text-fg inline-flex items-center gap-1.5 text-sm font-semibold"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All assessments
      </Link>

      <PageHeader
        eyebrow={`Attempt #${attempt.attemptNumber}`}
        title={attempt.assessmentTitle}
        description="Only you and your cohort lead can see this."
      />

      {/* ------------------------------------------------------------- score */}
      <Card
        variant="solid"
        tone={passed ? 'pulse' : 'iris'}
        padding="lg"
        glow
        className="overflow-hidden text-center text-white"
      >
        <CardAurora tone={passed ? 'pulse' : 'iris'} />
        <div className="relative">
          <motion.p
            initial={reduced ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            className="text-6xl leading-none font-extrabold tabular-nums"
          >
            {display}%
          </motion.p>
          <p className="mt-3 text-sm font-semibold text-white/80">
            {attempt.earned} of {attempt.outOf} marks
            {attempt.provisional ? ' marked so far' : ''}
          </p>

          <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 ring-1 ring-white/25 ring-inset">
            <span aria-hidden>{band.emoji}</span>
            <span className="text-sm font-bold">{band.title}</span>
          </div>
          <p className="mx-auto mt-3 max-w-sm text-sm text-white/75">{band.message}</p>
        </div>
      </Card>

      {attempt.provisional && (
        <Card className="border-warning/40 bg-warning/8 flex items-start gap-3 p-4">
          <Clock className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-fg text-sm">
            <span className="font-bold">Not final yet.</span> Your written answers are with your
            cohort lead. The percentage above covers only what has been marked — it will change when
            they finish.
          </p>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Correct" value={String(attempt.correct)} tone="success" />
        <StatTile label="Incorrect" value={String(attempt.incorrect)} tone="danger" />
        <StatTile label="Unanswered" value={String(attempt.unanswered)} />
        <StatTile
          label="Time taken"
          value={formatSeconds(attempt.secondsTaken)}
          sub={
            attempt.answers.length > 0 && attempt.secondsTaken !== null
              ? `~${Math.round(attempt.secondsTaken / attempt.answers.length)}s a question`
              : undefined
          }
        />
      </div>

      {attempt.restartCount > 0 && (
        <Card className="p-4">
          <p className="text-fg-muted text-sm">
            This assessment restarted {attempt.restartCount}{' '}
            {attempt.restartCount === 1 ? 'time' : 'times'} because the page lost focus. Your cohort
            lead can see that.
          </p>
        </Card>
      )}

      {attempt.feedback && (
        <Card className="p-5">
          <SectionTitle>From your cohort lead</SectionTitle>
          <p className="text-fg mt-2 text-sm whitespace-pre-wrap">{attempt.feedback}</p>
        </Card>
      )}

      {/* ---------------------------------------------------------- the paper */}
      <div>
        <SectionTitle>Question by question</SectionTitle>

        {!reviewable && (
          <Card className="mt-3 flex items-start gap-3 p-4">
            <Lock className="text-fg-subtle mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="text-fg-muted text-sm">
              Your cohort lead has kept the answers hidden for this paper. You can see what you
              chose, but not which option was right.
            </p>
          </Card>
        )}

        <div className="mt-3 space-y-3">
          {attempt.answers.map((answer) => {
            const written = answer.type === 'short_answer' || answer.type === 'long_answer';
            const awaiting = written && attempt.reviewStatus === 'pending';

            return (
              <Card key={answer.questionId} className="p-5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-fg-subtle text-2xs font-bold tracking-[0.14em] uppercase">
                    Q{answer.position + 1}
                  </span>
                  {answer.expired && <Badge tone="neutral">Timed out</Badge>}
                  {awaiting ? (
                    <Badge tone="warning">Pending review</Badge>
                  ) : answer.isCorrect === true ? (
                    <Badge tone="success">Correct</Badge>
                  ) : answer.isCorrect === false ? (
                    <Badge tone="danger">Incorrect</Badge>
                  ) : null}
                  {answer.secondsTaken !== null && (
                    <span className="text-fg-subtle ml-auto inline-flex items-center gap-1 text-xs">
                      <Clock className="size-3.5" aria-hidden />
                      {formatSeconds(answer.secondsTaken)}
                    </span>
                  )}
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

                {!written && (
                  <ul className="mt-3 space-y-1.5">
                    {answer.options.map((option, index) => {
                      const isCorrect = index === answer.correctIndex;
                      const isChosen = index === answer.selectedIndex;
                      return (
                        <li
                          key={index}
                          className={cn(
                            'rounded-panel flex items-center gap-2 border px-3 py-2 text-sm',
                            isCorrect
                              ? 'border-success/50 bg-success/8 text-fg font-semibold'
                              : isChosen
                                ? 'border-danger/50 bg-danger/8 text-fg'
                                : 'border-border text-fg-muted',
                          )}
                        >
                          <span className="w-4 shrink-0 font-bold">
                            {String.fromCharCode(65 + index)}
                          </span>
                          <span className="min-w-0 flex-1">{option}</span>
                          {isCorrect && (
                            <CheckCircle2
                              className="text-success size-4 shrink-0"
                              aria-label="Correct answer"
                            />
                          )}
                          {isChosen && !isCorrect && (
                            <XCircle
                              className="text-danger size-4 shrink-0"
                              aria-label="Your answer"
                            />
                          )}
                        </li>
                      );
                    })}
                    {answer.selectedIndex === null && (
                      <li className="text-fg-subtle flex items-center gap-1.5 px-1 text-xs">
                        <HelpCircle className="size-3.5" aria-hidden />
                        You did not answer this one.
                      </li>
                    )}
                  </ul>
                )}

                {written && (
                  <div className="mt-3">
                    <p className="eyebrow">Your answer</p>
                    <p className="rounded-panel bg-bg-sunken text-fg mt-1 p-3 text-sm whitespace-pre-wrap">
                      {answer.textAnswer?.trim() || 'You did not answer this one.'}
                    </p>
                    {awaiting ? (
                      <p className="text-fg-muted mt-2 text-sm">
                        Waiting for your cohort lead to mark it.
                      </p>
                    ) : (
                      <p className="text-fg-muted mt-2 text-sm">
                        <span className="text-fg font-bold">
                          {answer.awardedPoints} of {answer.points}
                        </span>{' '}
                        marks
                        {answer.reviewerNote ? ` — ${answer.reviewerNote}` : ''}
                      </p>
                    )}
                  </div>
                )}

                {answer.explanation && (
                  <p className="text-fg-muted mt-3 text-sm">
                    <span className="text-fg-subtle font-semibold">Why: </span>
                    {answer.explanation}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
