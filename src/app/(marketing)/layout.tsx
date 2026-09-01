import type { ReactNode } from 'react';

/**
 * The public shell.
 *
 * Deliberately bare next to the authenticated layout: no nav rail, no bottom bar, no member
 * chrome. The two halves of the product share brand language but not density — marketing
 * clarity outside, task clarity inside — and the cleanest way to hold that line is for the
 * public tree to have no access to the portal's navigation at all.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <div className="bg-bg min-h-dvh">{children}</div>;
}
