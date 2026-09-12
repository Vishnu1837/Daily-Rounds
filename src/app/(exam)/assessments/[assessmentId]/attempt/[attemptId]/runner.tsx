'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eraser,
  Flag,
  LayoutGrid,
  Maximize,
  RotateCcw,
  Send,
  ShieldAlert,
} from 'lucide-react';

import { Button, LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextArea } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { fullscreenState, fullscreenWarning } from '@/lib/assessments/integrity';
import { type PaletteEntry, submitSummary } from '@/lib/assessments/palette';
import { leaveFullscreen, useFullscreen } from '@/lib/use-fullscreen';
import {
  openQuestionAction,
  recordFocusEventAction,
  recordFullscreenExitAction,
  submitAnswerAction,
  submitAttemptAction,
} from '@/server/actions/assessments';
import type { AttemptRuntime } from '@/server/queries/assessments';

import { QuestionPalette } from './question-palette';

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
 * The paper is navigable in both directions. It used not to be — the runner only ever moved
 * forward, so a question you were unsure of was gone the moment you left it — and that is
 * what the palette on the right is for: skip one, come back, change your mind, flag the two
 * you want another look at. What leaving a question costs depends on how the admin timed the
 * paper, and the difference is worth being precise about:
 *
 *  - Under **one clock for the whole paper**, nothing. Every question stays open until the
 *    paper closes, which is the timing a mock exam wants.
 *  - Under **per-question timers**, a question's clock starts the first time it is on screen
 *    and keeps running wherever the student goes next. Coming back later may find it locked,
 *    and the sweep below locks it at the right instant even if the student is four questions
 *    away. That is not a compromise in the navigation; it is what a per-question timer
 *    *means*, and the rules screen says so before any clock starts.
 *
 * The focus detection is the one piece that has to be honest about its limits: it can see
 * the tab being hidden, and it cannot see a second phone. It is a deterrent that logs, and
 * the pre-start screen says so in those words. The full-screen lock is the same bargain
 * made visible: the paper is drawn only while the document owns the screen, so the ordinary
 * ways of reading something else alongside it cannot be done quietly, and the fifth exit
 * ends the sitting.
 */
