import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireAdmin } from '@/lib/auth/guards';
import { getPrimaryCohort } from '@/server/context';
import { getCohortAnnouncements, getCohortEvents } from '@/server/queries/admin';

import { EventsScreen } from './events-screen';

export const metadata: Metadata = { title: 'Events' };

// Not prerendered — see the note in the admin layout. This page is all data.
export const instant = false;

export default async function EventsPage() {
  await requireAdmin();
  const cohort = await getPrimaryCohort();
  if (!cohort) redirect('/admin/no-cohort');

  const [events, announcements] = await Promise.all([
    getCohortEvents(cohort.id),
    getCohortAnnouncements(cohort.id),
  ]);

  return (
    <EventsScreen
      cohortId={cohort.id}
      defaultMeetUrl={cohort.meetUrl}
      events={events.map((e) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        description: e.description,
        date: e.date,
        startTime: e.startTime,
        endTime: e.endTime,
        meetUrl: e.meetUrl,
      }))}
      announcements={announcements.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        isPinned: a.isPinned,
        isPopup: a.isPopup,
        isPersistent: a.isPersistent,
      }))}
    />
  );
}
