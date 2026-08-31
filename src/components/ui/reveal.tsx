import type { ElementType, ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * The staggered entrance used for lists and dashboard grids.
 *
 * Deliberately a *CSS* animation with a `both` fill rather than a JS/Framer transition, for
 * three reasons that matter more than the extra polish a spring would buy:
 *
 *   1. It works in Server Components, so a page of static cards does not have to become a
 *      client bundle just to fade in.
 *   2. The content is in the DOM and readable from the first paint; the animation only
 *      decorates it. Nothing a student needs is ever gated on an animation finishing.
 *   3. `prefers-reduced-motion` collapses it globally from one rule in the stylesheet.
 *
 * Delays are capped hard: a fortnight of heatmap cells must never leave the last one
 * waiting eight seconds to appear.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  /** Index in the group, not milliseconds — the component owns the timing curve. */
  delay?: number;
  className?: string;
  as?: ElementType;
}) {
  const ms = Math.min(delay * 55, 420);
  return (
    <Tag className={cn('animate-rise', className)} style={{ animationDelay: `${ms}ms` }}>
      {children}
    </Tag>
  );
}
