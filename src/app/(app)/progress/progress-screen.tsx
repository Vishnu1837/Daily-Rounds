'use client';

import { useState } from 'react';

import { ActivityHeatmap } from '@/components/charts/heatmap';
import { WeekBars } from '@/components/charts/week-bars';
import { StreakFlame } from '@/components/gamification/streak-flame';
import { Badge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Card, CardHeader, SectionTitle } from '@/components/ui/card';
import { AnimatedCounter } from '@/components/ui/counter';
import { ProgressBar, ProgressRing } from '@/components/ui/progress';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
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

  return (
    <div className="space-y-4">
      <header className="px-1 pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">Your progress</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Everything here is measured over active study days only.
        </p>
      </header>

      {/* --------------------------------------------------- headline card */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-5 bg-linear-to-br from-pulse-500/12 to-transparent p-5">
          <ProgressRing
            value={data.overall.consistencyPct}
            size={92}
            stroke={9}
            label="Overall consistency"
          >
            <div className="text-center">
              <span className="block text-xl leading-none font-extrabold text-fg">
                <AnimatedCounter value={data.overall.consistencyPct} suffix="%" />
              </span>
            </div>
          </ProgressRing>
          <div className="min-w-0">
            <h2 className="text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">
              Overall consistency
            </h2>
            <p className="mt-1.5 text-sm text-fg-muted">
              You showed up on{' '}
              <strong className="text-fg">
                {data.overall.completedDays} of {data.overall.activeDays}
              </strong>{' '}
              study days.
            </p>
            {data.improvement.deltaPct !== 0 && (
              <p
                className={cn(
                  'mt-2 inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-bold',
                  data.improvement.deltaPct > 0
                    ? 'bg-success/12 text-success'
                    : 'bg-danger/12 text-danger',
                )}
              >
                {data.improvement.deltaPct > 0 ? '↑' : '↓'}{' '}
                {Math.abs(data.improvement.deltaPct)} percentage points since week 1
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* -------------------------------------------------------- stat grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Current streak"
          value={String(data.streak)}
          sub={`Best: ${data.bestStreak}`}
          icon={<StreakFlame streak={data.streak} size="md" />}
        />
        <StatCard
          label="Show-up rate"
          value={`${data.overall.showUpRatePct}%`}
          sub={`${data.overall.completedDays} / ${data.overall.activeDays} days`}
        />
        <StatCard
          label="Study time"
          value={formatHours(data.studyMinutes)}
          sub="self-reported"
        />
        <StatCard
          label="Total points"
          value={data.points.toLocaleString()}
          sub="see the ledger"
          onClick={() => setLedgerOpen(true)}
        />
      </div>

      {/* --------------------------------------------------------- heatmap */}
      <Card>
        <CardHeader title="Consistency" description="Every study day since the cohort began." />
        <div className="p-5 pt-4">
          <ActivityHeatmap days={data.heatmap} />
        </div>
      </Card>

      {/* ------------------------------------------------------ weekly bars */}
      <Card>
        <CardHeader title="Week by week" />
        <div className="p-5 pt-4">
          <WeekBars weeks={data.weeks} />
        </div>
      </Card>

      {/* ----------------------------------------------------------- subject */}
      <Card>
        <CardHeader title="Subject progress" />
        <div className="space-y-4 p-5 pt-4">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-fg">{data.subjectName ?? 'Roadmap'}</span>
              <span className="text-sm font-extrabold text-fg tabular-nums">
                {data.topicsTotal === 0
                  ? '0%'
                  : `${Math.round((data.topicsCompleted / data.topicsTotal) * 100)}%`}
              </span>
            </div>
            <ProgressBar
              value={data.topicsTotal === 0 ? 0 : (data.topicsCompleted / data.topicsTotal) * 100}
              tone="iris"
              className="mt-2"
              label="Subject progress"
            />
            <p className="mt-1.5 text-sm text-fg-muted">
              {data.topicsCompleted} of {data.topicsTotal} topics complete
            </p>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-fg">Study room attendance</span>
              <span className="text-sm font-extrabold text-fg tabular-nums">
                {data.sessionsAttended} / {data.sessionsPossible}
              </span>
            </div>
            <ProgressBar
              value={
                data.sessionsPossible === 0
                  ? 0
                  : (data.sessionsAttended / data.sessionsPossible) * 100
              }
              className="mt-2"
              label="Attendance"
            />
          </div>
        </div>
      </Card>

      {/* ---------------------------------------------------- achievements */}
      <Card>
        <CardHeader
          title="Achievements"
          description={`${earned.length} of ${data.achievements.length} unlocked`}
        />
        <div className="grid grid-cols-2 gap-3 p-5 pt-4 sm:grid-cols-3">
          {[...earned, ...locked].map((a) => (
            <div
              key={a.code}
              className={cn(
                'rounded-2xl border p-3.5 text-center transition-opacity',
                a.earnedOn
                  ? 'border-border bg-bg-elevated'
                  : 'border-dashed border-border bg-bg-sunken/50 opacity-55',
              )}
            >
              <span className={cn('block text-2xl', !a.earnedOn && 'grayscale')} aria-hidden>
                {a.emoji}
              </span>
              <p className="mt-1.5 text-xs leading-tight font-bold text-fg">{a.name}</p>
              <p className="mt-1 text-2xs leading-snug text-fg-subtle">{a.description}</p>
              {a.earnedOn && (
                <Badge tone={a.tier === 'gold' ? 'flame' : a.tier === 'silver' ? 'iris' : 'pulse'} className="mt-2">
                  {a.tier}
                </Badge>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* -------------------------------------------------- baseline compare */}
      {data.baseline && (
        <Card>
          <CardHeader
            title="Before and now"
            description="Recorded when you joined, so the change is measurable."
          />
          <div className="grid grid-cols-2 gap-4 p-5 pt-4">
            <div className="rounded-2xl bg-bg-sunken p-4">
              <p className="text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">Before</p>
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
            <div className="rounded-2xl bg-pulse-500/10 p-4">
              <p className="text-2xs font-bold tracking-[0.14em] text-pulse-700 uppercase dark:text-pulse-300">
                Now
              </p>
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
            <div className="px-5 pb-5">
              <LinkButton href="/report" size="lg" fullWidth>
                See your end-of-cohort report
              </LinkButton>
            </div>
          )}
        </Card>
      )}

      {/* -------------------------------------------------------- ledger */}
      <SectionTitle
        action={
          <button
            type="button"
            onClick={() => setLedgerOpen(true)}
            className="text-sm font-semibold text-pulse-700 dark:text-pulse-400"
          >
            View all
          </button>
        }
      >
        Where your points came from
      </SectionTitle>
      <Card className="p-5">
        <ul className="space-y-2.5">
          {data.pointsByEvent.slice(0, 6).map((row) => {
            const max = data.pointsByEvent[0]?.points || 1;
            return (
              <li key={row.event}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-fg">
                    {POINT_EVENT_LABELS[row.event]}
                  </span>
                  <span className="text-sm font-bold text-fg tabular-nums">{row.points}</span>
                </div>
                <ProgressBar
                  value={(row.points / max) * 100}
                  height="sm"
                  className="mt-1"
                  label={POINT_EVENT_LABELS[row.event]}
                />
              </li>
            );
          })}
        </ul>
      </Card>

      <Sheet
        open={ledgerOpen}
        onClose={() => setLedgerOpen(false)}
        title="Points ledger"
        description="Every point you have earned, and exactly what it was for. Nothing here is ever removed."
      >
        <ul className="divide-y divide-border">
          {log.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">
                  {POINT_EVENT_LABELS[entry.event] ?? entry.event}
                </p>
                <p className="text-xs text-fg-subtle">
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
                  'shrink-0 text-sm font-extrabold tabular-nums',
                  entry.points >= 0 ? 'text-success' : 'text-danger',
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

function StatCard({
  label,
  value,
  sub,
  icon,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <Card interactive={Boolean(onClick)} className="h-full p-4">
      <p className="text-2xs leading-tight font-bold tracking-[0.1em] text-fg-subtle uppercase">
        {label}
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-xl font-extrabold text-fg">
        {icon}
        {value}
      </p>
      {sub && <p className="text-xs text-fg-subtle">{sub}</p>}
    </Card>
  );

  if (!onClick) return body;
  return (
    <button type="button" onClick={onClick} className="tap text-left">
      {body}
    </button>
  );
}

function BaselineRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="text-sm font-extrabold text-fg tabular-nums">{value}</dd>
    </div>
  );
}
