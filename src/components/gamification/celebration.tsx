'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { cn } from '@/lib/cn';

/**
 * A short, self-contained confetti burst. Deliberately hand-rolled rather than pulling in a
 * dependency: it is ~44 spans, respects reduced motion, and cleans itself up.
 */
export function Confetti({ fire, pieces = 52 }: { fire: boolean; pieces?: number }) {
  const reduce = useReducedMotion();
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!fire || reduce) return;
    // The burst is removed by a timer rather than by an animation-complete callback, so it
    // always cleans itself up. Re-arming happens via the `key` on the wrapper below: a new
    // celebration remounts this component with a fresh `expired` of false, which avoids
    // resetting state from inside the effect.
    const t = window.setTimeout(() => setExpired(true), 2400);
    return () => window.clearTimeout(t);
  }, [fire, reduce]);

  // Visibility is derived from the trigger, so the burst starts on the same render the
  // celebration does rather than one render later.
  const visible = fire && !reduce && !expired;

  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        // Deterministic spread so the burst looks designed rather than random noise.
        const angle = (i / pieces) * Math.PI * 2;
        const radius = 90 + ((i * 37) % 150);
        return {
          id: i,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius - 60,
          rotate: ((i * 53) % 360) - 180,
          delay: ((i * 17) % 24) / 100,
          color: [
            'var(--color-pulse-400)',
            'var(--color-flame-400)',
            'var(--color-iris-400)',
            'var(--color-citrus-400)',
            'var(--color-blush-400)',
            'var(--color-aqua-400)',
          ][i % 6]!,
          square: i % 3 === 0,
        };
      }),
    [pieces],
  );

  if (reduce) return null;

  return (
    <AnimatePresence>
      {visible && (
        <div
          className="pointer-events-none fixed inset-0 z-[70] grid place-items-center"
          aria-hidden
        >
          {bits.map((b) => (
            <motion.span
              key={b.id}
              className={cn(
                'absolute block h-2.5 w-2',
                b.square ? 'rounded-[2px]' : 'rounded-full',
              )}
              style={{ backgroundColor: b.color }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
              animate={{ x: b.x, y: b.y + 280, opacity: 0, scale: 0.6, rotate: b.rotate }}
              transition={{ duration: 1.8, delay: b.delay, ease: [0.17, 0.67, 0.5, 1] }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}

/** The drawn tick used on every completion state. */
export function AnimatedCheck({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M4.5 12.5 9.5 17.5 19.5 6.5"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="draw-check"
      />
    </svg>
  );
}

export type CelebrationPayload = {
  kind: 'milestone' | 'achievement' | 'day_complete' | 'comeback' | 'level_up';
  title: string;
  message: string;
  emoji: string;
  points?: number;
  streak?: number;
  /** Rank title, shown on a level-up. */
  rank?: string;
};

/*
 * Each celebration paints in the colour that already means that thing everywhere else in
 * the product: amber for streaks, indigo for finishing the day, citrus for a level. A
 * celebration that invents its own colour teaches the student nothing.
 */
const KIND_STYLE = {
  milestone: { wash: 'from-flame-500/30 via-flame-500/10', ring: 'ring-flame-500/30' },
  achievement: { wash: 'from-iris-500/30 via-iris-500/10', ring: 'ring-iris-500/30' },
  day_complete: { wash: 'from-pulse-500/30 via-pulse-500/10', ring: 'ring-pulse-500/30' },
  comeback: { wash: 'from-success/30 via-success/10', ring: 'ring-success/30' },
  level_up: { wash: 'from-citrus-400/40 via-citrus-400/12', ring: 'ring-citrus-500/35' },
} as const;

/** Full-screen celebration used for milestones, achievements, comebacks and level-ups. */
export function CelebrationModal({
  payload,
  onClose,
}: {
  payload: CelebrationPayload | null;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!payload) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [payload, onClose]);

  const style = payload ? KIND_STYLE[payload.kind] : KIND_STYLE.day_complete;

  return (
    <>
      <Confetti
        key={payload ? `${payload.kind}:${payload.title}` : 'idle'}
        fire={payload !== null}
      />
      <AnimatePresence>
        {payload && (
          <motion.div
            className="fixed inset-0 z-[65] grid place-items-center p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={payload.title}
              className="rounded-hero border-border bg-bg-elevated shadow-float relative w-full max-w-sm overflow-hidden border p-7 text-center"
              initial={reduce ? { opacity: 0 } : { scale: 0.82, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { scale: 0.92, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.42, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <div
                className={cn(
                  'pointer-events-none absolute inset-x-0 top-0 h-40 bg-linear-to-b to-transparent',
                  style.wash,
                )}
                aria-hidden
              />

              <motion.div
                className={cn(
                  'bg-bg-elevated shadow-lift relative mx-auto grid size-20 place-items-center rounded-3xl text-4xl ring-8',
                  style.ring,
                )}
                initial={reduce ? false : { scale: 0.4, rotate: -14 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.1, duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
                aria-hidden
              >
                {payload.emoji}
              </motion.div>

              {payload.rank && (
                <p className="text-2xs text-citrus-700 dark:text-citrus-300 relative mt-4 font-bold tracking-[0.18em] uppercase">
                  {payload.rank}
                </p>
              )}

              <h2 className="text-fg relative mt-4 text-2xl font-extrabold tracking-tight text-balance">
                {payload.title}
              </h2>
              <p className="text-fg-muted relative mt-2 text-sm text-balance">{payload.message}</p>

              {(payload.points || payload.streak) && (
                <motion.div
                  className="relative mt-5 flex items-center justify-center gap-2.5"
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.28, duration: 0.3 }}
                >
                  {payload.points ? (
                    <span className="rounded-pill bg-citrus-500/18 text-citrus-700 ring-citrus-500/30 dark:text-citrus-300 px-3.5 py-1.5 text-sm font-bold ring-1 ring-inset">
                      +{payload.points} XP
                    </span>
                  ) : null}
                  {payload.streak ? (
                    <span className="rounded-pill bg-flame-500/14 text-flame-700 ring-flame-500/28 dark:text-flame-300 px-3.5 py-1.5 text-sm font-bold ring-1 ring-inset">
                      🔥 {payload.streak} days
                    </span>
                  ) : null}
                </motion.div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="tap rounded-panel bg-ink-900 dark:bg-ink-50 dark:text-ink-950 relative mt-7 h-12 w-full font-semibold text-white transition-transform active:translate-y-px"
              >
                Keep going
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
