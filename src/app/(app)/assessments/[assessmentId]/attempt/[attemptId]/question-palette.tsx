'use client';

import { Flag } from 'lucide-react';

import { cn } from '@/lib/cn';
import {
  type PaletteEntry,
  type QuestionState,
  STATE_LABELS,
  questionState,
  tallyStates,
} from '@/lib/assessments/palette';

/**
 * The grid of question numbers, as every online test platform has one.
 *
 * It exists because a paper a student cannot see the shape of is a paper they cannot
 * budget: without it, "have I left anything blank?" is answerable only by clicking through
 * all twenty questions again, and with two minutes left nobody does that. Colour carries the
 * state, and so does the shape of the tile and the label underneath — colour alone would
 * leave a colour-blind student with an unreadable map of their own paper.
 *
 * Every tile is a real button with an accessible name that says the number *and* the state,
 * because for a screen-reader user this grid is the only navigation there is.
 */

const TILE: Record<QuestionState, string> = {
  answered: 'bg-success/15 text-success-strong dark:text-success border-success/40',
  answered_marked: 'bg-pulse-500/15 text-pulse-700 dark:text-pulse-200 border-pulse-500/50',
  marked: 'bg-pulse-500/10 text-pulse-700 dark:text-pulse-200 border-pulse-500/40 border-dashed',
  skipped: 'bg-warning/15 text-warning-strong dark:text-warning border-warning/40',
  unseen: 'bg-bg-sunken text-fg-subtle border-border',
  locked: 'bg-danger/10 text-danger-strong dark:text-danger border-danger/30 line-through',
};

const KEY_SWATCH: Record<QuestionState, string> = {
  answered: 'bg-success/60',
  answered_marked: 'bg-pulse-500',
  marked: 'bg-pulse-500/40',
  skipped: 'bg-warning/60',
  unseen: 'bg-bg-inset border-border border',
  locked: 'bg-danger/40',
};

/** The order the key reads in — most-done first, so the eye lands on what is left. */
const KEY_ORDER: QuestionState[] = [
  'answered',
  'answered_marked',
  'marked',
  'skipped',
  'unseen',
  'locked',
];

export function QuestionPalette({
  entries,
  current,
  onJump,
  className,
}: {
  entries: PaletteEntry[];
  current: number;
  onJump: (index: number) => void;
  className?: string;
}) {
  const tally = tallyStates(entries);

  return (
    <div className={className}>
      <p className="text-fg-subtle text-2xs font-bold tracking-[0.14em] uppercase">
        Question palette
      </p>

      <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1.5">
        {entries.map((entry, index) => {
          const state = questionState(entry);
          const isCurrent = index === current;
          return (
            <button
              key={index}
              type="button"
              onClick={() => onJump(index)}
              aria-current={isCurrent ? 'true' : undefined}
              aria-label={`Question ${index + 1} — ${STATE_LABELS[state]}${isCurrent ? ', on screen now' : ''}`}
              className={cn(
                'rounded-field relative grid h-10 place-items-center border text-sm font-bold tabular-nums transition-colors',
                TILE[state],
                isCurrent && 'ring-pulse-500 ring-offset-bg ring-2 ring-offset-2',
              )}
            >
              {index + 1}
              {entry.markedForReview && (
                <Flag
                  className="text-pulse-600 dark:text-pulse-300 absolute -top-1 -right-1 size-3"
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>

      <ul className="mt-4 space-y-1.5">
        {KEY_ORDER.filter((state) => tally[state] > 0).map((state) => (
          <li key={state} className="text-fg-muted flex items-center gap-2 text-xs">
            <span className={cn('size-2.5 shrink-0 rounded-sm', KEY_SWATCH[state])} aria-hidden />
            <span className="min-w-0 flex-1">{STATE_LABELS[state]}</span>
            <span className="text-fg font-bold tabular-nums">{tally[state]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
