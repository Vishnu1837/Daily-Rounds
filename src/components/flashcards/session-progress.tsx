'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Flame } from 'lucide-react';

import { cn } from '@/lib/cn';
import type { Grade } from '@/lib/domain/flashcards';

/**
 * The session's progress rail.
 *
 * Deliberately not a progress bar. A full-width bar at the top of a study screen is the
 * single loudest element on it, and it is reporting the least interesting fact available —
 * a student mid-recall wants to know how much is left, not to watch a rectangle fill. So
 * this is a hairline of ticks, one per card, that carries strictly more information than a
 * bar does: it shows how the run has actually *gone*, in the product's own grade colours.
 *
 * The count beside it is the readable version, and the streak chip only exists once there
 * is a streak worth naming.
 */
export function SessionProgress({
  total,
  index,
  grades,
  streak,
  message,
}: {
  total: number;
  /** Zero-based position of the card on screen. */
  index: number;
  /** Grades so far, in order. Shorter than `total` while the run is in progress. */
  grades: Grade[];
  streak: number;
  message: string | null;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-fg text-sm font-bold tabular-nums">
          <span className="text-stat-sm stat-num">{Math.min(index + 1, total)}</span>
          <span className="text-fg-subtle ml-1 text-sm font-semibold">/ {total}</span>
        </p>

        <div className="flex min-w-0 items-center gap-2">
          {/*
            The encouragement line. One at a time, swapped rather than stacked, and it takes
            its own space rather than pushing the counter around when it arrives.
          */}
          <AnimatePresence mode="wait">
            {message && (
              <motion.p
                key={message}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="text-fg-muted truncate text-sm font-semibold"
              >
                {message}
              </motion.p>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {streak >= 3 && (
              <motion.span
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                className="rounded-pill bg-flame-500/14 text-flame-700 dark:text-flame-300 flex shrink-0 items-center gap-1 px-2.5 py-1 text-xs font-bold tabular-nums"
              >
                <Flame className="size-3.5 shrink-0" aria-hidden />
                {streak}
                <span className="sr-only">correct in a row</span>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/*
        `aria-hidden` because the count above already says the same thing in words, and a
        screen reader reading out twenty-four list items to convey "7 of 24" is worse than
        useless. The <ol> is here for shape, not for semantics anyone consumes.
      */}
      <ol className="flex items-center gap-[3px]" aria-hidden>
        {Array.from({ length: total }, (_, i) => {
          const grade = grades[i];
          return (
            <li
              key={i}
              className={cn(
                'ease-out-soft h-1 flex-1 rounded-full transition-all duration-300',
                grade === 'again' && 'bg-danger',
                grade === 'hard' && 'bg-flame-500',
                grade === 'good' && 'bg-pulse-500',
                grade === 'easy' && 'bg-success',
                !grade && i === index && 'bg-fg-subtle h-1.5',
                !grade && i !== index && 'bg-bg-inset',
              )}
            />
          );
        })}
      </ol>
    </div>
  );
}
