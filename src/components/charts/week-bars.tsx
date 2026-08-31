'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

import { cn } from '@/lib/cn';

export type WeekBar = {
  weekNumber: number;
  consistencyPct: number;
  completedDays: number;
  activeDays: number;
};

/**
 * Week-over-week consistency. One chart, used sparingly, doing one job well.
 *
 * Widths are authoritative inline styles with a CSS transition — an interrupted animation
 * can never leave a bar showing a number it does not mean.
 */
export function WeekBars({ weeks }: { weeks: WeekBar[] }) {
  const reduce = useReducedMotion();
  const [ticked, setTicked] = useState(false);
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
      <p className="py-6 text-center text-sm text-fg-muted">
        Your first week of data will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {scored.map((week, i) => {
        const target = Math.max(week.consistencyPct, 6);
        return (
          <div key={week.weekNumber} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs font-bold text-fg-subtle">
              Week {week.weekNumber}
            </span>
            <div className="h-7 flex-1 overflow-hidden rounded-lg bg-bg-sunken">
              <div
                className={cn(
                  'flex h-full origin-left items-center justify-end rounded-lg pr-2',
                  'transition-transform duration-700 ease-out motion-reduce:transition-none',
                  week.consistencyPct >= 85
                    ? 'bg-linear-to-r from-pulse-500 to-pulse-400'
                    : week.consistencyPct >= 60
                      ? 'bg-linear-to-r from-iris-500 to-iris-400'
                      : 'bg-linear-to-r from-flame-500 to-flame-400',
                )}
                style={{
                  width: `${target}%`,
                  transform: grown ? 'scaleX(1)' : 'scaleX(0)',
                  transitionDelay: reduce ? undefined : `${Math.min(i * 80, 400)}ms`,
                }}
              >
                <span className="text-2xs font-extrabold text-white/95 tabular-nums">
                  {week.consistencyPct}%
                </span>
              </div>
            </div>
            <span className="w-10 shrink-0 text-right text-xs font-semibold text-fg-subtle tabular-nums">
              {week.completedDays}/{week.activeDays}
            </span>
          </div>
        );
      })}
    </div>
  );
}
