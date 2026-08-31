import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { getMemberContext } from '@/server/context';
import { getRoadmaps } from '@/server/queries/student';

import { RoadmapScreen } from './roadmap-screen';

export const metadata: Metadata = { title: 'Roadmap' };
export const dynamic = 'force-dynamic';

export default async function RoadmapPage() {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  const roadmaps = await getRoadmaps(ctx);
  return <RoadmapScreen roadmaps={roadmaps} />;
}
