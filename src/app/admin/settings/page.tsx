import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireAdmin } from '@/lib/auth/guards';
import { DEFAULT_RISK_THRESHOLDS } from '@/lib/domain/risk';
import { getCohortContext, getPrimaryCohort } from '@/server/context';
import { getCohortCalendarConfig } from '@/server/queries/admin';

import { SettingsScreen } from './settings-screen';

export const metadata: Metadata = { title: 'Cohort settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  await requireAdmin();
  const cohort = await getPrimaryCohort();
  if (!cohort) redirect('/admin/no-cohort');

  const ctx = await getCohortContext(cohort.id);
  if (!ctx) redirect('/admin/no-cohort');

  const { holidays, extras } = await getCohortCalendarConfig(cohort.id);

  return (
    <SettingsScreen
      cohort={{
        id: cohort.id,
        name: cohort.name,
        timezone: cohort.timezone,
        startDate: cohort.startDate,
        endDate: cohort.endDate,
        activeWeekdays: cohort.activeWeekdays,
        streakThresholdPct: cohort.streakThresholdPct,
        meetUrl: cohort.meetUrl,
        meetStartTime: cohort.meetStartTime,
        meetEndTime: cohort.meetEndTime,
      }}
      thresholds={{ ...DEFAULT_RISK_THRESHOLDS, ...ctx.thresholds }}
      rules={ctx.rules}
      holidays={holidays.map((h) => ({ id: h.id, date: h.date, label: h.label }))}
      extras={extras.map((e) => ({ id: e.id, date: e.date, label: e.label }))}
    />
  );
}
