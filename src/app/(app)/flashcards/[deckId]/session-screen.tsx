'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';

import { CompletionSummary, SavingState } from '@/components/flashcards/completion';
import { CARD_HEIGHT, Flashcard } from '@/components/flashcards/flashcard';
import { DragVerdict, GRADE_ORDER, GradeBar } from '@/components/flashcards/grade-bar';
import { SessionProgress } from '@/components/flashcards/session-progress';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form';
import { cn } from '@/lib/cn';
import { type Grade, type ReviewOutcome, encouragement, summarise } from '@/lib/domain/flashcards';
import { haptic } from '@/lib/haptics';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import {
  type FlashcardSessionResult,
  recordFlashcardSessionAction,
} from '@/server/actions/flashcards';
import type { DeckDetail } from '@/server/queries/flashcards';

/**
 * A run through a deck.
 *
 * The whole screen is one continuous piece of motion, and the state machine below exists to
 * keep it that way: `opening` (the deck cover lifting off the first card), `studying`,
 * `saving`, `done`. There is deliberately no state in which the screen is empty — the next
 * card is already springing up from the stack while the graded one is still leaving frame,
 * and the completion summary replaces the stage rather than following a blank.
 *
 * Persistence is one call at the end rather than one per card. See
 * `recordFlashcardSessionAction` for why; the short version is that a network round trip
 * between a flip and the next card is the one thing that would undo everything else here.
 */
type Phase = 'opening' | 'studying' | 'saving' | 'done';

