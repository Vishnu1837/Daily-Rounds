import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { getMemberContext } from '@/server/context';
import { getPointsLog, getProgressData } from '@/server/queries/student';

import { ProgressScreen } from './progress-screen';

export const metadata: Metadata = { title: 'Progress' };
export const dynamic = 'force-dynamic';

export default async function ProgressPage() {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  const [data, log] = await Promise.all([getProgressData(ctx), getPointsLog(ctx.memberId, 30)]);

  const cohortEnded = ctx.today > ctx.calendar.endDate;

  return <ProgressScreen data={data} log={log} cohortEnded={cohortEnded} />;
}
