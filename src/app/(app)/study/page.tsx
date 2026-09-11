import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { getMemberContext } from '@/server/context';
import { buildStudySeed } from '@/server/study-seed';

import { StudySessionScreen } from './study-screen';

export const metadata: Metadata = { title: 'Study session' };

export default async function StudyPage() {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  /*
   * The same payload the dock fetches for itself when a round is picked up on some other
   * route — assembled in one place so a minimised round and an open one can never be drawn
   * from two different readings of the same database. See `@/server/study-seed`.
   */
  return <StudySessionScreen seed={await buildStudySeed(ctx)} />;
}
