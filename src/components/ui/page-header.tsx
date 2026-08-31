import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Every screen opens the same way: a small eyebrow that says *where you are*, a large title
 * that says *what this is*, and one line that says *what it is for*. Actions sit to the
 * right on desktop and drop below the copy on mobile.
 *
 * The consistency is the point — a student should never have to re-learn where the title of
 * a page lives.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Chips, filters or stats that belong to the header rather than to the page body. */
  children?: ReactNode;
}) {
  return (
    <header className={cn('px-1 pt-1 pb-1', className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
          <h1 className="text-fg text-2xl font-extrabold tracking-tight text-balance sm:text-3xl">
            {title}
          </h1>
          {description && <p className="text-fg-muted mt-1.5 max-w-prose text-sm">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}
