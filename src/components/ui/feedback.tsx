import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-xl', className)} aria-hidden />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="surface space-y-3 p-5" aria-hidden>
      <Skeleton className="h-3 w-24" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-4', i === lines - 1 ? 'w-2/3' : 'w-full')} />
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

export function EmptyState({
  emoji,
  title,
  description,
  action,
  className,
}: {
  emoji: string;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div
        className="mb-4 grid size-16 place-items-center rounded-3xl bg-bg-sunken text-3xl"
        aria-hidden
      >
        {emoji}
      </div>
      <h3 className="text-base font-bold text-fg">{title}</h3>
      <p className="mt-1.5 max-w-xs text-sm text-balance text-fg-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
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
        className="mb-4 grid size-16 place-items-center rounded-3xl bg-danger/10 text-3xl"
        aria-hidden
      >
        ⚠️
      </div>
      <h3 className="text-base font-bold text-fg">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-balance text-fg-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
