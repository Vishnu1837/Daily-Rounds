import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { StreakFlame } from '@/components/gamification/streak-flame';
import { StatusPill } from '@/components/ui/badge';
import { Card, CardHeader, SectionTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { ProgressBar } from '@/components/ui/progress';
import { Avatar } from '@/components/ui/avatar';
import { requireAdmin } from '@/lib/auth/guards';
import { isActiveStudyDay, isHoliday } from '@/lib/domain/calendar';
import { RISK_LABELS } from '@/lib/domain/risk';
import { getCohortContext, getPrimaryCohort } from '@/server/context';
import { getCohortOverview, getCohortStudents } from '@/server/queries/admin';

import { RecalculateButton } from './recalculate-button';

export const metadata: Metadata = { title: 'Admin overview' };
export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  await requireAdmin();
  const cohort = await getPrimaryCohort();
  if (!cohort) redirect('/admin/no-cohort');

  const ctx = await getCohortContext(cohort.id);
  if (!ctx) redirect('/admin/no-cohort');

  const students = await getCohortStudents(ctx);
  const overview = await getCohortOverview(ctx, students);

  const turnout =
    overview.size === 0 ? 0 : Math.round((overview.activeToday / overview.size) * 100);

  // Nobody is expected to show up on a weekend or a cohort holiday, so a zero today is
  // information, not an alarm. Colouring it as a warning would train the admin to ignore
  // the colour on the days it actually matters.
  const restDay = !isActiveStudyDay(ctx.calendar, ctx.today);
  const restLabel = isHoliday(ctx.calendar, ctx.today) ? 'Cohort holiday' : 'Rest day';

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1 pt-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-fg">{cohort.name}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {overview.size} students · {ctx.today} ({cohort.timezone})
          </p>
        </div>
        <RecalculateButton cohortId={cohort.id} />
      </header>

      {/* -------------------------------------------------------- headline */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Active today"
          value={restDay ? '—' : `${overview.activeToday}/${overview.size}`}
          sub={restDay ? restLabel : `${turnout}% turnout`}
          tone={restDay ? 'neutral' : turnout >= overview.thresholdPct ? 'good' : 'warn'}
        />
        <Metric
          label="Attendance marked"
          value={restDay ? '—' : `${overview.attendanceMarked}/${overview.size}`}
          sub={
            restDay
              ? 'No study room today'
              : overview.attendanceMarked < overview.size
                ? `${overview.size - overview.attendanceMarked} still unmarked`
                : `${overview.attendanceToday} present or late`
          }
          tone={
            restDay ? 'neutral' : overview.attendanceMarked < overview.size ? 'warn' : 'good'
          }
        />
        <Metric
          label="Avg consistency"
          value={`${overview.avgConsistency}%`}
          sub={`${overview.checkInsToday} check-ins today`}
        />
        <Metric label="Avg roadmap" value={`${overview.avgRoadmap}%`} sub="topics complete" />
      </div>

      {/* ---------------------------------------------------- cohort streak */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <StreakFlame streak={overview.cohortStreak} size="lg" />
            <div>
              <p className="text-xl font-extrabold text-fg">
                {overview.cohortStreak} day cohort streak
              </p>
              <p className="text-sm text-fg-muted">
                Survives any day at least {overview.thresholdPct}% of the cohort shows up.
              </p>
            </div>
          </div>
          <div className="min-w-[12rem] flex-1">
            <ProgressBar
              value={restDay ? 0 : turnout}
              tone={!restDay && turnout >= overview.thresholdPct ? 'success' : 'flame'}
              label="Turnout today"
            />
            <p className="mt-1.5 text-xs text-fg-subtle">
              {restDay ? `${restLabel} — the streak is safe` : `Today: ${turnout}%`} · total study
              time {Math.round(overview.totalStudyMinutes / 60)}h
            </p>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------ needs attention */}
      <section className="space-y-2">
        <SectionTitle
          action={
            <Link
              href="/admin/students"
              className="text-sm font-semibold text-pulse-700 dark:text-pulse-400"
            >
              All students
            </Link>
          }
        >
          Students needing attention
        </SectionTitle>

        {overview.needsAttention.length === 0 ? (
          <Card>
            <EmptyState
              emoji="🟢"
              title="Everyone is on track"
              description="No student has missed enough active study days to need a nudge. Worth telling them."
            />
          </Card>
        ) : (
          <Card className="divide-y divide-border p-0">
            {overview.needsAttention.map((s) => (
              <Link
                key={s.memberId}
                href={`/admin/students/${s.memberId}`}
                className="tap flex items-center gap-3 p-4 transition-colors hover:bg-bg-sunken"
              >
                <Avatar name={s.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-fg">{s.name}</p>
                  <p className="truncate text-xs text-fg-muted">
                    {s.riskReasons[0] ?? `${s.consistencyPct}% consistency`}
                  </p>
                </div>
                <StatusPill
                  tone={s.risk === 'needs_intervention' ? 'danger' : 'warning'}
                  label={RISK_LABELS[s.risk]}
                />
              </Link>
            ))}
          </Card>
        )}
      </section>

      {/* ----------------------------------------------------- quick actions */}
      <section className="space-y-2">
        <SectionTitle>Quick actions</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <QuickAction
            href="/admin/attendance"
            emoji="✅"
            title="Mark today's attendance"
            description={
              restDay
                ? 'No study room scheduled today'
                : overview.attendanceMarked < overview.size
                  ? `${overview.size - overview.attendanceMarked} students still unmarked`
                  : 'All marked for today'
            }
          />
          <QuickAction
            href="/admin/roadmaps"
            emoji="🗺️"
            title="Assign today's topics"
            description="Give every student their next roadmap topic in one click"
          />
          <QuickAction
            href="/admin/check-ins"
            emoji="📝"
            title="Read today's check-ins"
            description={`${overview.checkInsToday} submitted so far`}
          />
          <QuickAction
            href="/admin/settings"
            emoji="⚙️"
            title="Cohort settings"
            description="Meet link, study days, holidays and scoring"
          />
        </div>
      </section>

      {/* ----------------------------------------------------- top of cohort */}
      <Card className="overflow-hidden">
        <CardHeader title="Cohort standings" description="Ranked by consistency." />
        <ul className="mt-2 divide-y divide-border">
          {students
            .filter((s) => s.status === 'active')
            .sort((a, b) => b.consistencyPct - a.consistencyPct)
            .slice(0, 8)
            .map((s, i) => (
              <li key={s.memberId} className="flex items-center gap-3 px-5 py-3">
                <span className="w-5 text-sm font-extrabold text-fg-subtle tabular-nums">
                  {i + 1}
                </span>
                <Avatar name={s.name} size="xs" />
                <Link
                  href={`/admin/students/${s.memberId}`}
                  className="min-w-0 flex-1 truncate text-sm font-semibold text-fg hover:underline"
                >
                  {s.name}
                </Link>
                <span className="flex items-center gap-1 text-sm font-bold text-flame-600 tabular-nums dark:text-flame-300">
                  <StreakFlame streak={s.streak} size="sm" animated={false} />
                  {s.streak}
                </span>
                <span className="w-11 text-right text-sm font-extrabold text-fg tabular-nums">
                  {s.consistencyPct}%
                </span>
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  return (
    <Card className="p-4">
      <p className="text-2xs leading-tight font-bold tracking-[0.1em] text-fg-subtle uppercase">
        {label}
      </p>
      <p
        className={
          tone === 'good'
            ? 'mt-2 text-2xl font-extrabold text-success'
            : tone === 'warn'
              ? 'mt-2 text-2xl font-extrabold text-warning'
              : 'mt-2 text-2xl font-extrabold text-fg'
        }
      >
        {value}
      </p>
      {sub && <p className="text-xs text-fg-subtle">{sub}</p>}
    </Card>
  );
}

function QuickAction({
  href,
  emoji,
  title,
  description,
}: {
  href: string;
  emoji: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="tap">
      <Card interactive className="flex h-full items-center gap-3.5 p-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-bg-sunken text-xl" aria-hidden>
          {emoji}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-fg">{title}</p>
          <p className="text-xs text-fg-muted">{description}</p>
        </div>
      </Card>
    </Link>
  );
}
