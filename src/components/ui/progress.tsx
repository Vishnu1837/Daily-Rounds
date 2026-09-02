'use client';

import { useEffect, useId, useState } from 'react';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

import { cn } from '@/lib/cn';

export type ProgressTone = 'pulse' | 'flame' | 'iris' | 'citrus' | 'success' | 'neutral';

const FILLS: Record<ProgressTone, string> = {
  pulse: 'bg-linear-to-r from-pulse-500 to-iris-400',
  flame: 'bg-linear-to-r from-flame-500 to-citrus-400',
  iris: 'bg-linear-to-r from-iris-500 to-blush-400',
  citrus: 'bg-linear-to-r from-citrus-500 to-citrus-300',
  success: 'bg-linear-to-r from-success-strong to-success',
  neutral: 'bg-fg-subtle',
};

/** Gradient stops for ring strokes, keyed to the same tones as the bars. */
const STROKES: Record<ProgressTone, [string, string]> = {
  pulse: ['var(--color-pulse-500)', 'var(--color-iris-400)'],
  flame: ['var(--color-flame-500)', 'var(--color-citrus-400)'],
  iris: ['var(--color-iris-500)', 'var(--color-blush-400)'],
  citrus: ['var(--color-citrus-500)', 'var(--color-citrus-300)'],
  success: ['var(--color-success-strong)', 'var(--color-success)'],
  neutral: ['var(--fg-subtle)', 'var(--fg-subtle)'],
};

/**
 * True once the entry animation should have played.
 *
 * The value a progress indicator shows is never derived from animation state — the width
 * (or dash offset) is always the real number, and only a transform is animated. So if the
 * transition is throttled, interrupted, or disabled, the worst case is "no animation",
 * never "wrong number". A bar that silently stops at 38% when the value is 62% is a lie;
 * a bar that appears instantly is merely undramatic.
 */
function useEntered(reduce: boolean | null): boolean {
  const [ticked, setTicked] = useState(false);

  useEffect(() => {
    if (reduce) return;
    // A timer, not requestAnimationFrame: rAF is suspended in background tabs.
    const timer = setTimeout(() => setTicked(true), 40);
    return () => clearTimeout(timer);
  }, [reduce]);

  // Reduced motion skips straight to the resting state — derived, never set in the effect.
  return Boolean(reduce) || ticked;
}

export function ProgressBar({
  value,
  tone = 'pulse',
  className,
  height = 'md',
  label,
  /** Renders a soft glow under the fill. For the one bar a screen is actually about. */
  glow,
}: {
  /** 0–100. */
  value: number;
  tone?: ProgressTone;
  className?: string;
  height?: 'xs' | 'sm' | 'md' | 'lg';
  label?: string;
  glow?: boolean;
}) {
  const reduce = usePrefersReducedMotion();
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const entered = useEntered(reduce);
  const h = { xs: 'h-1', sm: 'h-1.5', md: 'h-2.5', lg: 'h-3.5' }[height];

  return (
    <div
      className={cn('rounded-pill bg-bg-inset w-full overflow-hidden', h, className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn(
          'rounded-pill ease-out-soft h-full origin-left transition-transform duration-700 motion-reduce:transition-none',
          FILLS[tone],
          glow && 'shadow-glow-pulse',
        )}
        style={{ width: `${pct}%`, transform: entered ? 'scaleX(1)' : 'scaleX(0)' }}
      />
    </div>
  );
}

export function ProgressRing({
  value,
  size = 72,
  stroke = 8,
  tone = 'pulse',
  children,
  className,
  label,
  /** Leaves the track invisible, for rings drawn over a coloured surface. */
  trackClassName,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: ProgressTone;
  children?: React.ReactNode;
  className?: string;
  label?: string;
  trackClassName?: string;
}) {
  const reduce = usePrefersReducedMotion();
  const gradientId = useId();
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const entered = useEntered(reduce);

  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const [from, to] = STROKES[tone];

  return (
    <div
      className={cn('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className={cn('stroke-bg-inset', trackClassName)}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={entered ? circumference - (pct / 100) * circumference : circumference}
          className="ease-out-soft transition-[stroke-dashoffset] duration-1000 motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

/**
 * Discrete progress — one segment per unit, filled left to right.
 *
 * Used where the count is small and *countable* (four tasks today, seven days this week).
 * A continuous bar for "3 of 4" hides the thing the student actually wants to know, which
 * is how many are left.
 */
export function ProgressSegments({
  total,
  filled,
  tone = 'pulse',
  className,
  label,
}: {
  total: number;
  filled: number;
  tone?: ProgressTone;
  className?: string;
  label?: string;
}) {
  const reduce = usePrefersReducedMotion();
  const entered = useEntered(reduce);
  const safeTotal = Math.max(0, Math.floor(total));

  return (
    <div
      className={cn('flex gap-1', className)}
      role="progressbar"
      aria-valuenow={filled}
      aria-valuemin={0}
      aria-valuemax={safeTotal}
      aria-label={label}
    >
      {Array.from({ length: safeTotal }, (_, i) => {
        const on = i < filled;
        return (
          <span
            key={i}
            className={cn(
              'rounded-pill ease-out-soft h-1.5 flex-1 transition-all duration-300 motion-reduce:transition-none',
              on && entered ? FILLS[tone] : 'bg-bg-inset',
            )}
            style={{ transitionDelay: reduce ? undefined : `${Math.min(i * 60, 480)}ms` }}
          />
        );
      })}
    </div>
  );
}
