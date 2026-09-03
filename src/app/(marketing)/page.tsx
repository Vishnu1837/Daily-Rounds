import type { Metadata } from 'next';

import { SITE } from '@/lib/site';

import { LandingPage } from './landing';

export const metadata: Metadata = {
  // Absolute: the root layout appends the product name to every title, which on the
  // landing page itself would read "… by Mohammed Imran … · Daily Rounds 360".
  title: { absolute: `${SITE.name} by ${SITE.founder} — ${SITE.tagline}` },
  description:
    'A 30-day accountability system for medical students: monitored weekday study rooms, ' +
    'a syllabus-driven two-subject roadmap, visible progress and personal follow-up.',
  openGraph: {
    title: `${SITE.name} by ${SITE.founder}`,
    description:
      'Stop collecting study plans. Start showing up for one. A 30-day accountability ' +
      'system for medical students.',
    type: 'website',
  },
};

/**
 * The main domain.
 *
 * Static on purpose. It reads nothing from the database and renders no student data, which
 * is both the privacy requirement from the brief and the reason it can be served from the
 * edge cache without a function invocation.
 */
export default function LandingRoute() {
  return <LandingPage />;
}
