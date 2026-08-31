import type { Metadata } from 'next';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { getMemberContext } from '@/server/context';
import { getCohortPulse, getHomeData } from '@/server/queries/student';
import { redirect } from 'next/navigation';

import { HomeScreen } from './home-screen';

export const metadata: Metadata = { title: 'Today' };
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  const [home, pulse] = await Promise.all([getHomeData(ctx), getCohortPulse(ctx)]);

  return (
    <HomeScreen
      firstName={user.fullName.split(' ')[0] ?? user.fullName}
      cohortName={ctx.cohort.name}
      home={home}
      pulse={pulse}
    />
  );
}
