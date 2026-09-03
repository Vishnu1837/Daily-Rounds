import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Inbox,
  Map as MapIcon,
  Settings,
  TrendingUp,
  Users,
} from 'lucide-react';

import { StreakFlame } from '@/components/gamification/streak-flame';
import { StatusPill } from '@/components/ui/badge';
import { Card, CardAurora, SectionTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import { StatTile } from '@/components/ui/stat';
import { Avatar } from '@/components/ui/avatar';
import { requireAdmin } from '@/lib/auth/guards';
import { isActiveStudyDay, isHoliday } from '@/lib/domain/calendar';
import { RISK_LABELS } from '@/lib/domain/risk';
import { getCohortContext, getPrimaryCohort } from '@/server/context';
import { getCohortOverview, getCohortStudents } from '@/server/queries/admin';
import { getWaitlistCounts } from '@/server/queries/waitlist';

import { RecalculateButton } from './recalculate-button';

export const metadata: Metadata = { title: 'Admin overview' };

// Not prerendered — see the note in the admin layout. This page is all data.
export const instant = false;

export default async function AdminOverviewPage() {
  await requireAdmin();
  const cohort = await getPrimaryCohort();
  if (!cohort) redirect('/admin/no-cohort');

  const ctx = await getCohortContext(cohort);
  if (!ctx) redirect('/admin/no-cohort');

  /*
   * The overview's turnout query no longer depends on the student roll-up, so both start
   * in the same tick. `getCohortStudents` is request-memoised, so the roster is still read
   * exactly once even though both of these ask for it.
   */
  const [students, overview, waitlist] = await Promise.all([
    getCohortStudents(ctx),
    getCohortOverview(ctx),
    // Not cohort-scoped, and joined to nothing above — it just rides along on the same tick.
    getWaitlistCounts(),
  ]);

  const turnout =
    overview.size === 0 ? 0 : Math.round((overview.activeToday / overview.size) * 100);

  // Nobody is expected to show up on a weekend or a cohort holiday, so a zero today is
  // information, not an alarm. Colouring it as a warning would train the admin to ignore
  // the colour on the days it actually matters.
  const restDay = !isActiveStudyDay(ctx.calendar, ctx.today);
  const restLabel = isHoliday(ctx.calendar, ctx.today) ? 'Cohort holiday' : 'Rest day';

  const unmarked = overview.size - overview.attendanceMarked;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${ctx.today} · ${cohort.timezone}`}
        title={cohort.name}
        description={`${overview.size} students · ranked and scored on process, not marks.`}
        actions={<RecalculateButton cohortId={cohort.id} />}
      />

      {/* ------------------------------------------------------ today at a glance */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <Reveal className="lg:col-span-7">
          <Card
            variant="solid"
            tone={restDay ? 'neutral' : turnout >= overview.thresholdPct ? 'success' : 'pulse'}
            padding="lg"
            glow
            className="h-full overflow-hidden text-white"
          >
            <CardAurora tone={restDay ? 'iris' : 'pulse'} />
            <div className="relative">
              <p className="text-2xs font-bold tracking-[0.16em] text-white/65 uppercase">
                {restDay ? restLabel : 'Turnout today'}
              </p>

              <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
                <p className="stat-num text-stat-lg">{restDay ? '—' : `${turnout}%`}</p>
                <p className="pb-2 text-sm font-semibold text-white/75">
                  {restDay
                    ? 'No study day scheduled — the cohort streak is safe.'
                    : `${overview.activeToday} of ${overview.size} students have shown up.`}
                </p>
              </div>

              <div className="rounded-pill mt-5 h-2.5 w-full overflow-hidden bg-white/20">
                <div
                  className="rounded-pill from-citrus-300 ease-out-soft h-full bg-linear-to-r to-white transition-[width] duration-700"
                  style={{ width: `${restDay ? 0 : Math.max(2, turnout)}%` }}
                />
              </div>
              <p className="mt-2.5 text-sm text-white/70">
                {restDay
                  ? `${restLabel} — nothing is expected today.`
                  : `The cohort streak survives any day at least ${overview.thresholdPct}% show up.`}
              </p>

              <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-white/15 pt-5">
                <div>
                  <dt className="text-2xs font-bold tracking-[0.12em] text-white/55 uppercase">
                    Cohort streak
                  </dt>
                  <dd className="stat-num mt-1 flex items-center gap-1.5 text-xl">
                    <StreakFlame streak={overview.cohortStreak} size="sm" animated={false} />
                    {overview.cohortStreak}
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs font-bold tracking-[0.12em] text-white/55 uppercase">
                    Check-ins
                  </dt>
                  <dd className="stat-num mt-1 text-xl">{overview.checkInsToday}</dd>
                </div>
                <div>
                  <dt className="text-2xs font-bold tracking-[0.12em] text-white/55 uppercase">
                    Study time
                  </dt>
                  <dd className="stat-num mt-1 text-xl">
                    {Math.round(overview.totalStudyMinutes / 60)}h
                  </dd>
                </div>
              </dl>
            </div>
          </Card>
        </Reveal>

        <div className="grid grid-cols-2 gap-3 lg:col-span-5 lg:gap-4">
          <Reveal delay={1}>
            <StatTile
              label="Active today"
              value={restDay ? '—' : `${overview.activeToday}/${overview.size}`}
              sub={restDay ? restLabel : `${turnout}% turnout`}
              tone={restDay ? 'neutral' : turnout >= overview.thresholdPct ? 'success' : 'warning'}
              emphasis
              icon={<Users className="size-4" aria-hidden />}
              className="h-full"
            />
          </Reveal>
          <Reveal delay={2}>
            <StatTile
              label="Attendance marked"
              value={restDay ? '—' : `${overview.attendanceMarked}/${overview.size}`}
              sub={
                restDay
                  ? 'No study room today'
                  : unmarked > 0
                    ? `${unmarked} still unmarked`
                    : `${overview.attendanceToday} present or late`
              }
              tone={restDay ? 'neutral' : unmarked > 0 ? 'warning' : 'success'}
              emphasis
              icon={<CalendarCheck className="size-4" aria-hidden />}
              href="/admin/attendance"
              className="h-full"
            />
          </Reveal>
          <Reveal delay={3}>
            <StatTile
              label="Avg consistency"
              value={`${overview.avgConsistency}%`}
              sub="across the cohort"
              tone="pulse"
              emphasis
              icon={<TrendingUp className="size-4" aria-hidden />}
              className="h-full"
            />
          </Reveal>
          <Reveal delay={4}>
            <StatTile
              label="Avg roadmap"
              value={`${overview.avgRoadmap}%`}
              sub="topics complete"
              tone="iris"
              emphasis
              icon={<MapIcon className="size-4" aria-hidden />}
              href="/admin/roadmaps"
              className="h-full"
            />
          </Reveal>
        </div>
      </div>

      {/* ------------------------------------------------------ needs attention */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <Reveal delay={5} className="lg:col-span-7">
          <Card padding="none" className="h-full overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4">
              <div>
                <h2 className="text-fg text-base font-bold">Students needing attention</h2>
                <p className="text-fg-muted mt-0.5 text-sm">
                  Ranked by risk, worst first. Start here.
                </p>
              </div>
              <Link
                href="/admin/students"
                className="tap text-pulse-700 hover:text-pulse-500 dark:text-pulse-300 shrink-0 text-sm font-semibold"
              >
                All students
              </Link>
            </div>

            {overview.needsAttention.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="size-6" aria-hidden />}
                title="Everyone is on track"
                description="No student has missed enough active study days to need a nudge. Worth telling them."
              />
            ) : (
              <ul className="divide-border border-border divide-y border-t">
                {overview.needsAttention.map((s) => (
                  <li key={s.memberId}>
                    <Link
                      href={`/admin/students/${s.memberId}`}
                      className="tap hover:bg-bg-sunken flex items-center gap-3 p-4 transition-colors"
                    >
                      <Avatar name={s.name} src={s.avatarUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-fg truncate text-sm font-bold">{s.name}</p>
                        <p className="text-fg-muted truncate text-xs">
                          {s.riskReasons[0] ?? `${s.consistencyPct}% consistency`}
                        </p>
                      </div>
                      <StatusPill
                        tone={s.risk === 'needs_intervention' ? 'danger' : 'warning'}
                        label={RISK_LABELS[s.risk]}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Reveal>

        {/* -------------------------------------------------------- standings */}
        <Reveal delay={6} className="lg:col-span-5">
          <Card padding="none" className="h-full overflow-hidden">
            <div className="px-5 pt-5 pb-4">
              <h2 className="text-fg text-base font-bold">Cohort standings</h2>
              <p className="text-fg-muted mt-0.5 text-sm">Ranked by consistency.</p>
            </div>
            <ul className="divide-border border-border divide-y border-t">
              {students
                .filter((s) => s.status === 'active')
                .sort((a, b) => b.consistencyPct - a.consistencyPct)
                .slice(0, 8)
                .map((s, i) => (
                  <li key={s.memberId} className="flex items-center gap-3 px-5 py-3">
                    <span className="stat-num text-fg-subtle w-5 text-sm">{i + 1}</span>
                    <Avatar name={s.name} src={s.avatarUrl} size="xs" />
                    <Link
                      href={`/admin/students/${s.memberId}`}
                      className="text-fg min-w-0 flex-1 truncate text-sm font-semibold hover:underline"
                    >
                      {s.name}
                    </Link>
                    <span className="text-flame-700 dark:text-flame-300 flex items-center gap-1 text-sm font-bold tabular-nums">
                      <StreakFlame streak={s.streak} size="sm" animated={false} />
                      {s.streak}
                    </span>
                    <span className="stat-num text-fg w-11 text-right text-sm">
                      {s.consistencyPct}%
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        </Reveal>
      </div>

      {/* -------------------------------------------------------- quick actions */}
      <section className="space-y-3">
        <SectionTitle>Quick actions</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <QuickAction
            href="/admin/attendance"
            icon={<CalendarCheck className="size-5" aria-hidden />}
            tone="pulse"
            title="Mark attendance"
            description={
              restDay
                ? 'No study room scheduled today'
                : unmarked > 0
                  ? `${unmarked} students still unmarked`
                  : 'All marked for today'
            }
          />
          <QuickAction
            href="/admin/roadmaps"
            icon={<MapIcon className="size-5" aria-hidden />}
            tone="iris"
            title="Assign today's topics"
            description="Give every student their next roadmap topic in one click"
          />
          <QuickAction
            href="/admin/check-ins"
            icon={<ClipboardList className="size-5" aria-hidden />}
            tone="flame"
            title="Read check-ins"
            description={`${overview.checkInsToday} submitted so far today`}
          />
          <QuickAction
            href="/admin/waitlist"
            icon={<Inbox className="size-5" aria-hidden />}
            tone="iris"
            title="Next-cohort waitlist"
            description={
              waitlist.total === 0
                ? 'Nobody has filled in the public form yet'
                : waitlist.new > 0
                  ? `${waitlist.new} new of ${waitlist.total} not yet contacted`
                  : `${waitlist.total} enquiries, all followed up`
            }
          />
          <QuickAction
            href="/admin/settings"
            icon={<Settings className="size-5" aria-hidden />}
            tone="neutral"
            title="Cohort settings"
            description="Meet link, study days, holidays and scoring"
          />
        </div>
      </section>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  tone,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  tone: 'pulse' | 'iris' | 'flame' | 'neutral';
  title: string;
  description: string;
}) {
  const chip = {
    pulse: 'bg-pulse-500/12 text-pulse-600 dark:text-pulse-300',
    iris: 'bg-iris-500/12 text-iris-600 dark:text-iris-300',
    flame: 'bg-flame-500/14 text-flame-600 dark:text-flame-300',
    neutral: 'bg-bg-sunken text-fg-muted',
  }[tone];

  return (
    <Link href={href} className="tap block h-full">
      <Card interactive padding="md" className="flex h-full flex-col">
        <span className={`grid size-10 place-items-center rounded-xl ${chip}`} aria-hidden>
          {icon}
        </span>
        <p className="text-fg mt-3.5 text-sm font-bold">{title}</p>
        <p className="text-fg-muted mt-1 text-xs leading-relaxed">{description}</p>
      </Card>
    </Link>
  );
}
