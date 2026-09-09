'use client';

import { RotateCcw, Sparkles, ThumbsUp, TrendingDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';
import { type CardState, type Grade, intervalLabel } from '@/lib/domain/flashcards';

/**
 * The four outcomes.
 *
 * Icons rather than emoji, for the reason the empty-state mark already gives: emoji render
 * differently on every platform, cannot be tinted to the theme, and at this size look like
 * a placeholder somebody forgot to replace. The colour is doing the emotional work anyway —
 * flame for the one that hurt, success for the one that did not — and it is the product's
 * own colour vocabulary rather than four faces borrowed from a phone keyboard.
 *
 * Each control says three things: what it means, what it costs you (the interval it
 * schedules), and which key presses it. The interval is not decoration — it is the only
 * honest way to make the difference between Hard and Good legible before you have pressed
 * either of them a hundred times.
 */
const GRADE_META: Record<
  Grade,
  { label: string; icon: LucideIcon; hint: string; className: string; ring: string }
> = {
  again: {
    label: 'Again',
    icon: RotateCcw,
    hint: 'No idea',
    className:
      'border-danger/30 bg-danger/8 text-danger-strong dark:text-danger hover:bg-danger/14 hover:border-danger/50',
    ring: 'shadow-[0_10px_28px_-10px_var(--color-danger)]',
  },
  hard: {
    label: 'Hard',
    icon: TrendingDown,
    hint: 'Got there',
    className:
      'border-flame-500/30 bg-flame-500/9 text-flame-700 dark:text-flame-300 hover:bg-flame-500/16 hover:border-flame-500/50',
    ring: 'shadow-glow-flame',
  },
  good: {
    label: 'Good',
    icon: ThumbsUp,
    hint: 'Knew it',
    className:
      'border-pulse-500/30 bg-pulse-500/9 text-pulse-700 dark:text-pulse-300 hover:bg-pulse-500/16 hover:border-pulse-500/50',
    ring: 'shadow-glow-pulse',
  },
  easy: {
    label: 'Easy',
    icon: Sparkles,
    hint: 'Instantly',
    className:
      'border-success/30 bg-success/9 text-success-strong dark:text-success hover:bg-success/16 hover:border-success/50',
    ring: 'shadow-glow-success',
  },
};

export const GRADE_ORDER: Grade[] = ['again', 'hard', 'good', 'easy'];

export function gradeLabel(grade: Grade): string {
  return GRADE_META[grade].label;
}

export function GradeBar({
  state,
  onGrade,
  /** The grade the current drag is pointing at. Lights the matching control in step. */
  armed,
  disabled,
}: {
  state: CardState;
  onGrade: (grade: Grade) => void;
  armed: Grade | null;
  disabled?: boolean;
}) {
  return (
    <div
      className="grid grid-cols-4 gap-2 sm:gap-2.5"
      role="group"
      aria-label="How well did you remember this?"
    >
      {GRADE_ORDER.map((grade, i) => {
        const meta = GRADE_META[grade];
        const Icon = meta.icon;
        const isArmed = armed === grade;

        return (
          <button
            key={grade}
            type="button"
            disabled={disabled}
            onClick={() => onGrade(grade)}
            /*
             * The full sentence lives in the accessible name because the visible label is
             * one word. "Hard" on its own tells a screen-reader user nothing about what it
             * will do; "Hard — you got there in the end, back in one day" tells them
             * exactly what the sighted user reads off the tile.
             */
            aria-label={`${meta.label} — ${meta.hint.toLowerCase()}, back in ${intervalLabel(state, grade)}`}
            aria-pressed={isArmed}
            className={cn(
              'tap rounded-panel ease-out-soft group relative flex min-h-[4.5rem] flex-col items-center justify-center gap-1 border px-1 py-3',
              'transition-[transform,background-color,border-color,box-shadow] duration-200',
              'hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]',
              'motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100',
              'disabled:pointer-events-none disabled:opacity-40',
              meta.className,
              // Armed by a drag: the same treatment a press gives, so the gesture and the
              // button are visibly the same action rather than two ways to do one thing.
              isArmed &&
                cn(
                  '-translate-y-1 scale-[1.04] motion-reduce:translate-y-0 motion-reduce:scale-100',
                  meta.ring,
                ),
            )}
          >
            <Icon
              className={cn(
                'ease-out-soft size-4.5 transition-transform duration-200',
                'group-hover:scale-110 group-active:scale-95',
                'motion-reduce:group-hover:scale-100',
                isArmed && 'scale-110 motion-reduce:scale-100',
              )}
              strokeWidth={2.4}
              aria-hidden
            />
            <span className="text-sm leading-none font-bold">{meta.label}</span>
            <span className="text-2xs text-fg-subtle leading-none font-semibold tabular-nums">
              {intervalLabel(state, grade)}
            </span>

            {/*
              The keyboard hint. Desktop only — on a phone it is describing a key that is
              not there, and it would be sitting in the thumb's landing zone.
            */}
            <kbd
              className="text-2xs border-border bg-bg-elevated text-fg-subtle absolute top-1.5 right-1.5 hidden rounded border px-1 font-mono leading-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100 sm:block"
              aria-hidden
            >
              {i + 1}
            </kbd>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The verdict a drag is currently pointing at, floated over the card.
 *
 * It exists because a card being dragged covers the controls it is being dragged toward:
 * without this, committing to Easy means watching a card slide over the button that would
 * have told you what Easy meant. It grows with the drag so the commitment is legible
 * before the finger lifts.
 */
export function DragVerdict({ grade }: { grade: Grade | null }) {
  if (!grade) return null;
  const meta = GRADE_META[grade];
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        'rounded-pill animate-pop pointer-events-none absolute top-6 z-20 flex items-center gap-2 border px-4 py-2 backdrop-blur-sm',
        'bg-bg-elevated/85 shadow-lift',
        meta.className,
        grade === 'again' || grade === 'hard' ? 'left-6' : 'right-6',
      )}
      aria-hidden
    >
      <Icon className="size-4" strokeWidth={2.6} />
      <span className="text-sm font-extrabold tracking-wide uppercase">{meta.label}</span>
    </div>
  );
}
