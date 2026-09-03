'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Clock, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextArea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import {
  openQuestionAction,
  recordFocusEventAction,
  submitAnswerAction,
  submitAttemptAction,
} from '@/server/actions/assessments';
import type { AttemptRuntime } from '@/server/queries/assessments';

/**
 * The timed assessment runtime.
 *
 * Three rules shaped this component, and all three are about not trusting it:
 *
 *  - **The clock is the server's.** Deadlines arrive as absolute instants and the only
 *    thing here is a ticking display of the gap. `serverNow` seeds the offset, so a browser
 *    with a wrong system clock counts down correctly, and a refresh redraws the same
 *    deadline rather than restarting it.
 *  - **Answers are written as they are made**, not gathered up and posted at the end. A
 *    student whose laptop dies half way has half a paper recorded, not none.
 *  - **Nothing here knows any correct answer.** The payload carries prompts and options
 *    only; the grading happens on submission, on the server.
 *
 * The focus detection is the one piece that has to be honest about its limits: it can see
 * the tab being hidden, and it cannot see a second phone. It is a deterrent that logs, and
 * the pre-start screen says so in those words.
 */
export function AttemptRunner({ runtime }: { runtime: AttemptRuntime }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();

  /* ------------------------------------------------------------- the clock */

  /*
   * Server time, ticking.
   *
   * The first render uses the server's own instant rather than the browser's, so the markup
   * the client produces matches the markup the server sent. From then on the tick measures
   * the gap between the two clocks once and subtracts it, which is what makes a device with
   * a wrong system clock count down correctly — and what stops one being set back from
   * buying time.
   */
  const [now, setNow] = useState(() => new Date(runtime.serverNow).getTime());

  useEffect(() => {
    const skew = Date.now() - new Date(runtime.serverNow).getTime();
    const id = setInterval(() => setNow(Date.now() - skew), 250);
    return () => clearInterval(id);
  }, [runtime.serverNow]);

  /* ---------------------------------------------------------- the position */

  const questions = runtime.questions;
  const firstUnanswered = useMemo(() => {
    const index = questions.findIndex(
      (q) => !q.expired && q.selectedIndex === null && !q.textAnswer,
    );
    return index === -1 ? questions.length - 1 : index;
  }, [questions]);

  const [index, setIndex] = useState(firstUnanswered);
  const [deadlines, setDeadlines] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      questions.filter((q) => q.deadline).map((q) => [q.id, new Date(q.deadline!).getTime()]),
    ),
  );
  const [answers, setAnswers] = useState<Record<string, { selected: number | null; text: string }>>(
    () =>
      Object.fromEntries(
        questions.map((q) => [q.id, { selected: q.selectedIndex, text: q.textAnswer ?? '' }]),
      ),
  );
  const [locked, setLocked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, q.expired])),
  );
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  const question = questions[index];
  const deadline = question ? deadlines[question.id] : undefined;
  const totalDeadline = runtime.expiresAt ? new Date(runtime.expiresAt).getTime() : null;

  const secondsLeft = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const totalLeft = totalDeadline ? Math.max(0, Math.ceil((totalDeadline - now) / 1000)) : null;

  /* --------------------------------------------------- opening a question */

  // Stamping the start on the server is what fixes the deadline. It happens once per
  // question and the server keeps the first stamp, so revisiting does not extend it.
  useEffect(() => {
    if (!question || locked[question.id] || deadlines[question.id]) return;
    let cancelled = false;

    void openQuestionAction(runtime.attemptId, question.id).then((result) => {
      if (cancelled || !result.ok) return;
      setDeadlines((current) => ({
        ...current,
        [question.id]: new Date(result.data.deadline).getTime(),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [question, locked, deadlines, runtime.attemptId]);

  /* ------------------------------------------------------------ submitting */

  const finish = useCallback(
    (reason: 'submitted' | 'expired') => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      startTransition(async () => {
        const result = await submitAttemptAction(runtime.attemptId, reason);
        if (!result.ok) {
          submittedRef.current = false;
          setSubmitting(false);
          toast.error('Could not submit', result.message);
          return;
        }
        router.replace(`/assessments/${runtime.assessmentId}/result/${runtime.attemptId}`);
      });
    },
    [router, runtime.assessmentId, runtime.attemptId, toast],
  );

  const saveAnswer = useCallback(
    async (questionId: string) => {
      const value = answers[questionId];
      if (!value) return;
      await submitAnswerAction({
        attemptId: runtime.attemptId,
        questionId,
        selectedIndex: value.selected,
        textAnswer: value.text || undefined,
      });
    },
    [answers, runtime.attemptId],
  );

  function goNext() {
    if (!question) return;
    const id = question.id;
    startTransition(async () => {
      await saveAnswer(id);
      if (index >= questions.length - 1) finish('submitted');
      else setIndex((i) => i + 1);
    });
  }

  /* ----------------------------------------- expiry, per question and total */

  /*
   * Expiry is scheduled against the deadline rather than watched for on every tick, so the
   * lock happens at the moment the clock runs out instead of up to a quarter-second later,
   * and the state change happens in a callback rather than during the effect body.
   */
  useEffect(() => {
    if (!question || deadline === undefined || locked[question.id]) return;

    const id = question.id;
    const wait = Math.max(0, deadline - now);

    const timer = setTimeout(() => {
      setLocked((current) => ({ ...current, [id]: true }));
      startTransition(async () => {
        // Sent anyway, so the *server* decides it arrived late and stores it as expired.
        // The client never gets to be the authority on whether time ran out.
        await saveAnswer(id);
        if (index >= questions.length - 1) finish('submitted');
        else setIndex((i) => i + 1);
      });
    }, wait);

    return () => clearTimeout(timer);
    // `now` is deliberately absent: the timer is set from the deadline once, and re-arming
    // it on every tick would reset the countdown four times a second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, deadline, locked, index, questions.length, saveAnswer, finish]);

  useEffect(() => {
    if (totalLeft !== null && totalLeft <= 0) finish('expired');
  }, [totalLeft, finish]);

  /* ------------------------------------------------------------- integrity */

  const hiddenSinceRef = useRef<number | null>(null);

  useEffect(() => {
    function onVisibility() {
      if (submittedRef.current) return;

      if (document.hidden) {
        hiddenSinceRef.current = Date.now();
        return;
      }

      const since = hiddenSinceRef.current;
      hiddenSinceRef.current = null;
      if (since === null) return;

      const awayMs = Date.now() - since;
      void recordFocusEventAction(runtime.attemptId, awayMs).then((result) => {
        if (!result.ok || !result.data.restarted || !result.data.newAttemptId) return;
        toast.error(
          'Assessment restarted',
          `You were away for ${(awayMs / 1000).toFixed(0)} seconds. Starting again from question 1 — your cohort lead can see this.`,
        );
        router.replace(`/assessments/${runtime.assessmentId}/attempt/${result.data.newAttemptId}`);
        router.refresh();
      });
    }

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [router, runtime.assessmentId, runtime.attemptId, toast]);

  /* ---------------------------------------------------------------- render */

  if (!question) {
    return (
      <Card className="p-8 text-center">
        <p className="text-fg-muted text-sm">This assessment has no questions.</p>
      </Card>
    );
  }

  const isChoice = question.type === 'mcq' || question.type === 'image_mcq';
  const isLocked = Boolean(locked[question.id]) || submitting;
  const answered = answers[question.id];
  const urgent = secondsLeft !== null && secondsLeft <= 10;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* --------------------------------------------------------- the clocks */}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-fg-subtle text-2xs font-bold tracking-[0.14em] uppercase">
          Question {index + 1} of {questions.length}
        </p>
        {runtime.restartCount > 0 && (
          <span className="text-warning-strong dark:text-warning inline-flex items-center gap-1 text-xs font-bold">
            <RotateCcw className="size-3.5" aria-hidden />
            Restart {runtime.restartCount}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {totalLeft !== null && (
            <span className="text-fg-muted inline-flex items-center gap-1.5 text-sm tabular-nums">
              <Clock className="size-3.5" aria-hidden />
              {Math.floor(totalLeft / 60)}:{String(totalLeft % 60).padStart(2, '0')} left
            </span>
          )}
          <span
            aria-live="polite"
            className={cn(
              'rounded-pill px-3 py-1 text-sm font-extrabold tabular-nums',
              urgent
                ? 'bg-danger/15 text-danger-strong dark:text-danger animate-pulse'
                : 'bg-bg-sunken text-fg',
            )}
          >
            {secondsLeft === null ? '—' : `${secondsLeft}s`}
          </span>
        </div>
      </div>

      <div
        className="bg-bg-sunken h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={questions.length}
        aria-label="Progress through the assessment"
      >
        <div
          className="bg-pulse-500 h-full transition-[width] duration-300"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* -------------------------------------------------------- the question */}
      <Card className="p-6">
        <h1 className="text-fg text-lg font-extrabold text-balance">{question.prompt}</h1>

        {question.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={question.imageUrl}
            alt=""
            className="rounded-panel border-border mt-4 max-h-80 w-full border object-contain"
          />
        )}

        {isLocked && (
          <p className="text-warning-strong dark:text-warning mt-4 flex items-center gap-1.5 text-sm font-semibold">
            <AlertTriangle className="size-4" aria-hidden />
            Time is up on this one.
          </p>
        )}

        {isChoice ? (
          <fieldset className="mt-5 space-y-2" disabled={isLocked}>
            <legend className="sr-only">Choose one answer</legend>
            {question.options.map((option, optionIndex) => {
              const selected = answered?.selected === optionIndex;
              return (
                <button
                  key={optionIndex}
                  type="button"
                  disabled={isLocked}
                  onClick={() =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: { selected: optionIndex, text: '' },
                    }))
                  }
                  className={cn(
                    'rounded-panel flex w-full items-center gap-3 border px-4 py-3 text-left text-sm transition-colors',
                    selected
                      ? 'border-pulse-500 bg-pulse-500/10 text-fg font-semibold'
                      : 'border-border text-fg-muted hover:border-border-strong hover:bg-bg-sunken',
                    isLocked && 'opacity-60',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold',
                      selected ? 'bg-pulse-600 text-white' : 'bg-bg-sunken text-fg-subtle',
                    )}
                  >
                    {String.fromCharCode(65 + optionIndex)}
                  </span>
                  {option}
                </button>
              );
            })}
          </fieldset>
        ) : (
          <TextArea
            label="Your answer"
            className="mt-5"
            rows={question.type === 'long_answer' ? 10 : 4}
            disabled={isLocked}
            value={answered?.text ?? ''}
            onChange={(e) =>
              setAnswers((current) => ({
                ...current,
                [question.id]: { selected: null, text: e.target.value },
              }))
            }
            hint="Your cohort lead marks this one by hand."
          />
        )}
      </Card>

      <Button size="xl" fullWidth loading={submitting} onClick={goNext}>
        {index >= questions.length - 1 ? 'Finish and submit' : 'Save and continue'}
      </Button>

      <p className="text-fg-subtle text-center text-xs">
        Answers are saved as you go. Leaving this page for more than {runtime.focusGraceSeconds}{' '}
        seconds restarts the assessment.
      </p>
    </div>
  );
}
