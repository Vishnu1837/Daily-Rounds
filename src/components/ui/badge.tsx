import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type Tone =
  'neutral' | 'pulse' | 'flame' | 'iris' | 'citrus' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'bg-bg-sunken text-fg-muted ring-border',
  pulse: 'bg-pulse-500/12 text-pulse-700 ring-pulse-500/25 dark:text-pulse-200',
  flame: 'bg-flame-500/14 text-flame-700 ring-flame-500/28 dark:text-flame-300',
  iris: 'bg-iris-500/12 text-iris-700 ring-iris-500/25 dark:text-iris-300',
  citrus: 'bg-citrus-500/20 text-citrus-700 ring-citrus-500/35 dark:text-citrus-300',
  success: 'bg-success/14 text-success-strong ring-success/28 dark:text-success',
  warning: 'bg-warning/18 text-warning-strong ring-warning/32 dark:text-warning',
  danger: 'bg-danger/12 text-danger-strong ring-danger/25 dark:text-danger',
};

const SOLID: Record<Tone, string> = {
  neutral: 'bg-ink-900 text-white dark:bg-ink-100 dark:text-ink-950',
  pulse: 'bg-pulse-600 text-white',
  flame: 'bg-flame-500 text-white',
  iris: 'bg-iris-600 text-white',
  citrus: 'bg-citrus-400 text-ink-950',
  success: 'bg-success-strong text-white',
  warning: 'bg-warning text-ink-950',
  danger: 'bg-danger text-white',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
  icon,
  solid,
  size = 'md',
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  icon?: ReactNode;
  /** Filled rather than tinted. For counts and the single most important label on a card. */
  solid?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      className={cn(
        'rounded-pill inline-flex shrink-0 items-center gap-1.5 font-semibold',
        size === 'sm' ? 'text-2xs px-2 py-0.5' : 'px-2.5 py-1 text-xs',
        solid ? SOLID[tone] : cn(TONES[tone], 'ring-1 ring-inset'),
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/**
 * Status dot + label. Status is never communicated by colour alone — the label always
 * carries the meaning for anyone who cannot distinguish the hues.
 */
export function StatusPill({
  tone,
  label,
  className,
  title,
}: {
  tone: Tone;
  label: string;
  className?: string;
  /** Explains *why* the status is what it is. Shown on hover and to screen readers. */
  title?: string;
}) {
  const dot: Record<Tone, string> = {
    neutral: 'bg-fg-subtle',
    pulse: 'bg-pulse-500',
    flame: 'bg-flame-500',
    iris: 'bg-iris-500',
    citrus: 'bg-citrus-500',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  };
  return (
    <span
      title={title}
      className={cn(
        'rounded-pill inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', dot[tone])} aria-hidden />
      {label}
      {title && <span className="sr-only"> — {title}</span>}
    </span>
  );
}

/**
 * A "live" indicator with a pulsing halo. Used only where something is genuinely happening
 * right now — a running study session, an open study room.
 */
export function LiveDot({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="relative grid size-2 place-items-center" aria-hidden>
        <span className="animate-ring-live bg-danger absolute size-2 rounded-full" />
        <span className="bg-danger size-2 rounded-full" />
      </span>
      {label && (
        <span className="text-2xs text-danger font-bold tracking-[0.14em] uppercase">{label}</span>
      )}
    </span>
  );
}
