'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Clock, Flame, Layers, Sparkles } from 'lucide-react';

import { EmptyState } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import { cn } from '@/lib/cn';
import { deckProgress, estimatedMinutes } from '@/lib/domain/flashcards';
import { haptic } from '@/lib/haptics';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import type { DeckSummary } from '@/server/queries/flashcards';

/**
 * The deck shelf.
 *
 * A deck is drawn as a deck — a face with two card edges showing behind it — rather than as
 * a rectangle with a title in it. That is not decoration: it is the same object the student
 * is about to open, in the same place, so pressing it reads as picking something up. The
 * session screen's opening animation continues this exact shape, which is what makes the
 * navigation between the two feel like one movement instead of two screens.
 */
export function DecksScreen({ decks }: { decks: DeckSummary[] }) {
  const studyStreak = decks[0]?.studyStreak ?? 0;
  const dueTotal = decks.reduce((sum, deck) => sum + deck.due, 0);

  if (decks.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow="Library"
          title="Flashcards"
          description="Short decks of recall, filed against the topics on your roadmap."
        />
        <div className="surface shadow-soft">
          <EmptyState
            icon={<Layers className="size-7" />}
            tone="iris"
            title="No decks for your topics yet"
            description="Decks appear here as your cohort files them against the topics on your roadmap. Your knowledge checks are in Materials in the meantime."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Library"
        title="Flashcards"
        description="Answer it in your head, then turn the card over. The ones you forget come back sooner."
      >
        <div className="flex flex-wrap items-center gap-2">
          {dueTotal > 0 && (
            <span className="rounded-pill bg-pulse-500/12 text-pulse-700 dark:text-pulse-300 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold">
              <Sparkles className="size-3.5" aria-hidden />
              {dueTotal} due today
            </span>
          )}
          {studyStreak >= 2 && (
            <span className="rounded-pill bg-flame-500/14 text-flame-700 dark:text-flame-300 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold tabular-nums">
              <Flame className="size-3.5" aria-hidden />
              {studyStreak} day run
            </span>
          )}
        </div>
      </PageHeader>

      <ul className="grid gap-3.5 lg:grid-cols-2">
        {decks.map((deck, i) => (
          <Reveal key={deck.id} delay={i} as="li">
            <DeckCard deck={deck} />
          </Reveal>
        ))}
      </ul>
    </div>
  );
}