export function SessionScreen({
  deck,
  /** True when this run is the "review what you found hard" pass. */
  reviewing,
}: {
  deck: DeckDetail;
  reviewing: boolean;
}) {
  const router = useRouter();
  const reduce = usePrefersReducedMotion();
  const [, startTransition] = useTransition();

  const [phase, setPhase] = useState<Phase>(reduce ? 'studying' : 'opening');
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const [outcomes, setOutcomes] = useState<ReviewOutcome[]>([]);
  const [exitGrade, setExitGrade] = useState<Grade | null>(null);
  const [dragGrade, setDragGrade] = useState<Grade | null>(null);
  const [result, setResult] = useState<FlashcardSessionResult | null>(null);
  const [error, setError] = useState<string | undefined>();

  const cards = deck.cards;
  const total = cards.length;
  const card = cards[index];

  /*
   * Guards the "save what you have on the way out" effect from firing twice — once from the
   * deliberate exit and again from the unmount that exit causes. A double submit would
   * write a second session row and a second set of reviews for the same work.
   */
  const flushed = useRef(false);
  const outcomesRef = useRef(outcomes);
  useEffect(() => {
    outcomesRef.current = outcomes;
  }, [outcomes]);

  /* ------------------------------------------------------------- opening */

  useEffect(() => {
    if (phase !== 'opening') return;
    const timer = window.setTimeout(() => setPhase('studying'), 520);
    return () => window.clearTimeout(timer);
  }, [phase]);

  /* ------------------------------------------------------------ progress */

  const grades = useMemo(() => outcomes.map((o) => o.grade), [outcomes]);
  const running = useMemo(() => summarise(outcomes), [outcomes]);

  // The live streak — the tail of consecutive good/easy grades, not the best one.
  const streak = useMemo(() => {
    let n = 0;
    for (let i = grades.length - 1; i >= 0; i -= 1) {
      if (grades[i] === 'good' || grades[i] === 'easy') n += 1;
      else break;
    }
    return n;
  }, [grades]);

  const message = encouragement(streak, outcomes.length, total);

  /* --------------------------------------------------------------- saving */

  const save = useCallback(
    (completed: boolean, then?: () => void) => {
      const collected = outcomesRef.current;
      if (collected.length === 0 || flushed.current) {
        then?.();
        return;
      }
      flushed.current = true;
      if (completed) setPhase('saving');

      startTransition(async () => {
        const res = await recordFlashcardSessionAction({
          deckId: deck.id,
          completed,
          outcomes: collected,
        });

        if (!res.ok) {
          flushed.current = false;
          setError(res.message);
          // Back to the stage rather than stranding the student on a spinner: their work is
          // still in memory, and the retry button re-sends exactly this list.
          if (completed) setPhase('studying');
          return;
        }

        setResult(res.data);
        if (completed) setPhase('done');
        router.refresh();
        then?.();
      });
    },
    [deck.id, router],
  );

  /*
   * Leaving part-way still records the reviews. They were real: the student saw those cards
   * and judged them, and throwing that away because they had to answer the door would make
   * the scheduler quietly wrong about what they know.
   */
  useEffect(() => {
    return () => {
      if (flushed.current || outcomesRef.current.length === 0) return;
      flushed.current = true;
      void recordFlashcardSessionAction({
        deckId: deck.id,
        completed: false,
        outcomes: outcomesRef.current,
      });
    };
  }, [deck.id]);

  /* ---------------------------------------------------------- interaction */

  const reveal = useCallback(() => {
    if (revealed) return;
    haptic('advance');
    setRevealed(true);
  }, [revealed]);

  const choose = useCallback(
    (option: number) => {
      if (revealed) return;
      haptic('tap');
      setChosen(option);
      // A beat before the flip, so the selection is visibly registered rather than
      // swallowed by the animation that immediately follows it.
      window.setTimeout(() => setRevealed(true), 260);
    },
    [revealed],
  );

  const grade = useCallback(
    (value: Grade) => {
      if (!revealed || !card || phase !== 'studying') return;
      haptic(value === 'again' ? 'wither' : value === 'easy' ? 'celebrate' : 'tap');

      const next = [...outcomesRef.current, { cardId: card.id, grade: value }];
      setExitGrade(value);
      setOutcomes(next);
      setDragGrade(null);
      setRevealed(false);
      setChosen(null);

      if (index + 1 >= total) {
        /*
         * The card is still flying off screen. Letting the summary mount underneath it
         * rather than after it is the difference between "the deck finished" and "the
         * screen changed" — and the delay is the exit's own duration, not a guess.
         */
        outcomesRef.current = next;
        window.setTimeout(() => save(true), reduce ? 0 : 300);
        setIndex(total);
        return;
      }
      setIndex((i) => i + 1);
    },
    [revealed, card, phase, index, total, save, reduce],
  );

  /* ------------------------------------------------------------ keyboard */

  useEffect(() => {
    if (phase !== 'studying') return;

    const onKey = (event: KeyboardEvent) => {
      // Never steal keys from a control that wants them.
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      if (event.key === ' ' || event.key === 'Enter') {
        if (revealed || !card) return;
        // A choice card is answered by choosing; space must not skip the question.
        if (card.correctOption !== null && chosen === null) return;
        event.preventDefault();
        reveal();
        return;
      }

      const digit = Number(event.key);
      if (!Number.isInteger(digit) || digit < 1 || digit > 4) return;

      /*
       * The same four keys mean two different things either side of the reveal, and that is
       * deliberate rather than a collision: before the flip they pick an option, after it
       * they grade the recall. They can never be ambiguous because the card is only ever in
       * one of those two states.
       */
      if (!revealed && card && card.correctOption !== null) {
        if (digit <= card.options.length) {
          event.preventDefault();
          choose(digit - 1);
        }
        return;
      }
      if (revealed) {
        event.preventDefault();
        grade(GRADE_ORDER[digit - 1]!);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, revealed, card, chosen, reveal, choose, grade]);

  /* --------------------------------------------------------------- render */

  if (phase === 'saving') return <SavingState />;

  if (phase === 'done' && result) {
    return (
      <CompletionSummary
        result={result}
        deckTitle={deck.title}
        totalCards={total}
        reviewing={reviewing}
        onReviewDifficult={() =>
          router.push(`/flashcards/${deck.id}?cards=${result.difficultCardIds.join(',')}`)
        }
        onRestart={() => router.push(`/flashcards/${deck.id}?r=${Date.now()}`)}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      {/* ------------------------------------------------------------ header */}
      <header className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => save(false, () => router.push('/flashcards'))}
          className="tap text-fg-muted hover:text-fg -ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-2 text-sm font-semibold transition-colors"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {outcomes.length > 0 ? 'Save & exit' : 'Decks'}
        </button>

        <div className="min-w-0 text-right">
          <p className="text-fg truncate text-sm font-bold">{deck.title}</p>
          {(reviewing || deck.topicLabel) && (
            <p className="text-fg-subtle truncate text-xs">
              {reviewing ? 'Reviewing what you found hard' : deck.topicLabel}
            </p>
          )}
        </div>
      </header>

      <SessionProgress
        total={total}
        index={index}
        grades={grades}
        streak={streak}
        message={message}
      />

      <FormError>{error}</FormError>
      {error && (
        <Button variant="outline" size="sm" onClick={() => save(true)}>
          Try saving again
        </Button>
      )}

      {/* ------------------------------------------------------------- stage */}
      <div className="relative">
        {/*
          The deck the card is drawn from. Two static layers, always behind, so the stage is
          never an empty rectangle between one card and the next and the deck reads as
          having depth even on the very last card.
        */}
        <StackLayers remaining={total - index} />

        {/*
          The stage owns the height, and every card in it is absolutely positioned.

          `AnimatePresence mode="popLayout"` was the obvious choice and the wrong one: it
          needs to measure and re-position its exiting child, which it cannot do through a
          plain function component, so the graded card stayed in the flow and pushed its
          replacement a full card-height down the page. Giving the stage a fixed height and
          stacking the cards inside it means the two simply overlap — the new card is
          already in place before the old one has left, which is the effect the popLayout
          was being asked for in the first place.
        */}
        <div className={cn('relative', CARD_HEIGHT)}>
          <AnimatePresence initial={false}>
            {card && phase === 'studying' && (
              <Flashcard
                key={card.id}
                card={card}
                revealed={revealed}
                chosen={chosen}
                onChoose={choose}
                onReveal={reveal}
                onGrade={grade}
                onDragGrade={setDragGrade}
                exitGrade={exitGrade}
                reduce={reduce}
                swipeEnabled={revealed}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>{dragGrade && <DragVerdict grade={dragGrade} />}</AnimatePresence>

          {/*
            The deck cover, lifting off to expose the first card. It is the same object the
            student pressed on the previous screen arriving in the same place, which is what
            makes the navigation read as opening something rather than as a page change.
          */}
          <AnimatePresence>
            {phase === 'opening' && (
              <motion.div
                initial={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
                animate={{ opacity: 0, y: -26, scale: 1.03, rotateX: -12 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-hero from-pulse-600 via-pulse-700 to-iris-800 shadow-float pointer-events-none absolute inset-0 z-30 flex min-h-[24rem] flex-col justify-end bg-linear-to-br p-8 text-white sm:min-h-[27rem]"
                style={{ transformOrigin: 'bottom center' }}
                aria-hidden
              >
                <p className="text-2xs font-bold tracking-[0.16em] text-white/60 uppercase">
                  {deck.subjectName ?? 'Deck'}
                </p>
                <p className="mt-1.5 text-2xl font-extrabold tracking-tight">{deck.title}</p>
                <p className="mt-1 text-sm text-white/70">{total} cards</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ----------------------------------------------------------- controls */}
      {/*
        The controls crossfade in place; they are deliberately NOT an `AnimatePresence`
        with `mode="wait"`.

        That was the first version, and it had the worst bug in this feature: `mode="wait"`
        holds the incoming child back until the outgoing one has finished animating away, so
        the four grade buttons could not mount until the hint underneath them had finished
        exiting. Any environment that starves the animation frame — a backgrounded tab, a
        loaded phone, a paused compositor — left a student looking at a revealed answer with
        no way to grade it and no way to continue.

        It is the same rule the rest of the product already states: nothing a student needs
        is ever derived from animation state. Both layers are always mounted, stacked, and
        toggled by opacity, so the buttons exist the instant the card is revealed whether or
        not a single frame ever renders.
      */}
      <div
        className={cn(
          'relative min-h-[7.5rem]',
          /*
           * The grade buttons of the card that has just been graded are still on screen,
           * animating away, and their props are frozen at the moment they left — so they
           * still look pressable. `grade()` ignores them, but a control that is visible and
           * does nothing is its own bug: on a fast run it is entirely possible to tap what
           * looks like Good for the next card and have nothing happen. Gating the whole
           * region on the live `revealed` flag makes the outgoing set inert the instant it
           * stops being the current one.
           */
          !revealed && 'pointer-events-none',
        )}
      >
        <AnimatePresence initial={false}>
          {revealed && card ? (
            <motion.div
              key="grades"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              transition={
                reduce ? { duration: 0.12 } : { type: 'spring', stiffness: 420, damping: 32 }
              }
              className="absolute inset-x-0 top-0 space-y-2.5"
            >
              <GradeBar state={card.state} onGrade={grade} armed={dragGrade} />
              <p className="text-fg-subtle text-center text-xs">
                <span className="hidden sm:inline">Press 1–4, or drag the card.</span>
                <span className="sm:hidden">Tap one, or swipe the card.</span>
              </p>
            </motion.div>
          ) : (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="text-fg-subtle absolute inset-x-0 top-0 pt-7 text-center text-xs"
            >
              {index === 0 && outcomes.length === 0
                ? 'Answer it in your head first — that is the part that works.'
                : `${total - index} to go`}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <p className="sr-only" aria-live="polite">
        Card {Math.min(index + 1, total)} of {total}.{' '}
        {running.reviewed > 0 && `${running.correct} of ${running.reviewed} recalled so far.`}
      </p>
    </div>
  );
}

/**
 * The rest of the deck, sitting under the live card.
 *
 * Two layers is the whole trick: one reads as an accident, three starts to look like a fan
 * of playing cards. They are scaled and pushed down rather than rotated, so the stack stays
 * quiet enough to sit under a card that is being dragged around on top of it.
 */
function StackLayers({ remaining }: { remaining: number }) {
  if (remaining <= 1) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0" aria-hidden>
      {[1, 2].slice(0, Math.min(2, remaining - 1)).map((depth) => (
        <div
          key={depth}
          className={cn(
            CARD_HEIGHT,
            'rounded-hero border-border bg-bg-elevated absolute inset-x-0 top-0 border',
            depth === 1 ? 'shadow-lift' : 'shadow-soft',
          )}
          style={{
            transform: `translateY(${depth * 9}px) scale(${1 - depth * 0.028})`,
            opacity: depth === 1 ? 0.7 : 0.4,
            zIndex: -depth,
          }}
        />
      ))}
    </div>
  );
}
