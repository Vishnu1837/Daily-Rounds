import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'pulse' | 'flame' | 'iris' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'bg-bg-sunken text-fg-muted ring-border',
  pulse: 'bg-pulse-500/12 text-pulse-700 ring-pulse-500/25 dark:text-pulse-300',
  flame: 'bg-flame-500/14 text-flame-600 ring-flame-500/25 dark:text-flame-300',
  iris: 'bg-iris-500/12 text-iris-600 ring-iris-500/25 dark:text-iris-300',
  success: 'bg-success/12 text-success ring-success/25',
  warning: 'bg-warning/16 text-warning ring-warning/30',
  danger: 'bg-danger/12 text-danger ring-danger/25',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
  icon,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        TONES[tone],
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
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  };
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
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
