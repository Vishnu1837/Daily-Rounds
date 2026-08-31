import type { ReactNode } from 'react';
import Link from 'next/link';

import { cn } from '@/lib/cn';

import { Card, type CardTone } from './card';

/**
 * Statistics are the product's loudest voice, so they get their own components rather than
 * being assembled ad hoc on each screen. Two rules hold everywhere:
 *
 *   - the number is always the largest thing in its container, and the label is always the
 *     smallest. If those two ever swap, the card is about the wrong thing;
 *   - a number is never coloured to decorate. Colour on a statistic means it belongs to a
 *     tone with meaning (streak, plan, XP), or that it is a status.
 */

const ACCENTS: Record<CardTone, string> = {
  neutral: 'text-fg',
  pulse: 'text-pulse-700 dark:text-pulse-300',
  iris: 'text-iris-700 dark:text-iris-300',
  flame: 'text-flame-700 dark:text-flame-300',
  citrus: 'text-citrus-700 dark:text-citrus-300',
  success: 'text-success-strong dark:text-success',
  warning: 'text-warning-strong dark:text-warning',
  danger: 'text-danger-strong dark:text-danger',
};

const ICON_BG: Record<CardTone, string> = {
  neutral: 'bg-bg-sunken text-fg-muted',
  pulse: 'bg-pulse-500/12 text-pulse-600 dark:text-pulse-300',
  iris: 'bg-iris-500/12 text-iris-600 dark:text-iris-300',
  flame: 'bg-flame-500/14 text-flame-600 dark:text-flame-300',
  citrus: 'bg-citrus-500/18 text-citrus-700 dark:text-citrus-300',
  success: 'bg-success/14 text-success-strong dark:text-success',
  warning: 'bg-warning/18 text-warning-strong dark:text-warning',
  danger: 'bg-danger/12 text-danger-strong dark:text-danger',
};

export type StatTileProps = {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: CardTone;
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
  /** Renders the number one step larger. For the two or three tiles that matter most. */
  emphasis?: boolean;
};

/** A compact metric tile — the unit the dashboard grids are built from. */
export function StatTile({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
  href,
  onClick,
  className,
  emphasis,
}: StatTileProps) {
  const body = (
    <Card
      interactive={Boolean(href || onClick)}
      padding="none"
      className={cn('flex h-full flex-col justify-between gap-3 p-4', className)}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="eyebrow leading-tight">{label}</p>
        {icon && (
          <span
            className={cn('grid size-8 shrink-0 place-items-center rounded-xl', ICON_BG[tone])}
            aria-hidden
          >
            {icon}
          </span>
        )}
      </div>
      <div>
        <p
          className={cn(
            'stat-num flex items-center gap-1.5',
            emphasis ? 'text-stat-sm' : 'text-2xl',
            ACCENTS[tone],
          )}
        >
          {value}
        </p>
        {sub && <p className="text-fg-subtle mt-0.5 text-xs">{sub}</p>}
      </div>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="tap block h-full">
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="tap block h-full w-full text-left">
        {body}
      </button>
    );
  }
  return body;
}

/**
 * The headline number on a hero surface. Deliberately unstyled as to container — it is
 * dropped inside whatever card owns it, so the same treatment works on light and on a
 * saturated gradient.
 */
export function HeroStat({
  value,
  unit,
  caption,
  size = 'lg',
  className,
  tone,
}: {
  value: ReactNode;
  unit?: ReactNode;
  caption?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  className?: string;
  tone?: CardTone;
}) {
  const scale = { md: 'text-stat-sm', lg: 'text-stat', xl: 'text-stat-lg' }[size];
  return (
    <div className={className}>
      <p className={cn('stat-num flex items-baseline gap-2', scale, tone && ACCENTS[tone])}>
        {value}
        {unit && <span className="text-base font-bold tracking-normal opacity-70">{unit}</span>}
      </p>
      {caption && <p className="mt-1.5 text-sm opacity-80">{caption}</p>}
    </div>
  );
}

/**
 * A signed change. Direction is carried by the arrow glyph as well as the colour, so it
 * still reads for anyone who cannot separate the two hues.
 */
export function Trend({
  delta,
  suffix = '',
  className,
  invert,
}: {
  delta: number;
  suffix?: string;
  className?: string;
  /** For metrics where down is good (missed days, time to start). */
  invert?: boolean;
}) {
  if (!Number.isFinite(delta) || delta === 0) {
    return (
      <span
        className={cn(
          'rounded-pill bg-bg-sunken text-2xs text-fg-subtle inline-flex items-center gap-1 px-2 py-0.5 font-bold',
          className,
        )}
      >
        — no change
      </span>
    );
  }

  const good = invert ? delta < 0 : delta > 0;
  return (
    <span
      className={cn(
        'rounded-pill text-2xs inline-flex items-center gap-1 px-2 py-0.5 font-bold',
        good ? 'bg-success/14 text-success-strong dark:text-success' : 'bg-danger/12 text-danger',
        className,
      )}
    >
      <span aria-hidden>{delta > 0 ? '↑' : '↓'}</span>
      {Math.abs(delta)}
      {suffix}
    </span>
  );
}

/** Label/value pair used inside definition lists on detail cards. */
export function DataRow({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', className)}>
      <dt className="text-fg-muted text-sm">{label}</dt>
      <dd className="text-fg text-right text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