function DeckCard({ deck }: { deck: DeckSummary }) {
  const router = useRouter();
  const reduce = usePrefersReducedMotion();
  const [launching, setLaunching] = useState(false);

  const progress = deckProgress(deck.mix);
  const started = progress.done > 0;
  const minutes = deck.estimatedMinutes || estimatedMinutes(deck.cardCount);

  /**
   * Opening the deck.
   *
   * The navigation happens immediately and the lift plays *over* it, rather than the route
   * change waiting on a timer for the animation to finish.
   *
   * It was written the other way round first — animate for 210ms, then push — to guarantee
   * the lift was seen. That put a timer on the critical path of 'the button works', and a
   * timer is exactly the thing an environment is allowed to delay or drop: throttled in a
   * background tab, starved on a slow phone. The failure it produces is the worst kind,
   * because pressing Continue simply does nothing and there is no way to tell whether the
   * press registered.
   *
   * Nothing is lost by removing it. The session screen opens with this same deck face in
   * this same position and lifts it away to expose the first card, so the continuity a
   * student actually perceives is carried by the destination — this end only has to
   * acknowledge the press, which it does on the frame it happens.
   */
  function open() {
    haptic('commit');
    setLaunching(true);
    router.push(`/flashcards/${deck.id}`);
  }

  return (
    <motion.div
      animate={launching && !reduce ? { scale: 1.035, y: -8 } : { scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      className="relative h-full"
    >
      {/* The rest of the deck, showing behind the face. Pure shape; nothing readable. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-full" aria-hidden>
        <div className="rounded-card border-border bg-bg-elevated absolute inset-0 translate-y-1.5 scale-[0.985] border opacity-60" />
        <div className="rounded-card border-border bg-bg-elevated absolute inset-0 translate-y-3 scale-[0.968] border opacity-35" />
      </div>

      <button
        type="button"
        onClick={open}
        onPointerEnter={() => router.prefetch(`/flashcards/${deck.id}`)}
        className={cn(
          'tap rounded-card border-border bg-bg-elevated shadow-soft group relative flex h-full w-full flex-col overflow-hidden border p-5 text-left',
          'ease-out-soft transition-[transform,box-shadow,border-color] duration-200',
          'hover:shadow-lift hover:border-pulse-300/70 hover:-translate-y-1',
          'active:translate-y-0 active:scale-[0.995]',
          'motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100',
        )}
      >
        {/*
          A wash that only appears on hover, anchored to the top-right corner the arrow sits
          in. It gives the press somewhere to travel toward without putting a gradient on
          every card in the list at rest.
        */}
        <span
          className="from-pulse-500/10 pointer-events-none absolute -top-16 -right-16 size-40 rounded-full bg-radial to-transparent opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
          aria-hidden
        />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow truncate">{deck.subjectName ?? deck.topicLabel ?? 'Deck'}</p>
            <h2 className="text-fg mt-1.5 text-lg font-extrabold tracking-tight text-balance">
              {deck.title}
            </h2>
          </div>

          {deck.due > 0 && (
            <span className="rounded-pill bg-pulse-500/14 text-pulse-700 dark:text-pulse-300 text-2xs shrink-0 px-2.5 py-1 font-bold tabular-nums">
              {deck.due} due
            </span>
          )}
        </div>

        <p className="text-fg-muted relative mt-2.5 flex items-center gap-3 text-xs font-semibold">
          <span className="tabular-nums">{deck.cardCount} cards</span>
          <span className="bg-border size-1 rounded-full" aria-hidden />
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Clock className="size-3.5" aria-hidden />~{minutes} min
          </span>
        </p>

        {/*
          The mastery meter. Four segments in the same colours the grade buttons use, so a
          glance at the shelf tells you which decks are green and which are still amber —
          without a single number to read.
        */}
        <div className="relative mt-4 flex-1">
          <MasteryMeter deck={deck} />
        </div>

        <div className="relative mt-4 flex items-center justify-between gap-3">
          <p className="text-fg-subtle text-xs font-semibold tabular-nums">
            {started ? `${progress.done} / ${progress.total} seen` : 'Not started'}
            {deck.mix.mastered > 0 && (
              <span className="text-success-strong dark:text-success">
                {' '}
                · {deck.mix.mastered} mastered
              </span>
            )}
          </p>

          <span
            className={cn(
              'rounded-pill inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold',
              'from-pulse-500 to-pulse-600 bg-linear-to-b text-white',
              'ease-out-soft transition-transform duration-200 group-hover:translate-x-0.5',
              'motion-reduce:group-hover:translate-x-0',
            )}
          >
            {started ? 'Continue' : 'Start'}
            <ArrowRight className="size-4" aria-hidden />
          </span>
        </div>
      </button>
    </motion.div>
  );
}

/**
 * The four-segment mastery meter.
 *
 * Segments rather than a single percentage fill, because "62% done" hides the distinction
 * that actually matters here: a deck where the remaining third is *difficult* is a very
 * different evening from one where it is merely *new*. The widths are the counts, and an
 * untouched deck is a flat inset track rather than a bar at zero — nothing to feel bad about
 * before you have begun.
 */
function MasteryMeter({ deck }: { deck: DeckSummary }) {
  const segments = [
    { key: 'mastered', value: deck.mix.mastered, className: 'bg-success', label: 'mastered' },
    { key: 'learning', value: deck.mix.learning, className: 'bg-pulse-500', label: 'learning' },
    { key: 'difficult', value: deck.mix.difficult, className: 'bg-flame-500', label: 'difficult' },
  ].filter((segment) => segment.value > 0);

  const total = deck.cardCount || 1;

  return (
    <div
      className="bg-bg-inset flex h-1.5 w-full overflow-hidden rounded-full"
      role="img"
      aria-label={
        segments.length === 0
          ? 'Not started'
          : segments.map((s) => `${s.value} ${s.label}`).join(', ')
      }
    >
      {segments.map((segment) => (
        <span
          key={segment.key}
          className={cn('ease-out-soft h-full transition-[width] duration-500', segment.className)}
          style={{ width: `${(segment.value / total) * 100}%` }}
        />
      ))}
    </div>
  );
}
