import type { Metadata } from 'next';

import { AnnouncementPopup } from '@/components/announcements/announcement-popup';
import { requireOnboardedUser } from '@/lib/auth/guards';
import { ADMIN_HOME } from '@/lib/routes';
import { getMemberContext } from '@/server/context';
import { getCohortPulse, getHomeData, getPopupAnnouncements } from '@/server/queries/student';
import { redirect } from 'next/navigation';

import { HomeScreen } from './home-screen';

export const metadata: Metadata = { title: 'Today' };
export default async function HomePage() {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect(ADMIN_HOME);

  const [home, pulse, popups] = await Promise.all([
    getHomeData(ctx),
    getCohortPulse(ctx),
    getPopupAnnouncements(ctx),
  ]);

  return (
    <>
      {/* Rendered on the dashboard specifically: it is where every student lands. */}
      {popups.length > 0 && (
        <AnnouncementPopup
          announcements={popups.map((a) => ({ id: a.id, title: a.title, body: a.body }))}
        />
      )}
      <HomeScreen
        firstName={user.fullName.split(' ')[0] ?? user.fullName}
        cohortName={ctx.cohort.name}
        home={home}
        pulse={pulse}
      />
    </>
  );
}
