import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireAdmin } from '@/lib/auth/guards';
import { isActiveStudyDay } from '@/lib/domain/calendar';
import { getCohortContext, getPrimaryCohort } from '@/server/context';
import { getAttendanceSheet } from '@/server/queries/admin';

import { AttendanceSheet } from './attendance-sheet';

export const metadata: Metadata = { title: 'Attendance' };
export const dynamic = 'force-dynamic';

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireAdmin();
  const cohort = await getPrimaryCohort();
  if (!cohort) redirect('/admin/no-cohort');

  const ctx = await getCohortContext(cohort.id);
  if (!ctx) redirect('/admin/no-cohort');

  const { date } = await searchParams;
  const target = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date! : ctx.today;
  const rows = await getAttendanceSheet(ctx, target);

  return (
    <AttendanceSheet
      cohortId={cohort.id}
      date={target}
      today={ctx.today}
      isActiveDay={isActiveStudyDay(ctx.calendar, target)}
      rows={rows}
    />
  );
}
