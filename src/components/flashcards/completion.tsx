'use client';

import Link from 'next/link';
import { ArrowRight, Flame, RotateCcw } from 'lucide-react';

import { Button, LinkButton } from '@/components/ui/button';
import { Card, CardAurora } from '@/components/ui/card';
import { AnimatedCounter } from '@/components/ui/counter';
import { ProgressRing } from '@/components/ui/progress';
import { cn } from '@/lib/cn';
import type { FlashcardSessionResult } from '@/server/actions/flashcards';

/**
 * The end of a run.
 *
 * The brief for this screen was "satisfying, not cheesy", and the line between those two is
 * drawn by what the screen *says* rather than by how much it moves. So: three real numbers,
 * one sentence that is true about this particular run, and two things the student can do
 * next. No confetti, no badge, no full-screen takeover — the product's own design rules
 * reserve celebration for milestones that took days to earn, and finishing a deck of
 * twenty-four cards took eight minutes.
 *
 * The one flourish is the sheen that crosses the hero card once. It is a single pass, it is
 * already in the design system, and it stops.
 */
export function CompletionSummary({
  result,
  deckTitle,
  totalCards,
  onReviewDifficult,
  onRestart,
  reviewing,
}: {
  result: FlashcardSessionResult;
  deckTitle: string;
  totalCards: number;
  onReviewDifficult: () => void;
  onRestart: () => void;
  /** True when this run was itself a review of the difficult cards. */
  reviewing: boolean;
}) {
  const difficultCount = result.difficultCardIds.length;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card
        variant="solid"
        tone={result.accuracy >= 80 ? 'pulse' : 'neutral'}
        padding="lg"
        glow
        className={cn(
          'animate-rise relative overflow-hidden text-center text-white',
          result.perfect && 'animate-sheen',
        )}
      >
        <CardAurora tone={result.accuracy >= 80 ? 'pulse' : 'iris'} />
        <div className="relative">
          <p className="text-2xs font-bold tracking-[0.16em] text-white/60 uppercase">
            {reviewing ? 'Difficult cards' : deckTitle}
          </p>

          <p className="stat-num text-stat-xl mt-4">
            <AnimatedCounter value={result.reviewed} />
            <span className="text-3xl text-white/50">/{totalCards}</span>
          </p>
          <p className="mt-2 text-sm font-semibold text-white/70">
            {result.reviewed === 1 ? 'card reviewed' : 'cards reviewed'}
          </p>

          <p className="mx-auto mt-5 max-w-sm text-sm text-balance text-white/75">
            {verdict(result)}
          </p>

          {result.pointsAwarded > 0 && (
            <p className="rounded-pill mt-5 inline-flex items-center gap-2 bg-white/15 px-3.5 py-1.5 text-sm font-bold ring-1 ring-white/20 ring-inset">
              +{result.pointsAwarded} XP
            </p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card padding="md" className="animate-rise flex items-center gap-4 [animation-delay:80ms]">
          <ProgressRing
            value={result.accuracy}
            size={58}
            stroke={7}
            tone={result.accuracy >= 80 ? 'success' : result.accuracy >= 50 ? 'pulse' : 'flame'}
            label="Accuracy"
          >
            <span className="stat-num text-fg text-sm">{result.accuracy}%</span>
          </ProgressRing>
          <div className="min-w-0">
            <p className="eyebrow">Accuracy</p>
            <p className="text-fg-muted mt-1 text-xs">
              {result.correct} of {result.reviewed} known on sight
            </p>
          </div>
        </Card>

        <Card padding="md" className="animate-rise [animation-delay:140ms]">
          <p className="eyebrow">Best run</p>
          <p className="stat-num text-stat-sm text-fg mt-2 flex items-center gap-1.5">
            <Flame className="text-flame-500 size-5" aria-hidden />
            <AnimatedCounter value={result.bestStreak} />
          </p>
          <p className="text-fg-muted mt-1 text-xs">
            {result.bestStreak === 0 ? 'No run yet' : 'in a row'}
          </p>
        </Card>
      </div>

      {/*
        Where the deck now stands. This is the number a student actually came for — the run
        they just did is a means to it — so it is stated in the deck's own terms rather than
        as a delta they would have to do arithmetic on.
      */}
      <Card padding="md" className="animate-rise [animation-delay:200ms]">
        <p className="eyebrow">This deck now</p>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <MasteryStat label="Mastered" value={result.mastered} tone="success" />
          <MasteryStat label="Learning" value={result.learning} tone="pulse" />
          <MasteryStat label="Difficult" value={result.difficult} tone="flame" />
        </dl>
      </Card>

      <div className="space-y-2.5 pt-1">
        {difficultCount > 0 ? (
          <Button size="lg" fullWidth onClick={onReviewDifficult}>
            <RotateCcw className="size-4" aria-hidden />
            Review the {difficultCount} you found hard
          </Button>
        ) : (
          <Button size="lg" fullWidth onClick={onRestart} variant="outline">
            <RotateCcw className="size-4" aria-hidden />
            Run the deck again
          </Button>
        )}

        <LinkButton
          href="/flashcards"
          variant={difficultCount > 0 ? 'outline' : 'primary'}
          size="lg"
          fullWidth
        >
          Done
          <ArrowRight className="size-4" aria-hidden />
        </LinkButton>

        <p className="text-fg-subtle pt-1 text-center text-xs">
          <Link
            href="/check-in"
            className="hover:text-fg font-semibold underline underline-offset-4"
          >
            Your check-in is what moves the leaderboard
          </Link>
        </p>
      </div>
    </div>
  );
}

function MasteryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'success' | 'pulse' | 'flame';
}) {
  const colour = {
    success: 'text-success-strong dark:text-success',
    pulse: 'text-pulse-600 dark:text-pulse-300',
    flame: 'text-flame-600 dark:text-flame-300',
  }[tone];

  return (
    <div className="rounded-panel bg-bg-sunken py-3">
      <dd className={cn('stat-num text-xl', colour)}>{value}</dd>
      <dt className="text-fg-subtle text-2xs mt-1 font-bold tracking-wider uppercase">{label}</dt>
    </div>
  );
}

/**
 * One sentence about this run.
 *
 * Written as a ladder of *facts* rather than praise: "you did not miss one" is something
 * that happened, "amazing work!" is something a computer decided to say. The bottom rung
 * deliberately does not console — a student who got a third of a deck has learned something
 * useful about which deck to open tomorrow, and telling them that is more respectful than
 * telling them they did great.
 */
function verdict(result: FlashcardSessionResult): string {
  if (result.perfect && result.reviewed >= 10) return 'Perfect run. You did not miss one.';
  if (result.perfect) return 'Perfect run.';
  if (result.accuracy >= 85) return 'Nearly clean. A couple to tighten up and this deck is done.';
  if (result.accuracy >= 60)
    return 'Solid. The ones you stumbled on are the ones worth another pass.';
  if (result.accuracy >= 35)
    return 'This deck is still new to you. That is what the second run is for.';
  return 'Hard going — which means this is exactly the deck to come back to tomorrow.';
}

/** The row of ticks shown while the session is being saved. */
export function SavingState() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-20 text-center">
      <span
        className="border-pulse-500/30 border-t-pulse-500 size-8 animate-spin rounded-full border-2"
        aria-hidden
      />
      <p className="text-fg-muted mt-4 text-sm font-semibold">Saving your run…</p>
      <p className="text-fg-subtle mt-1 text-xs">Working out what to show you next.</p>
    </div>
  );
}
