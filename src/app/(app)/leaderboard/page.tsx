import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { getMemberContext } from '@/server/context';
import { getCohortPulse, getLeaderboard } from '@/server/queries/student';

import { LeaderboardScreen } from './leaderboard-screen';

export const metadata: Metadata = { title: 'Leaderboard' };
export const dynamic = 'force-dynamic';

export default async function LeaderboardPage() {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  const [{ rows, recognitions }, pulse] = await Promise.all([
    getLeaderboard(ctx),
    getCohortPulse(ctx),
  ]);

  return (
    <LeaderboardScreen
      rows={rows}
      recognitions={recognitions}
      pulse={pulse}
      cohortName={ctx.cohort.name}
    />
  );
}
