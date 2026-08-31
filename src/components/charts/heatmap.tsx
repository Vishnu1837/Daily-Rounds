'use client';

import { useState } from 'react';

import { cn } from '@/lib/cn';
import type { DayBand } from '@/db/schema';
import { isoWeekday, weekStart } from '@/lib/domain/calendar';

export const BAND_STYLE: Record<DayBand, { className: string; label: string }> = {
  perfect: { className: 'bg-pulse-500 dark:bg-pulse-400', label: 'Perfect day' },
  strong: { className: 'bg-pulse-500/70 dark:bg-pulse-400/70', label: 'Strong day' },
  active: { className: 'bg-pulse-500/45 dark:bg-pulse-400/45', label: 'Active day' },
  weak: { className: 'bg-pulse-500/22 dark:bg-pulse-400/25', label: 'Weak day' },
  missed: {
    className: 'bg-transparent ring-1 ring-inset ring-danger/45',
    label: 'Missed day',
  },
  off: { className: 'bg-bg-sunken', label: 'Rest day' },
};

export type HeatmapDay = { date: string; band: DayBand; isActiveDay: boolean; points: number };

/**
 * GitHub-style consistency grid. Its whole job is to let a student look back after a few
 * weeks and think "I have actually been showing up".
 */
export function ActivityHeatmap({ days }: { days: HeatmapDay[] }) {
  const [hovered, setHovered] = useState<HeatmapDay | null>(null);

  if (days.length === 0) return null;

  // Bucket into calendar weeks (columns), Monday first.
  const columns = new Map<string, (HeatmapDay | null)[]>();
  for (const day of days) {
    const key = weekStart(day.date);
    if (!columns.has(key)) columns.set(key, Array.from({ length: 7 }, () => null));
    columns.get(key)![isoWeekday(day.date) - 1] = day;
  }

  const weeks = [...columns.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex shrink-0 flex-col gap-1 pt-0.5">
          {dayLabels.map((d, i) => (
            <span
              key={i}
              className="grid h-[18px] w-3 place-items-center text-[9px] leading-none font-bold text-fg-subtle"
              aria-hidden
            >
              {i % 2 === 0 ? d : ''}
            </span>
          ))}
        </div>

        <div className="no-scrollbar -mx-1 flex flex-1 gap-1 overflow-x-auto px-1 pb-1">
          {weeks.map(([weekKey, cells]) => (
            <div key={weekKey} className="flex shrink-0 flex-col gap-1">
              {cells.map((day, i) => {
                if (!day) {
                  return <span key={i} className="size-[18px] rounded-[5px] bg-transparent" />;
                }
                const style = BAND_STYLE[day.band];
                return (
                  <button
                    key={day.date}
                    type="button"
                    onMouseEnter={() => setHovered(day)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(day)}
                    onBlur={() => setHovered(null)}
                    title={`${day.date} — ${style.label}${day.points ? ` · ${day.points} points` : ''}`}
                    aria-label={`${day.date}, ${style.label}`}
                    className={cn(
                      'tap size-[18px] rounded-[5px] transition-transform duration-150 hover:scale-125 focus-visible:scale-125',
                      style.className,
                    )}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex min-h-[1.25rem] items-center justify-between gap-3">
        <p className="truncate text-xs text-fg-muted" aria-live="polite">
          {hovered
            ? `${new Date(`${hovered.date}T12:00:00Z`).toLocaleDateString('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                timeZone: 'UTC',
              })} — ${BAND_STYLE[hovered.band].label}${hovered.points ? ` · ${hovered.points} pts` : ''}`
            : 'Weekends and holidays stay neutral — they never count against you.'}
        </p>
      </div>

      <ul className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {(['perfect', 'strong', 'active', 'weak', 'missed'] as DayBand[]).map((band) => (
          <li key={band} className="flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-[3px]', BAND_STYLE[band].className)} aria-hidden />
            <span className="text-2xs font-medium text-fg-subtle">{BAND_STYLE[band].label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
