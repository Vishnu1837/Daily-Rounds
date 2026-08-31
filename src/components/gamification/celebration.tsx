'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { cn } from '@/lib/cn';

/**
 * A short, self-contained confetti burst. Deliberately hand-rolled rather than pulling in a
 * dependency: it is ~40 divs, respects reduced motion, and cleans itself up.
 */
export function Confetti({ fire, pieces = 44 }: { fire: boolean; pieces?: number }) {
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
        const radius = 90 + ((i * 37) % 130);
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
            'var(--color-pulse-600)',
            'var(--color-flame-300)',
          ][i % 5]!,
          square: i % 3 === 0,
        };
      }),
    [pieces],
  );

  if (reduce) return null;

  return (
    <AnimatePresence>
      {visible && (
        <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center" aria-hidden>
          {bits.map((b) => (
            <motion.span
              key={b.id}
              className={cn('absolute block h-2.5 w-2', b.square ? 'rounded-[2px]' : 'rounded-full')}
              style={{ backgroundColor: b.color }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
              animate={{ x: b.x, y: b.y + 260, opacity: 0, scale: 0.6, rotate: b.rotate }}
              transition={{ duration: 1.7, delay: b.delay, ease: [0.17, 0.67, 0.5, 1] }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}

/** The drawn tick used on every completion state. */
export function AnimatedCheck({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
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
  kind: 'milestone' | 'achievement' | 'day_complete' | 'comeback';
  title: string;
  message: string;
  emoji: string;
  points?: number;
  streak?: number;
};

/** Full-screen celebration used for milestones, achievements and comebacks. */
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

  return (
    <>
      <Confetti key={payload ? `${payload.kind}:${payload.title}` : 'idle'} fire={payload !== null} />
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
              className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={payload.title}
              className="relative w-full max-w-sm overflow-hidden rounded-[1.75rem] bg-bg-elevated p-7 text-center shadow-lift"
              initial={reduce ? { opacity: 0 } : { scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { scale: 0.9, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.42, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <div
                className="absolute inset-x-0 top-0 h-28 bg-linear-to-b from-flame-500/18 to-transparent"
                aria-hidden
              />
              <motion.div
                className="relative mx-auto grid size-20 place-items-center rounded-3xl bg-linear-to-br from-flame-500/20 to-pulse-500/20 text-4xl"
                initial={reduce ? false : { scale: 0.4, rotate: -12 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.1, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
                aria-hidden
              >
                {payload.emoji}
              </motion.div>

              <h2 className="relative mt-5 text-2xl font-extrabold tracking-tight text-fg">
                {payload.title}
              </h2>
              <p className="relative mt-2 text-sm text-balance text-fg-muted">{payload.message}</p>

              {(payload.points || payload.streak) && (
                <div className="relative mt-5 flex items-center justify-center gap-3">
                  {payload.points ? (
                    <span className="rounded-pill bg-pulse-500/12 px-3.5 py-1.5 text-sm font-bold text-pulse-700 ring-1 ring-pulse-500/25 ring-inset dark:text-pulse-300">
                      +{payload.points} points
                    </span>
                  ) : null}
                  {payload.streak ? (
                    <span className="rounded-pill bg-flame-500/12 px-3.5 py-1.5 text-sm font-bold text-flame-600 ring-1 ring-flame-500/25 ring-inset dark:text-flame-300">
                      🔥 {payload.streak} days
                    </span>
                  ) : null}
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="tap relative mt-7 h-12 w-full rounded-2xl bg-ink-900 font-semibold text-white transition-transform active:scale-[0.97] dark:bg-ink-100 dark:text-ink-950"
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
