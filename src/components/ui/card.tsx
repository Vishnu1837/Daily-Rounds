import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

export function Card({
  className,
  interactive,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        'surface shadow-soft',
        interactive &&
          'tap transition-[transform,box-shadow] duration-200 hover:shadow-lift active:scale-[0.99] motion-reduce:active:scale-100',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  action,
  icon,
  description,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-5', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">{title}</h2>
        </div>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

/** A section heading used between cards on a page. */
export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 px-1', className)}>
      <h2 className="text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">{children}</h2>
      {action}
    </div>
  );
}
