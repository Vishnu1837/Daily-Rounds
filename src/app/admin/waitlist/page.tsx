import type { Metadata } from 'next';

import { requireAdmin } from '@/lib/auth/guards';
import { getWaitlistEntries } from '@/server/queries/waitlist';

import { WaitlistScreen } from './waitlist-screen';

export const metadata: Metadata = { title: 'Waitlist' };
export const dynamic = 'force-dynamic';

/**
 * The waitlist console — the only place next-cohort contact details are ever rendered.
 *
 * `requireAdmin` here plus the admin guard inside every action on this screen: the page
 * check keeps students from seeing the UI, and the action checks are what actually keep
 * them out of the data.
 */
export default async function WaitlistPage() {
  await requireAdmin();
  const entries = await getWaitlistEntries();
  const today = new Date().toISOString().slice(0, 10);

  return <WaitlistScreen entries={entries} today={today} />;
}
