'use client';

import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

import { cn } from '@/lib/cn';

export type DonutSlice = { key: string; label: string; value: number };

/*
 * A fixed, ordered palette rather than a colour per data key.
 *
 * The breakdown answers "where did my points come from", and the categories change as the
 * scoring rules change. Assigning colour by *rank* keeps the chart readable no matter which
 * events exist, and keeps the largest slice in the primary hue every time.
 */
const PALETTE = [
  'var(--color-pulse-500)',
  'var(--color-iris-500)',
  'var(--color-flame-500)',
  'var(--color-aqua-400)',
  'var(--color-citrus-500)',
  'var(--color-blush-400)',
  'var(--color-pulse-300)',
  'var(--color-ink-300)',
];

export function Donut({
  slices,
  size = 168,
  thickness = 26,
  centreLabel,
  centreValue,
  className,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centreLabel?: string;
  centreValue?: string;
  className?: string;
}) {
  const reduce = usePrefersReducedMotion();
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const timer = setTimeout(() => setEntered(true), 40);
    return () => clearTimeout(timer);
  }, [reduce]);

  const grown = Boolean(reduce) || entered;

  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  if (total <= 0) {
    return (
      <p className="text-fg-muted py-8 text-center text-sm">
        Points will appear here as you earn them.
      </p>
    );
  }

  /*
   * Arc geometry is computed up front rather than accumulated inside the map.
   * Each slice needs the sum of everything before it, and doing that with a mutable
   * counter during render is exactly the pattern that breaks the moment React replays a
   * render — so the running total is materialised once, as data.
   */
  const arcs = slices.map((slice, i) => {
    const fraction = Math.max(0, slice.value) / total;
    const startFraction =
      slices.slice(0, i).reduce((sum, s) => sum + Math.max(0, s.value), 0) / total;
    return {
      slice,
      // A hairline gap between arcs so adjacent slices stay distinguishable.
      length: Math.max(0, fraction * circumference - 3),
      rotation: startFraction * circumference,
    };
  });

  return (
    <div className={cn('flex flex-wrap items-center gap-6', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="-rotate-90"
          role="img"
          aria-label="Points breakdown"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={thickness}
            className="stroke-bg-inset"
          />
          {arcs.map(({ slice, length, rotation }, i) => {
            const dash = `${grown ? length : 0} ${circumference}`;

            return (
              <circle
                key={slice.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={thickness}
                strokeLinecap="butt"
                strokeDasharray={dash}
                strokeDashoffset={-rotation}
                className="ease-out-soft transition-[stroke-dasharray] duration-700 motion-reduce:transition-none"
                style={{ transitionDelay: reduce ? undefined : `${Math.min(i * 90, 450)}ms` }}
              >
                {/*
                  A single interpolated string, not `{label}: {value}`. SVG `<title>` holds
                  text and nothing else, so React refuses to hydrate a version split across
                  several child nodes — which fails the whole tree, not just the tooltip.
                */}
                <title>{`${slice.label}: ${slice.value}`}</title>
              </circle>
            );
          })}
        </svg>

        {(centreValue || centreLabel) && (
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              {centreValue && <p className="stat-num text-fg text-2xl">{centreValue}</p>}
              {centreLabel && <p className="eyebrow mt-0.5">{centreLabel}</p>}
            </div>
          </div>
        )}
      </div>

      <ul className="min-w-0 flex-1 space-y-2.5">
        {slices.map((slice, i) => (
          <li key={slice.key} className="flex items-center gap-2.5">
            <span
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
              aria-hidden
            />
            <span className="text-fg-muted min-w-0 flex-1 truncate text-sm">{slice.label}</span>
            <span className="stat-num text-fg shrink-0 text-sm">
              {slice.value.toLocaleString()}
            </span>
            <span className="text-2xs text-fg-subtle w-10 shrink-0 text-right font-bold tabular-nums">
              {Math.round((slice.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
