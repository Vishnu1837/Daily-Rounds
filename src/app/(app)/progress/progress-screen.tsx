'use client';

import { useState } from 'react';
import { Clock, Flame, Lock, Target, Trophy } from 'lucide-react';

import { Donut } from '@/components/charts/donut';
import { ActivityHeatmap } from '@/components/charts/heatmap';
import { WeekBars } from '@/components/charts/week-bars';
import { LevelBadge, XPBar } from '@/components/gamification/level';
import { StreakFlame } from '@/components/gamification/streak-flame';
import { Badge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Card, CardAurora } from '@/components/ui/card';
import { AnimatedCounter } from '@/components/ui/counter';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressBar, ProgressRing } from '@/components/ui/progress';
import { Reveal } from '@/components/ui/reveal';
import { Sheet } from '@/components/ui/sheet';
import { StatTile, Trend } from '@/components/ui/stat';
import { cn } from '@/lib/cn';
import { levelFromPoints } from '@/lib/domain/level';
import { POINT_EVENT_LABELS } from '@/lib/domain/points';
import type { ProgressData } from '@/server/queries/student';

type LogEntry = {
  id: string;
  event: keyof typeof POINT_EVENT_LABELS;
  points: number;
  occurredOn: string;
  reason: string | null;
};

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function ProgressScreen({
  data,
  log,
  cohortEnded,
}: {
  data: ProgressData;
  log: LogEntry[];
  cohortEnded: boolean;
}) {
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const earned = data.achievements.filter((a) => a.earnedOn);
  const locked = data.achievements.filter((a) => !a.earnedOn);
  const level = levelFromPoints(data.points);

  const subjectPct =
    data.topicsTotal === 0 ? 0 : Math.round((data.topicsCompleted / data.topicsTotal) * 100);
  const attendancePct =
    data.sessionsPossible === 0
      ? 0
      : Math.round((data.sessionsAttended / data.sessionsPossible) * 100);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Your record"
        title="Progress"
        description="Everything here is measured over active study days only — weekends and holidays never count against you."
      />

      {/* ----------------------------------------------------------- headline */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <Reveal className="lg:col-span-7">
          <Card
            variant="solid"
            tone="pulse"
            padding="lg"
            glow
            className="h-full overflow-hidden text-white"
          >
            <CardAurora tone="pulse" />
            <div className="relative flex flex-wrap items-center gap-6">
              <ProgressRing
                value={data.overall.consistencyPct}
                size={120}
                stroke={11}
                tone="citrus"
                trackClassName="stroke-white/20"
                label="Overall consistency"
              >
                <div className="text-center">
                  <span className="stat-num block text-2xl text-white">
                    <AnimatedCounter value={data.overall.consistencyPct} suffix="%" />
                  </span>
                  <span className="text-2xs font-bold text-white/60 uppercase">overall</span>
                </div>
              </ProgressRing>

              <div className="min-w-0 flex-1">
                <p className="text-2xs font-bold tracking-[0.16em] text-white/65 uppercase">
                  Overall consistency
                </p>
                <p className="mt-2 text-lg font-bold text-balance">
                  You showed up on {data.overall.completedDays} of {data.overall.activeDays} study
                  days.
                </p>
                {data.improvement.deltaPct !== 0 && (
                  <p className="rounded-pill mt-3 inline-flex items-center gap-1.5 bg-white/15 px-3 py-1 text-xs font-bold ring-1 ring-white/20 ring-inset">
                    <span aria-hidden>{data.improvement.deltaPct > 0 ? '↑' : '↓'}</span>
                    {Math.abs(data.improvement.deltaPct)} percentage points since week 1
                  </p>
                )}
              </div>
            </div>
          </Card>
        </Reveal>

        <Reveal delay={1} className="lg:col-span-5">
          <Card padding="lg" className="h-full">
            <LevelBadge info={level} size="lg" />
            <XPBar info={level} className="mt-5" />
            <button
              type="button"
              onClick={() => setLedgerOpen(true)}
              className="tap rounded-panel bg-bg-sunken hover:bg-bg-inset mt-5 flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors"
            >
              <span>
                <span className="eyebrow block">Total XP</span>
                <span className="stat-num text-citrus-700 dark:text-citrus-300 mt-0.5 block text-xl">
                  <AnimatedCounter value={data.points} />
                </span>
              </span>
              <span className="text-pulse-700 dark:text-pulse-300 text-sm font-semibold">
                See the ledger →
              </span>
            </button>
          </Card>
        </Reveal>
      </div>

      {/* --------------------------------------------------------- stat grid */}
      <Reveal delay={2}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <StatTile
            label="Current streak"
            value={
              <>
                <StreakFlame streak={data.streak} size="md" />
                {data.streak}
              </>
            }
            sub={`Best run: ${data.bestStreak} days`}
            tone="flame"
            emphasis
          />
          <StatTile
            label="Show-up rate"
            value={`${data.overall.showUpRatePct}%`}
            sub={`${data.overall.completedDays} / ${data.overall.activeDays} days`}
            tone="pulse"
            emphasis
            icon={<Target className="size-4" aria-hidden />}
          />
          <StatTile
            label="Study time"
            value={formatHours(data.studyMinutes)}
            sub="self-reported"
            tone="neutral"
            emphasis
            icon={<Clock className="size-4" aria-hidden />}
          />
          <StatTile
            label="Achievements"
            value={`${earned.length}/${data.achievements.length}`}
            sub="unlocked"
            tone="citrus"
            emphasis
            icon={<Trophy className="size-4" aria-hidden />}
          />
        </div>
      </Reveal>

      {/* ---------------------------------------------------- consistency grid */}
      <Reveal delay={3}>
        <Card padding="lg">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Consistency</p>
              <h2 className="text-fg mt-1 text-base font-bold">
                Every study day since the cohort began
              </h2>
            </div>
            <Trend delta={data.improvement.deltaPct} suffix="pts" />
          </div>
          <div className="mt-5">
            <ActivityHeatmap days={data.heatmap} />
          </div>
        </Card>
      </Reveal>

      {/* -------------------------------------------------- week trend + split */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <Reveal delay={4} className="lg:col-span-7">
          <Card padding="lg" className="h-full">
            <p className="eyebrow">Week by week</p>
            <h2 className="text-fg mt-1 text-base font-bold">Is the trend going up?</h2>
            <div className="mt-4">
              <WeekBars weeks={data.weeks} />
            </div>
          </Card>
        </Reveal>

        <Reveal delay={5} className="lg:col-span-5">
          <Card padding="lg" className="h-full">
            <p className="eyebrow">Where your XP came from</p>
            <div className="mt-5">
              <Donut
                slices={data.pointsByEvent.slice(0, 7).map((row) => ({
                  key: row.event,
                  label: POINT_EVENT_LABELS[row.event] ?? row.event,
                  value: row.points,
                }))}
                size={148}
                thickness={22}
                centreValue={data.points.toLocaleString()}
                centreLabel="total XP"
              />
            </div>
          </Card>
        </Reveal>
      </div>

      {/* --------------------------------------------------------- completion */}
      <Reveal delay={6}>
        <Card padding="lg">
          <p className="eyebrow">Completion</p>
          <div className="mt-5 grid gap-6 sm:grid-cols-2">
            <MeterRow
              label={data.subjectName ?? 'Roadmap'}
              caption={`${data.topicsCompleted} of ${data.topicsTotal} topics complete`}
              value={subjectPct}
              tone="iris"
            />
            <MeterRow
              label="Study room attendance"
              caption={`${data.sessionsAttended} of ${data.sessionsPossible} sessions`}
              value={attendancePct}
              tone="pulse"
            />
          </div>
        </Card>
      </Reveal>

      {/* ------------------------------------------------------- achievements */}
      <Reveal delay={7}>
        <Card padding="lg">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="eyebrow">Achievements</p>
              <h2 className="text-fg mt-1 text-base font-bold">
                {earned.length} of {data.achievements.length} unlocked
              </h2>
            </div>
            <ProgressBar
              value={
                data.achievements.length === 0
                  ? 0
                  : (earned.length / data.achievements.length) * 100
              }
              tone="citrus"
              height="sm"
              className="max-w-40"
              label="Achievements unlocked"
            />
          </div>

          <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[...earned, ...locked].map((a, i) => (
              <li key={a.code}>
                <AchievementTile achievement={a} index={i} />
              </li>
            ))}
          </ul>
        </Card>
      </Reveal>

      {/* ---------------------------------------------------- baseline compare */}
      {data.baseline && (
        <Reveal delay={8}>
          <Card padding="lg">
            <p className="eyebrow">Before and now</p>
            <h2 className="text-fg mt-1 text-base font-bold">
              Recorded when you joined, so the change is measurable
            </h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="surface-sunken p-4">
                <p className="eyebrow">Before</p>
                <dl className="mt-3 space-y-2.5">
                  <BaselineRow
                    label="Days studied last week"
                    value={`${data.baseline.daysStudiedLastWeek}/7`}
                  />
                  <BaselineRow
                    label="Consistency rating"
                    value={`${data.baseline.consistencyRating}/10`}
                  />
                  <BaselineRow label="Subject confidence" value={`${data.baseline.confidence}/5`} />
                </dl>
              </div>
              <div className="rounded-panel bg-pulse-500/10 ring-pulse-500/20 p-4 ring-1 ring-inset">
                <p className="eyebrow text-pulse-700 dark:text-pulse-300">Now</p>
                <dl className="mt-3 space-y-2.5">
                  <BaselineRow
                    label="Showed up"
                    value={`${data.overall.completedDays}/${data.overall.activeDays}`}
                  />
                  <BaselineRow label="Consistency" value={`${data.overall.consistencyPct}%`} />
                  <BaselineRow label="Best streak" value={`${data.bestStreak} days`} />
                </dl>
              </div>
            </div>

            {cohortEnded && (
              <LinkButton href="/report" size="lg" fullWidth className="mt-5">
                See your end-of-cohort report
              </LinkButton>
            )}
          </Card>
        </Reveal>
      )}

      {/* ------------------------------------------------------------- ledger */}
      <Sheet
        open={ledgerOpen}
        onClose={() => setLedgerOpen(false)}
        title="XP ledger"
        description="Every point you have earned, and exactly what it was for. Nothing here is ever removed."
      >
        <ul className="divide-border divide-y">
          {log.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-fg text-sm font-semibold">
                  {POINT_EVENT_LABELS[entry.event] ?? entry.event}
                </p>
                <p className="text-fg-subtle text-xs">
                  {new Date(`${entry.occurredOn}T12:00:00Z`).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'UTC',
                  })}
                  {entry.reason ? ` · ${entry.reason}` : ''}
                </p>
              </div>
              <span
                className={cn(
                  'stat-num shrink-0 text-sm',
                  entry.points >= 0 ? 'text-success-strong dark:text-success' : 'text-danger',
                )}
              >
                {entry.points > 0 ? '+' : ''}
                {entry.points}
              </span>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------- subviews */

function MeterRow({
  label,
  caption,
  value,
  tone,
}: {
  label: string;
  caption: string;
  value: number;
  tone: 'pulse' | 'iris';
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-fg text-sm font-semibold">{label}</span>
        <span className="stat-num text-fg text-lg">{value}%</span>
      </div>
      <ProgressBar value={value} tone={tone} className="mt-2.5" label={label} />
      <p className="text-fg-muted mt-1.5 text-sm">{caption}</p>
    </div>
  );
}

function AchievementTile({
  achievement,
  index,
}: {
  achievement: ProgressData['achievements'][number];
  index: number;
}) {
  const unlocked = Boolean(achievement.earnedOn);
  const tierTone =
    achievement.tier === 'gold' ? 'flame' : achievement.tier === 'silver' ? 'iris' : 'pulse';

  return (
    <div
      className={cn(
        'animate-rise rounded-panel relative h-full overflow-hidden border p-3.5 text-center transition-transform duration-200',
        unlocked
          ? 'border-border bg-bg-elevated shadow-xs hover:-translate-y-0.5'
          : 'border-border bg-bg-sunken/60 border-dashed',
      )}
      style={{ animationDelay: `${Math.min(index * 35, 350)}ms` }}
    >
      {unlocked && achievement.tier === 'gold' && (
        <span
          className="bg-flame-400/25 pointer-events-none absolute -top-8 -right-8 size-20 rounded-full blur-2xl"
          aria-hidden
        />
      )}

      <span
        className={cn('relative block text-2xl', !unlocked && 'opacity-35 grayscale')}
        aria-hidden
      >
        {unlocked ? achievement.emoji : <Lock className="text-fg-subtle mx-auto size-6" />}
      </span>

      <p
        className={cn(
          'relative mt-2 text-xs leading-tight font-bold',
          unlocked ? 'text-fg' : 'text-fg-subtle',
        )}
      >
        {achievement.name}
      </p>
      <p className="text-2xs text-fg-subtle relative mt-1 leading-snug">
        {achievement.description}
      </p>

      {unlocked && (
        <Badge tone={tierTone} size="sm" className="relative mt-2.5">
          {achievement.tier}
        </Badge>
      )}
    </div>
  );
}

function BaselineRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-fg-muted text-xs">{label}</dt>
      <dd className="stat-num text-fg text-sm">{value}</dd>
    </div>
  );
}
