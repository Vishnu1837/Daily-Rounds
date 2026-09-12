'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Clock,
  Eye,
  Hourglass,
  LayoutGrid,
  Maximize,
  ShieldAlert,
  Shuffle,
  Timer,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { FULLSCREEN_EXIT_LIMIT } from '@/lib/assessments/integrity';
import { leaveFullscreen, requestFullscreen } from '@/lib/use-fullscreen';
import { startAttemptAction } from '@/server/actions/assessments';

type Brief = {
  id: string;
  title: string;
  instructions: string | null;
  subjectName: string | null;
  /** Which clock the paper runs on — the single biggest thing this screen has to convey. */
  timerMode: 'per_question' | 'whole_paper';
  totalTimeSeconds: number | null;
  defaultQuestionSeconds: number;
  focusGraceSeconds: number;
  passMarkPct: number;
  questionCount: number;
  questionSeconds: number;
  /** The bank this sitting draws from, or null when the paper is the whole of it. */
  bankSize: number | null;
  /** How many of that bank this student has already been served. Null when there is no bank. */
  seenCount: number | null;
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
 * paper, that five drops out of full screen void it, and that the honesty of the thing
 * rests on them rather than on surveillance. The timers begin only when they press the
 * button — that is why this screen exists at all.
 *
 * The button is also the one place full screen can be *asked for*. Browsers grant it only
 * inside a user gesture, so the request rides on this click and the attempt page inherits
 * it across the client-side navigation; the runner's gate is what covers every other way in
 * — a reload, a back button, a browser that refused.
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
  const wholePaper = brief.timerMode === 'whole_paper';

  /*
   * What to say about a bank. A student who is told "20 questions" and then meets a
   * question they answered last week will assume the thing is broken, so the fact that the
   * paper is drawn is said up front — and once they have nearly exhausted the bank, so is
   * the fact that repeats are now unavoidable.
   */
  const remaining =
    brief.bankSize !== null && brief.seenCount !== null ? brief.bankSize - brief.seenCount : null;
  const shortfall =
    remaining !== null && remaining < brief.questionCount ? brief.questionCount - remaining : 0;

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
          title={`${brief.questionCount} ${brief.questionCount === 1 ? 'question' : 'questions'}, ${wholePaper ? 'in' : 'about'} ${totalLabel}`}
          body={
            wholePaper
              ? `One clock for the whole paper. No question has a timer of its own, so the ${minutes(brief.totalTimeSeconds ?? 0)} is yours to spend however you like across the ${brief.questionCount}.`
              : brief.totalTimeSeconds
                ? `There is a ${minutes(brief.totalTimeSeconds)} limit on the whole paper, running alongside the per-question timers.`
                : `Each question has its own timer — ${brief.defaultQuestionSeconds} seconds unless it says otherwise.`
          }
        />
        {brief.bankSize !== null && (
          <Rule
            icon={<Shuffle className="size-4" aria-hidden />}
            title={`Drawn fresh from ${brief.bankSize} questions`}
            body={
              shortfall > 0
                ? remaining === 0
                  ? `You have now seen all ${brief.bankSize} questions in this bank, so this paper is drawn from all of them again. Every sitting is still a different ${brief.questionCount}.`
                  : `You have ${remaining} question${remaining === 1 ? '' : 's'} left that you have not seen. This paper takes ${remaining} of those and makes the other ${shortfall} up at random from ones you have met before.`
                : `Your paper is picked when you press start, from the ones you have not been asked yet — so no two sittings are the same. ${brief.seenCount === 0 ? 'All of them are new to you.' : `${remaining} still new to you.`}`
            }
          />
        )}
        <Rule
          icon={<LayoutGrid className="size-4" aria-hidden />}
          title="You can move around the paper"
          body={
            wholePaper
              ? 'Skip a question and come back, change an answer you have already given, or flag one for review — the numbered grid beside the paper shows what you have answered, skipped and marked, and takes you straight to any of them.'
              : 'Go back to any question whose timer is still running, flag ones to return to, and use the numbered grid beside the paper to see what you have answered and skipped.'
          }
        />
        {!wholePaper && (
          <Rule
            icon={<Timer className="size-4" aria-hidden />}
            title="A question's clock starts the first time you see it"
            body="And it keeps running while you are elsewhere, so a question you skip may have expired by the time you come back to it. An expired question locks — you can still read it, the answer is fixed, and it scores nothing. Answer rather than perfect."
          />
        )}
        <Rule
          icon={<ShieldAlert className="size-4" aria-hidden />}
          title="Leaving the page restarts the assessment"
          body={`Switching tabs or apps for more than ${brief.focusGraceSeconds} seconds restarts you from question 1${brief.bankSize !== null ? ' — the same questions, with the clocks back at the start' : ''}. Coming straight back is fine. Every restart is recorded for your cohort lead.`}
        />
        <Rule
          icon={<Maximize className="size-4" aria-hidden />}
          title="It runs in full screen"
          body={`The paper takes the whole screen when you start, and the questions are hidden whenever it does not have it. Coming straight back is fine, but ${FULLSCREEN_EXIT_LIMIT} exits void the attempt — it is closed, kept, and your cohort lead sees the count.`}
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
        onClick={() => {
          // Inside the gesture, before anything is awaited: a request made after the server
          // action resolves has lost its user activation and browsers refuse it.
          const entering = requestFullscreen();

          startTransition(async () => {
            setStarting(true);
            const result = await startAttemptAction(brief.id);
            if (!result.ok) {
              setStarting(false);
              await entering;
              void leaveFullscreen();
              toast.error('Could not start', result.message);
              return;
            }
            await entering;
            router.push(`/assessments/${brief.id}/attempt/${result.data.attemptId}`);
          });
        }}
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
