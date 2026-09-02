import type { ReactNode } from 'react';

import { PageHeader } from '@/components/ui/page-header';

/**
 * The loading state for a screen, with its real heading already in place.
 *
 * Under Cache Components this markup is not a stopgap the server sends while it works — it
 * is prerendered at build time and delivered by the prefetch, so it is on screen the instant
 * a tab is tapped, before any request goes out. That changes what belongs in it. A generic
 * grey rectangle wastes the one moment when something truthful could be shown, so each
 * screen states where you have arrived and sketches the shape of what is coming; only the
 * numbers are left blank, because only the numbers are actually unknown.
 *
 * Keep the eyebrow, title and description identical to the screen's own `PageHeader`. They
 * are duplicated deliberately — the header is static and the body is not, and that seam is
 * exactly where the prerender ends.
 */
export function PageLoading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  /** A sketch of the body, shaped like the real thing so nothing jumps when it lands. */
  children: ReactNode;
}) {
  return (
    <div className="space-y-4 lg:space-y-5" aria-busy>
      <span className="sr-only" role="status">
        Loading {title}
      </span>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      {children}
    </div>
  );
}
