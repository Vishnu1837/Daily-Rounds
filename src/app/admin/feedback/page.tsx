import type { Metadata } from 'next';

import { requireAdmin } from '@/lib/auth/guards';
import { getFeedbackReports } from '@/server/queries/feedback';

import { FeedbackScreen } from './feedback-screen';

export const metadata: Metadata = { title: 'User feedback' };

// Not prerendered — see the note in the admin layout. This page is all data.
export const instant = false;

/**
 * Everything students have told us is wrong with the app, and everything they wish it did.
 *
 * `requireAdmin` here plus the admin guard inside every action on this screen and inside the
 * route that serves the screenshots: the page check keeps students from seeing the UI, and
 * the other two are what actually keep them out of each other's reports.
 */
export default async function FeedbackPage() {
  await requireAdmin();
  const reports = await getFeedbackReports();

  return <FeedbackScreen reports={reports} />;
}
