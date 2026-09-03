'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clock, Eye, Hourglass, ShieldAlert, Timer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { startAttemptAction } from '@/server/actions/assessments';

type Brief = {
  id: string;
  title: string;
  instructions: string | null;
  subjectName: string | null;
  totalTimeSeconds: number | null;
  defaultQuestionSeconds: number;
  focusGraceSeconds: number;
  passMarkPct: number;
  questionCount: number;
  questionSeconds: number;
};

function minutes(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const m = Math.round(seconds / 60);
  return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
}

/**
 * The pre-start screen.
 *
 * Everything that can surprise a student mid-attempt is said here, in plain words, before
 * any clock starts: that individual questions expire, that leaving the tab restarts the
 * paper, and that the honesty of the thing rests on them rather than on surveillance. The
 * timers begin only when they press the button — that is why this screen exists at all.
 */
export function RulesScreen({
  brief,
  previousAttempts,
}: {
  brief: Brief;
  previousAttempts: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [starting, setStarting] = useState(false);

  const totalLabel = brief.totalTimeSeconds
    ? minutes(brief.totalTimeSeconds)
    : minutes(brief.questionSeconds);

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
        eyebrow={brief.subjectName ?? 'Assessment'}
        title={brief.title}
        description={
          previousAttempts > 0
            ? `You have sat this ${previousAttempts === 1 ? 'once' : `${previousAttempts} times`} before. Starting again creates a new attempt; the old ones are kept.`
            : 'Read this before you begin — the clock starts when you press the button.'
        }
      />

      {brief.instructions && (
        <Card className="p-5">
          <SectionTitle>From your cohort lead</SectionTitle>
          <p className="text-fg mt-2 text-sm whitespace-pre-wrap">{brief.instructions}</p>
        </Card>
      )}

      <Card className="divide-border divide-y p-0">
        <Rule
          icon={<Hourglass className="size-4" aria-hidden />}
          title={`${brief.questionCount} ${brief.questionCount === 1 ? 'question' : 'questions'}, about ${totalLabel}`}
          body={
            brief.totalTimeSeconds
              ? `There is a ${minutes(brief.totalTimeSeconds)} limit on the whole paper, running alongside the per-question timers.`
              : `Each question has its own timer — ${brief.defaultQuestionSeconds} seconds unless it says otherwise.`
          }
        />
        <Rule
          icon={<Timer className="size-4" aria-hidden />}
          title="Questions expire on their own"
          body="When a question's timer runs out it locks and moves on. An unanswered question scores nothing, so answer rather than perfect."
        />
        <Rule
          icon={<ShieldAlert className="size-4" aria-hidden />}
          title="Leaving the page restarts the assessment"
          body={`Switching tabs or apps for more than ${brief.focusGraceSeconds} seconds restarts you from question 1. Coming straight back is fine. Every restart is recorded for your cohort lead.`}
        />
        <Rule
          icon={<Clock className="size-4" aria-hidden />}
          title="Refreshing does not buy you time"
          body="Every deadline is held on the server. Reloading the page brings back the same clock you left."
        />
        <Rule
          icon={<Eye className="size-4" aria-hidden />}
          title="Your result is private"
          body="Your score, your answers and your mistakes are visible to you and your cohort lead. No other student can see them."
        />
      </Card>

      <Card className="bg-bg-sunken p-5">
        <p className="text-fg text-sm">
          <span className="font-bold">On your honour.</span> Nothing here can tell whether a
          textbook is open beside you — this only works if you sit it as if it counted. Pass mark is{' '}
          {brief.passMarkPct}%.
        </p>
      </Card>

      <Button
        size="xl"
        fullWidth
        loading={pending || starting}
        onClick={() =>
          startTransition(async () => {
            setStarting(true);
            const result = await startAttemptAction(brief.id);
            if (!result.ok) {
              setStarting(false);
              toast.error('Could not start', result.message);
              return;
            }
            router.push(`/assessments/${brief.id}/attempt/${result.data.attemptId}`);
          })
        }
      >
        Start assessment
      </Button>
    </div>
  );
}

function Rule({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 p-4">
      <span className="bg-bg-sunken text-fg-subtle grid size-9 shrink-0 place-items-center rounded-full">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-fg text-sm font-bold">{title}</p>
        <p className="text-fg-muted mt-0.5 text-sm">{body}</p>
      </div>
    </div>
  );
}