export function AttemptRunner({ runtime }: { runtime: AttemptRuntime }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();

  const wholePaper = runtime.timerMode === 'whole_paper';

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
    return index === -1 ? 0 : index;
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
  const [marked, setMarked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, q.markedForReview])),
  );
  const [seen, setSeen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, q.seen])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const submittedRef = useRef(false);

  /*
   * Questions whose clock has been started on the server, so the opener below fires once
   * each and no more.
   *
   * A ref rather than state, and separate from `deadlines`, because under one clock for the
   * whole paper there is no deadline to come back — an effect keyed on "has no deadline yet"
   * would reopen the same question on every render, forever.
   */
  const openedRef = useRef<Set<string>>(new Set(questions.filter((q) => q.seen).map((q) => q.id)));

  /* --------------------------------------------------------- full screen */

  const fullscreen = useFullscreen();
  const [exits, setExits] = useState(runtime.fullscreenExits);
  const [voided, setVoided] = useState(false);
  /** Set while we are the ones leaving full screen, so our own exit is not counted. */
  const leavingRef = useRef(false);
  const exitState = fullscreenState(exits, runtime.fullscreenExitLimit);

  /*
   * The gate. Where the API exists, no question is drawn — or even opened, so no clock on
   * it starts — until the document owns the screen. A browser without the API (an iPhone,
   * today) is let through rather than locked out of the paper entirely; the rules screen
   * says as much, and the focus detection still applies there.
   */
  const gated = fullscreen.supported && !fullscreen.active && !voided;

  const question = questions[index];
  const deadline = question ? deadlines[question.id] : undefined;
  const totalDeadline = runtime.expiresAt ? new Date(runtime.expiresAt).getTime() : null;

  const secondsLeft = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const totalLeft = totalDeadline ? Math.max(0, Math.ceil((totalDeadline - now) / 1000)) : null;

  /*
   * Which questions are past their own deadline — derived from the tick, never stored.
   *
   * It was state once, and it could not stay state once students could navigate: with a
   * clock on every question, "locked" changes on its own for questions nobody is looking at,
   * and holding that in state means an effect whose only job is to copy the passage of time
   * into React on every tick. Deriving it makes the tick the single source of truth and
   * leaves the effect below with nothing to do but the parts that really are side effects —
   * telling the server, and moving the student off a question that just died under them.
   */
  const locked: Record<string, boolean> = Object.fromEntries(
    questions.map((q) => {
      const at = deadlines[q.id];
      return [q.id, q.expired || (at !== undefined && at <= now)];
    }),
  );

  /** The one shape the palette, the counts and the submit confirmation all read from. */
  const entries: PaletteEntry[] = questions.map((q) => {
    const value = answers[q.id];
    return {
      answered: value ? value.selected !== null || value.text.trim().length > 0 : false,
      markedForReview: Boolean(marked[q.id]),
      seen: Boolean(seen[q.id]),
      locked: Boolean(locked[q.id]),
    };
  });

  /* --------------------------------------------------- opening a question */

  // Stamping the start on the server is what fixes the deadline. It happens once per
  // question and the server keeps the first stamp, so revisiting does not extend it.
  useEffect(() => {
    if (gated || voided) return;
    if (!question || locked[question.id] || openedRef.current.has(question.id)) return;

    const id = question.id;
    openedRef.current.add(id);
    let cancelled = false;

    void openQuestionAction(runtime.attemptId, id).then((result) => {
      // Let a later visit try again rather than leaving a question permanently unopened.
      if (cancelled || !result.ok) {
        openedRef.current.delete(id);
        return;
      }
      setSeen((current) => ({ ...current, [id]: true }));
      const at = result.data.deadline;
      if (at) setDeadlines((current) => ({ ...current, [id]: new Date(at).getTime() }));
    });

    return () => {
      cancelled = true;
    };
  }, [question, locked, runtime.attemptId, gated, voided]);

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
        // Ours, so the exit it causes must not be counted against the student.
        leavingRef.current = true;
        void leaveFullscreen();
        router.replace(`/assessments/${runtime.assessmentId}/result/${runtime.attemptId}`);
      });
    },
    [router, runtime.assessmentId, runtime.attemptId, toast],
  );

  /*
   * Writing one question down.
   *
   * Read through refs rather than closed over, because this is called from timers and from
   * handlers created several renders ago, and a stale closure here would post an old answer
   * over a newer one.
   */
  const answersRef = useRef(answers);
  const markedRef = useRef(marked);

  useEffect(() => {
    answersRef.current = answers;
    markedRef.current = marked;
  }, [answers, marked]);

  const saveAnswer = useCallback(
    async (questionId: string) => {
      const value = answersRef.current[questionId];
      if (!value) return;
      await submitAnswerAction({
        attemptId: runtime.attemptId,
        questionId,
        selectedIndex: value.selected,
        textAnswer: value.text || undefined,
        markedForReview: Boolean(markedRef.current[questionId]),
      });
    },
    [runtime.attemptId],
  );

  /**
   * Moves to another question, writing down the one being left behind.
   *
   * Every way out of a question goes through here — Next, Previous, a tile in the palette,
   * the submit button — so there is exactly one place where "leaving a question saves it" is
   * true, and no route out that quietly forgets to.
   */
  const goTo = useCallback(
    (target: number) => {
      if (submittedRef.current) return;
      const leaving = questions[index];
      if (leaving) {
        const id = leaving.id;
        startTransition(async () => {
          await saveAnswer(id);
        });
      }
      setIndex(Math.max(0, Math.min(questions.length - 1, target)));
    },
    [index, questions, saveAnswer],
  );

  /* ----------------------------------------- expiry, per question and total */

  /** Questions already reported to the server as having run out, so each is posted once. */
  const sweptRef = useRef<Set<string>>(
    new Set(questions.filter((q) => q.expired).map((q) => q.id)),
  );

  /*
   * The sweep.
   *
   * Once a student can walk away from a running clock, expiry stops being something that
   * happens to the question on screen: question three's timer runs out while they are on
   * question seven, and nothing notices. So every tick looks at *every* question that has
   * just crossed its deadline rather than only the current one, and posts each — so the
   * server decides they arrived late and stores them as expired. The client is never the
   * authority on whether time ran out; it is only the thing that notices.
   *
   * Under one clock for the whole paper there are no per-question deadlines, so this finds
   * nothing and costs nothing.
   */
  useEffect(() => {
    if (gated || voided || submittedRef.current) return;

    const due = questions.filter((q) => locked[q.id] && !sweptRef.current.has(q.id));
    if (due.length === 0) return;
    for (const q of due) sweptRef.current.add(q.id);

    // Being moved off a question the moment it expires is the old behaviour and still the
    // right one — but only while the student is standing on it. Dragging them away from
    // question seven because question three ran out would be the interface fighting them.
    const currentId = questions[index]?.id;
    const leftStranded = Boolean(currentId) && due.some((q) => q.id === currentId);
    const nextOpen = questions.findIndex((q, i) => i > index && !locked[q.id]);

    startTransition(async () => {
      for (const q of due) await saveAnswer(q.id);
      if (leftStranded && nextOpen !== -1) setIndex(nextOpen);
    });
  }, [questions, locked, index, gated, voided, saveAnswer]);

  /*
   * Every question's clock has run out, so there is nothing left to do but hand it in.
   *
   * Only reachable under per-question timing. Submitting rather than leaving a student in
   * front of a paper of dead questions, which is what the old forward-only runner did once
   * it fell off the end of the list.
   */
  const allLocked =
    !wholePaper && !gated && questions.length > 0 && questions.every((q) => locked[q.id]);

  useEffect(() => {
    if (allLocked && !voided) finish('submitted');
  }, [allLocked, voided, finish]);

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

  /*
   * Every drop out of full screen, counted by the server.
   *
   * Only a true → false transition is reported, which is why the previous value is kept in
   * a ref: arriving on this page without full screen — a reload, a browser that refused —
   * is not an exit and must not cost a student one of their five. What is sent is the
   * event, never the tally; the count in the reply is the database's, so a fiddled client
   * cannot decide it is only on its second.
   */
  const wasFullscreenRef = useRef(false);

  useEffect(() => {
    const was = wasFullscreenRef.current;
    wasFullscreenRef.current = fullscreen.active;

    if (!was || fullscreen.active) return;
    if (voided || submittedRef.current || leavingRef.current) return;

    void recordFullscreenExitAction(runtime.attemptId).then((result) => {
      if (!result.ok) return;
      const state = fullscreenState(result.data.exits, result.data.limit);
      setExits(state.exits);

      if (!state.invalidated) {
        toast.error('Full screen is required', fullscreenWarning(state, result.data.limit));
        return;
      }

      // Nothing more is written for this attempt: the submit path and the expiry timers
      // both check this ref, and the paper is replaced by the notice below.
      //
      // Deliberately not a navigation. The server would now redirect this attempt to its
      // result page, and a student whose paper vanished into a percentage would have to
      // work out for themselves what had happened; the notice says it, and they leave when
      // they have read it. A reload from here lands on the result, which says it too.
      submittedRef.current = true;
      setVoided(true);
      leavingRef.current = true;
      void leaveFullscreen();
    });
  }, [fullscreen.active, voided, runtime.attemptId, toast]);

  /* ---------------------------------------------------------------- render */

  /*
   * The paper is over. Said plainly, with the count, and with the way forward — a voided
   * attempt is not a ban, and a student who has just lost twenty minutes should not have to
   * guess whether they are allowed to sit it again.
   */
  if (voided) {
    return (
      <div className="mx-auto max-w-lg">
        <Card className="p-8 text-center">
          <span className="bg-danger/12 text-danger-strong dark:text-danger mx-auto grid size-12 place-items-center rounded-full">
            <ShieldAlert className="size-6" aria-hidden />
          </span>
          <h1 className="text-fg mt-4 text-xl font-extrabold">This attempt no longer counts</h1>
          <p className="text-fg-muted mt-2 text-sm">
            You left full screen {exitState.exits} times. {runtime.fullscreenExitLimit} exits void a
            sitting, so this one has been closed and recorded — your cohort lead can see it, along
            with the answers you had given.
          </p>
          <p className="text-fg-subtle mt-3 text-sm">
            You can sit the assessment again from the start. The next attempt is numbered{' '}
            {runtime.attemptNumber + 1} and begins with a fresh {runtime.fullscreenExitLimit} exits.
          </p>
          <div className="mt-6 space-y-2">
            <LinkButton href={`/assessments/${runtime.assessmentId}`} size="lg" fullWidth>
              Back to the assessment
            </LinkButton>
            <LinkButton href="/assessments" variant="ghost" size="lg" fullWidth>
              All assessments
            </LinkButton>
          </div>
        </Card>
      </div>
    );
  }

  /*
   * Out of full screen, so no paper. Hiding the questions rather than merely warning over
   * them is the point: a translucent overlay would leave the prompt readable — and
   * screenshotable — in exactly the window the rule exists to close.
   */
  if (gated) {
    return (
      <div className="mx-auto max-w-lg">
        <Card className="p-8 text-center">
          <span className="bg-pulse-500/12 text-pulse-700 dark:text-pulse-200 mx-auto grid size-12 place-items-center rounded-full">
            <Maximize className="size-6" aria-hidden />
          </span>
          <h1 className="text-fg mt-4 text-xl font-extrabold">
            {exits === 0 ? 'This assessment runs in full screen' : 'Back to full screen'}
          </h1>
          <p className="text-fg-muted mt-2 text-sm">
            {exits === 0
              ? 'The questions appear once the paper has the whole screen. Nothing is shown, and no question clock starts, until then.'
              : fullscreenWarning(exitState, runtime.fullscreenExitLimit)}
          </p>
          {totalLeft !== null && (
            <p className="text-warning-strong dark:text-warning mt-3 text-sm font-semibold">
              The paper clock is still running — {Math.floor(totalLeft / 60)}:
              {String(totalLeft % 60).padStart(2, '0')} left.
            </p>
          )}
          <Button
            size="xl"
            fullWidth
            className="mt-6"
            onClick={() => {
              void fullscreen.enter().then((granted) => {
                if (granted) return;
                toast.error(
                  'Your browser would not go full screen',
                  'Allow full screen for this site, or press F11, and the paper will appear.',
                );
              });
            }}
          >
            <Maximize className="size-5" aria-hidden />
            Enter full screen
          </Button>
          <p className="text-fg-subtle mt-4 text-xs">
            {exitState.remaining} of {runtime.fullscreenExitLimit} exits left before this attempt
            stops counting.
          </p>
        </Card>
      </div>
    );
  }

  if (!question) {
    return (
      <Card className="p-8 text-center">
        <p className="text-fg-muted text-sm">This assessment has no questions.</p>
      </Card>
    );
  }

  const current = question;
  const isChoice = current.type === 'mcq' || current.type === 'image_mcq';
  const isLocked = Boolean(locked[current.id]) || submitting;
  const answered = answers[current.id];
  const isMarked = Boolean(marked[current.id]);
  const urgent =
    (secondsLeft !== null && secondsLeft <= 10) ||
    (wholePaper && totalLeft !== null && totalLeft <= 60);
  const summary = submitSummary(entries);
  const atLast = index >= questions.length - 1;

  function setAnswer(patch: { selected: number | null; text: string }) {
    setAnswers((value) => ({ ...value, [current.id]: patch }));
  }

  /** Flags or unflags the question on screen, and writes the flag down straight away. */
  function toggleMark() {
    const next = !markedRef.current[current.id];
    setMarked((value) => ({ ...value, [current.id]: next }));
    markedRef.current = { ...markedRef.current, [current.id]: next };
    startTransition(async () => {
      await saveAnswer(current.id);
    });
  }

  const palette = <QuestionPalette entries={entries} current={index} onJump={goTo} />;

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
      <div className="space-y-4">
        {/* ------------------------------------------------------- the clocks */}
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-fg-subtle text-2xs font-bold tracking-[0.14em] uppercase">
            Question {index + 1} of {questions.length}
          </p>
          {exits > 0 && (
            <span className="text-warning-strong dark:text-warning inline-flex items-center gap-1 text-xs font-bold">
              <Maximize className="size-3.5" aria-hidden />
              {exits}/{runtime.fullscreenExitLimit} exits
            </span>
          )}
          {runtime.restartCount > 0 && (
            <span className="text-warning-strong dark:text-warning inline-flex items-center gap-1 text-xs font-bold">
              <RotateCcw className="size-3.5" aria-hidden />
              Restart {runtime.restartCount}
            </span>
          )}
          <div className="ml-auto flex items-center gap-3">
            {/*
             * Under one clock for the whole paper the total *is* the clock, so it takes the
             * prominent pill and there is no second countdown beside it to confuse it with.
             */}
            {wholePaper ? (
              <span
                aria-live="polite"
                className={cn(
                  'rounded-pill inline-flex items-center gap-1.5 px-3 py-1 text-sm font-extrabold tabular-nums',
                  urgent
                    ? 'bg-danger/15 text-danger-strong dark:text-danger animate-pulse'
                    : 'bg-bg-sunken text-fg',
                )}
              >
                <Clock className="size-3.5" aria-hidden />
                {totalLeft === null
                  ? '—'
                  : `${Math.floor(totalLeft / 60)}:${String(totalLeft % 60).padStart(2, '0')} left`}
              </span>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>

        {/*
         * The bar tracks answers rather than position, which it did not before. With
         * navigation, "where am I" is the palette's job and no longer a measure of progress:
         * a student on question 20 of 20 with nine blanks is not 100% done.
         */}
        <div
          className="bg-bg-sunken h-1.5 w-full overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={summary.answered}
          aria-valuemin={0}
          aria-valuemax={questions.length}
          aria-label="Questions answered"
        >
          <div
            className="bg-pulse-500 h-full transition-[width] duration-300"
            style={{ width: `${(summary.answered / questions.length) * 100}%` }}
          />
        </div>

        {/* ------------------------------------------------------ the question */}
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <h1 className="text-fg min-w-0 flex-1 text-lg font-extrabold text-balance">
              {current.prompt}
            </h1>
            <Button
              variant={isMarked ? 'soft' : 'ghost'}
              size="sm"
              onClick={toggleMark}
              aria-pressed={isMarked}
            >
              <Flag className="size-4" aria-hidden />
              {isMarked ? 'Marked' : 'Mark for review'}
            </Button>
          </div>

          {current.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.imageUrl}
              alt=""
              className="rounded-panel border-border mt-4 max-h-80 w-full border object-contain"
            />
          )}

          {isLocked && !submitting && (
            <p className="text-warning-strong dark:text-warning mt-4 flex items-center gap-1.5 text-sm font-semibold">
              <AlertTriangle className="size-4" aria-hidden />
              Time is up on this one. You can still read it; the answer is fixed.
            </p>
          )}

          {isChoice ? (
            <fieldset className="mt-5 space-y-2" disabled={isLocked}>
              <legend className="sr-only">Choose one answer</legend>
              {current.options.map((option, optionIndex) => {
                const selected = answered?.selected === optionIndex;
                return (
                  <button
                    key={optionIndex}
                    type="button"
                    disabled={isLocked}
                    onClick={() => setAnswer({ selected: optionIndex, text: '' })}
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
              rows={current.type === 'long_answer' ? 10 : 4}
              disabled={isLocked}
              value={answered?.text ?? ''}
              onChange={(e) => setAnswer({ selected: null, text: e.target.value })}
              hint="Your cohort lead marks this one by hand."
            />
          )}

          {/*
           * Clearing is its own control rather than something a student has to work out for
           * themselves. Once a radio has been chosen there is no other way back to an empty
           * answer, and "I would rather leave this blank" is a real decision — it is what
           * the blank count on the submit confirmation is counting.
           */}
          {!isLocked && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              disabled={!entries[index]?.answered}
              onClick={() => setAnswer({ selected: null, text: '' })}
            >
              <Eraser className="size-4" aria-hidden />
              Clear response
            </Button>
          )}
        </Card>

        {/* ---------------------------------------------------------- moving */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="lg"
            disabled={index === 0 || submitting}
            onClick={() => goTo(index - 1)}
          >
            <ChevronLeft className="size-5" aria-hidden />
            Previous
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="lg:hidden"
            onClick={() => setPaletteOpen(true)}
          >
            <LayoutGrid className="size-5" aria-hidden />
            {summary.unanswered} left
          </Button>
          <Button
            size="lg"
            className="ml-auto"
            disabled={atLast || submitting}
            onClick={() => goTo(index + 1)}
          >
            Next
            <ChevronRight className="size-5" aria-hidden />
          </Button>
        </div>

        <Button
          variant="secondary"
          size="xl"
          fullWidth
          loading={submitting}
          onClick={() => {
            // Saved on the way into the confirmation, so the counts it shows are the counts
            // the server is holding rather than the ones this page happens to remember.
            goTo(index);
            setConfirming(true);
          }}
        >
          <Send className="size-5" aria-hidden />
          Submit assessment
        </Button>

        <p className="text-fg-subtle text-center text-xs">
          Answers are saved as you go, and you can come back to any question
          {wholePaper ? ' until the paper closes' : ' whose own timer has not run out'}. Leaving
          this page for more than {runtime.focusGraceSeconds} seconds restarts the assessment, and
          leaving full screen {runtime.fullscreenExitLimit} times voids it.
        </p>
      </div>

      {/* The palette is a column on a laptop and a sheet on a phone — the same component. */}
      <Card className="hidden p-4 lg:sticky lg:top-4 lg:block">{palette}</Card>

      <Sheet
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        title="Your paper"
        description="Tap a number to go to it."
      >
        {/*
         * The sheet closes on the way to the question, so a tap is one gesture rather than a
         * jump the student then has to dismiss a panel to see.
         */}
        <div onClick={() => setPaletteOpen(false)} role="presentation">
          {palette}
        </div>
      </Sheet>

      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Submit this assessment?"
        description="Nothing can be changed afterwards."
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" size="lg" fullWidth onClick={() => setConfirming(false)}>
              Keep working
            </Button>
            <Button
              size="lg"
              fullWidth
              loading={submitting}
              onClick={() => {
                setConfirming(false);
                finish('submitted');
              }}
            >
              Submit
            </Button>
          </div>
        }
      >
        <dl className="divide-border divide-y">
          <SummaryRow label="Answered" value={`${summary.answered} of ${questions.length}`} />
          <SummaryRow
            label="Left blank"
            value={String(summary.unanswered)}
            tone={summary.unanswered > 0 ? 'warn' : undefined}
          />
          <SummaryRow
            label="Marked for review"
            value={String(summary.marked)}
            tone={summary.marked > 0 ? 'warn' : undefined}
          />
        </dl>
        {summary.unanswered > 0 && (
          <p className="text-fg-muted mt-4 text-sm">
            A blank question scores nothing, and nothing is taken off for a wrong answer — so a
            guess is worth more than a gap.
          </p>
        )}
      </Sheet>
    </div>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="flex items-center justify-between py-3">
      <dt className="text-fg-muted text-sm">{label}</dt>
      <dd
        className={cn(
          'text-sm font-extrabold tabular-nums',
          tone === 'warn' ? 'text-warning-strong dark:text-warning' : 'text-fg',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
