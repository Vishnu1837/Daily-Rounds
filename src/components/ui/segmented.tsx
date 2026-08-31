'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useId } from 'react';

import { cn } from '@/lib/cn';

/**
 * A pill switch for two to four mutually exclusive views.
 *
 * The selected state is a *shared layout* element rather than a class on the active button,
 * so switching tabs slides one pill instead of snapping two. The label colours still change
 * instantly, which means the control is correct on the frame the tab changes even if the
 * slide is dropped.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number }[];
  className?: string;
  size?: 'sm' | 'md';
  ariaLabel: string;
}) {
  const reduce = useReducedMotion();
  const layoutId = useId();

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'rounded-pill bg-bg-sunken inline-flex w-full items-center gap-1 p-1 sm:w-auto',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'tap rounded-pill relative flex-1 font-semibold whitespace-nowrap transition-colors duration-150 sm:flex-none',
              size === 'sm' ? 'px-3.5 py-1.5 text-xs' : 'px-4 py-2 text-sm',
              active ? 'text-white' : 'text-fg-muted hover:text-fg',
            )}
          >
            {/*
              Painted in source order and lifted above by the label's own `relative`, rather
              than pushed behind with a negative z-index. The track has an opaque background,
              so a `-z-10` pill lands *behind that* and disappears entirely.
            */}
            {active && (
              <motion.span
                layoutId={`segmented-${layoutId}`}
                className="rounded-pill from-pulse-500 to-pulse-600 shadow-glow-pulse absolute inset-0 bg-linear-to-r"
                transition={
                  reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }
                }
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              {option.label}
              {option.count !== undefined && (
                <span
                  className={cn(
                    'rounded-pill text-2xs px-1.5 py-px font-bold tabular-nums',
                    active ? 'bg-white/22 text-white' : 'bg-bg-inset text-fg-subtle',
                  )}
                >
                  {option.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A horizontally scrolling row of filter chips. Used where the options are open-ended
 * (subjects, topics) rather than a fixed set of views.
 */
export function ChipRail<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1', className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'tap rounded-pill shrink-0 border px-3.5 py-1.5 text-sm font-semibold transition-all duration-150',
              active
                ? 'bg-ink-900 dark:bg-ink-50 dark:text-ink-950 border-transparent text-white'
                : 'border-border bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
