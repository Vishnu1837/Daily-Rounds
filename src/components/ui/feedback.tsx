import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-panel', className)} aria-hidden />;
}

/**
 * Loading states mirror the *shape* of what is coming rather than showing a spinner, so the
 * layout does not jump when the data lands and the wait reads as "nearly there" instead of
 * "something is happening somewhere".
 */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="surface shadow-soft space-y-3 p-5" aria-hidden>
      <Skeleton className="h-3 w-24" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-4', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="surface shadow-soft space-y-3 p-4">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-2.5 w-12" />
        </div>
      ))}
    </div>
  );
}

/** Screen-reader-only live region used to announce state changes. */
export function LiveRegion({ children }: { children: ReactNode }) {
  return (
    <div aria-live="polite" className="sr-only">
      {children}
    </div>
  );
}

/**
 * The empty-state mark.
 *
 * A drawn shape rather than an emoji: emoji render differently on every platform, cannot be
 * tinted to the theme, and at 48px look like a placeholder someone forgot to replace. This
 * is three concentric rings with a soft wash — quiet, on-brand, and identical everywhere.
 */
function EmptyMark({
  tone = 'pulse',
  glyph,
}: {
  tone?: 'pulse' | 'iris' | 'flame';
  glyph?: ReactNode;
}) {
  const wash = {
    pulse: 'from-pulse-500/18 to-iris-500/10 text-pulse-600 dark:text-pulse-300',
    iris: 'from-iris-500/18 to-blush-400/10 text-iris-600 dark:text-iris-300',
    flame: 'from-flame-500/18 to-citrus-400/12 text-flame-600 dark:text-flame-300',
  }[tone];

  return (
    <div className="relative mb-5 grid place-items-center" aria-hidden>
      <span className="border-border absolute size-24 rounded-full border border-dashed" />
      <span className="border-border absolute size-[4.5rem] rounded-full border" />
      <span className={cn('grid size-14 place-items-center rounded-2xl bg-linear-to-br', wash)}>
        {glyph}
      </span>
    </div>
  );
}

export function EmptyState({
  icon,
  tone = 'pulse',
  title,
  description,
  action,
  className,
}: {
  /** A lucide icon element, sized by the caller. */
  icon?: ReactNode;
  tone?: 'pulse' | 'iris' | 'flame';
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <EmptyMark tone={tone} glyph={icon} />
      <h3 className="text-fg text-base font-bold">{title}</h3>
      <p className="text-fg-muted mt-1.5 max-w-xs text-sm text-balance">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
}: {
  title?: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center" role="alert">
      <div
        className="bg-danger/12 text-danger mb-5 grid size-14 place-items-center rounded-2xl"
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          className="size-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 8v5" strokeLinecap="round" />
          <circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none" />
          <path
            d="M10.3 3.9 2.6 17.1A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 className="text-fg text-base font-bold">{title}</h3>
      <p className="text-fg-muted mt-1.5 max-w-sm text-sm text-balance">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
