'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

import { cn } from '@/lib/cn';

type Tone = 'pulse' | 'flame' | 'iris' | 'success';

const FILLS: Record<Tone, string> = {
  pulse: 'bg-linear-to-r from-pulse-500 to-pulse-400',
  flame: 'bg-linear-to-r from-flame-500 to-flame-300',
  iris: 'bg-linear-to-r from-iris-500 to-iris-300',
  success: 'bg-success',
};

const STROKES: Record<Tone, string> = {
  pulse: 'var(--color-pulse-500)',
  flame: 'var(--color-flame-500)',
  iris: 'var(--color-iris-500)',
  success: 'var(--color-success)',
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
}: {
  /** 0–100. */
  value: number;
  tone?: Tone;
  className?: string;
  height?: 'sm' | 'md' | 'lg';
  label?: string;
}) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const entered = useEntered(reduce);
  const h = height === 'sm' ? 'h-1.5' : height === 'lg' ? 'h-3' : 'h-2';

  return (
    <div
      className={cn('w-full overflow-hidden rounded-pill bg-bg-sunken', h, className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn(
          'h-full origin-left rounded-pill transition-transform duration-700 ease-out motion-reduce:transition-none',
          FILLS[tone],
        )}
        style={{ width: `${pct}%`, transform: entered ? 'scaleX(1)' : 'scaleX(0)' }}
      />
    </div>
  );
}

export function ProgressRing({
  value,
  size = 72,
  stroke = 7,
  tone = 'pulse',
  children,
  className,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: Tone;
  children?: React.ReactNode;
  className?: string;
  label?: string;
}) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const entered = useEntered(reduce);

  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <div
      className={cn('relative inline-grid place-items-center', className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--bg-sunken)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={STROKES[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={
            entered ? circumference - (pct / 100) * circumference : circumference
          }
          className="transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
