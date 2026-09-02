'use client';

import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

import { cn } from '@/lib/cn';

export type WeekBar = {
  weekNumber: number;
  consistencyPct: number;
  completedDays: number;
  activeDays: number;
};

/**
 * Week-over-week consistency as a column chart.
 *
 * Columns rather than rows because the question this answers is "is the trend going up",
 * and a left-to-right time axis is the only arrangement where that is a shape rather than a
 * comparison of lengths.
 *
 * Heights are authoritative inline styles with a CSS transition — an interrupted animation
 * can never leave a column showing a number it does not mean.
 */
export function WeekBars({ weeks }: { weeks: WeekBar[] }) {
  const reduce = usePrefersReducedMotion();
  const [ticked, setTicked] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const scored = weeks.filter((w) => w.activeDays > 0);

  useEffect(() => {
    if (reduce) return;
    // A timer rather than requestAnimationFrame, which is suspended in background tabs.
    const timer = setTimeout(() => setTicked(true), 40);
    return () => clearTimeout(timer);
  }, [reduce]);

  // Derived so reduced motion needs no state write.
  const grown = Boolean(reduce) || ticked;

  if (scored.length === 0) {
    return (
      <p className="text-fg-muted py-8 text-center text-sm">
        Your first week of data will appear here.
      </p>
    );
  }

  const active = hovered === null ? null : scored.find((w) => w.weekNumber === hovered);
  const average = Math.round(scored.reduce((sum, w) => sum + w.consistencyPct, 0) / scored.length);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-fg-muted text-sm" aria-live="polite">
          {active ? (
            <>
              <strong className="text-fg">Week {active.weekNumber}</strong> —{' '}
              {active.consistencyPct}% · {active.completedDays}/{active.activeDays} days
            </>
          ) : (
            <>
              Average <strong className="text-fg">{average}%</strong> across {scored.length}{' '}
              {scored.length === 1 ? 'week' : 'weeks'}
            </>
          )}
        </p>
      </div>

      <div className="relative mt-5">
        {/* A single reference line at the cohort's own average, not a full grid. */}
        <div
          className="border-border-strong/70 pointer-events-none absolute inset-x-0 border-t border-dashed"
          style={{ bottom: `calc(${average}% * 0.82 + 1.75rem)` }}
          aria-hidden
        />

        <ol className="flex h-44 items-end gap-1.5">
          {scored.map((week, i) => {
            const target = Math.max(week.consistencyPct, 3);
            const tone =
              week.consistencyPct >= 85
                ? 'from-pulse-500 to-iris-400'
                : week.consistencyPct >= 60
                  ? 'from-iris-500 to-blush-400'
                  : 'from-flame-500 to-citrus-400';

            return (
              <li key={week.weekNumber} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                <button
                  type="button"
                  onMouseEnter={() => setHovered(week.weekNumber)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(week.weekNumber)}
                  onBlur={() => setHovered(null)}
                  aria-label={`Week ${week.weekNumber}: ${week.consistencyPct}% consistency, ${week.completedDays} of ${week.activeDays} days`}
                  className="tap flex w-full flex-col items-center justify-end gap-2"
                  style={{ height: '100%' }}
                >
                  <span className="stat-num text-2xs text-fg-muted">{week.consistencyPct}%</span>
                  <span
                    className={cn(
                      'ease-out-soft w-full origin-bottom rounded-t-lg bg-linear-to-t transition-[transform,filter] duration-700 motion-reduce:transition-none',
                      tone,
                      hovered !== null && hovered !== week.weekNumber && 'opacity-45',
                    )}
                    style={{
                      height: `${target * 0.82}%`,
                      transform: grown ? 'scaleY(1)' : 'scaleY(0)',
                      transitionDelay: reduce ? undefined : `${Math.min(i * 60, 420)}ms`,
                    }}
                  />
                  <span className="text-2xs text-fg-subtle font-bold">{week.weekNumber}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
