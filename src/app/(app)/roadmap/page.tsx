import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { SUBJECTS } from '@/lib/subjects';
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

  return (
    <RoadmapScreen
      roadmaps={roadmaps}
      // The full catalogue, so a student can switch to any of the 19. Filtering to what is
      // actually offerable happens in the sheet, which knows both current slots.
      subjectOptions={SUBJECTS.map((s) => ({
        slug: s.slug,
        name: s.name,
        phaseLabel: s.phaseLabel,
      }))}
    />
  );
}
