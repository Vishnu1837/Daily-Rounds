import type { ReactNode } from 'react';

import './editorial.css';

/**
 * The public shell.
 *
 * Deliberately bare next to the authenticated layout: no nav rail, no bottom bar, no member
 * chrome. The two halves of the product share a name and a mark but not a design language —
 * marketing clarity outside, task clarity inside — and the cleanest way to hold that line is
 * for the public tree to have no access to the portal's navigation at all.
 *
 * `editorial.css` is imported here rather than globally so the public site's tokens ship
 * with the public route and nothing else. It defines only `.ed`-scoped rules, so importing
 * it can never reach a product screen even if a portal page were later nested underneath.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh">{children}</div>;
}
