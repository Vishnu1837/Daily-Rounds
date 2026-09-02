import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { getMemberContext } from '@/server/context';
import { getCalendarMonth } from '@/server/queries/student';

import { CalendarScreen } from './calendar-screen';

export const metadata: Metadata = { title: 'Calendar' };
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  const { month } = await searchParams;
  const target = /^\d{4}-\d{2}$/.test(month ?? '') ? `${month}-01` : ctx.today;
  const days = await getCalendarMonth(ctx, target);

  return (
    <CalendarScreen
      days={days}
      month={target.slice(0, 7)}
      today={ctx.today}
      cohortStart={ctx.calendar.startDate}
      cohortEnd={ctx.calendar.endDate}
    />
  );
}
