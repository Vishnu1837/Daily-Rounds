import { ActivityHeatmap } from '@/components/charts/heatmap';
import { WeekBars } from '@/components/charts/week-bars';
import { StreakFlame } from '@/components/gamification/streak-flame';
import { Badge } from '@/components/ui/badge';
import { Card, CardAurora, CardHeader } from '@/components/ui/card';
import { ProgressRing } from '@/components/ui/progress';
import type { DayBand } from '@/db/schema';
import { cn } from '@/lib/cn';
import { OBSTACLE_LABELS } from '@/lib/validation';

export type ReportData = {
  name: string;
  cohortName: string;
  cohortStart: string;
  cohortEnd: string;
  overall: {
    consistencyPct: number;
    showUpRatePct: number;
    completedDays: number;
    activeDays: number;
    studyMinutes: number;
  };
  bestStreak: number;
  sessionsAttended: number;
  sessionsPossible: number;
  topicsCompleted: number;
  topicsTotal: number;
  subjectName: string | null;
  weeks: {
    weekNumber: number;
    consistencyPct: number;
    completedDays: number;
    activeDays: number;
  }[];
  improvement: { firstPct: number; latestPct: number; deltaPct: number };
  heatmap: { date: string; band: DayBand; isActiveDay: boolean; points: number }[];
  baseline: {
    daysStudiedLastWeek: number;
    consistencyRating: number;
    confidence: number;
    obstacle: string;
  } | null;
  finalConfidence: number | null;
};

/**
 * The end-of-cohort report. Its single job is to answer, with evidence, whether Daily
 * Rounds changed this student's behaviour.
 */
export function CohortReport({ data }: { data: ReportData }) {
  const hours = Math.floor(data.overall.studyMinutes / 60);
  const mins = data.overall.studyMinutes % 60;
  const subjectPct =
    data.topicsTotal === 0 ? 0 : Math.round((data.topicsCompleted / data.topicsTotal) * 100);

  return (
    <div className="space-y-4">
      <Card
        variant="solid"
        tone="pulse"
        padding="lg"
        glow
        className="overflow-hidden text-center text-white"
      >
        <CardAurora tone="pulse" />
        <div className="relative py-3">
          <p className="text-2xs font-bold tracking-[0.2em] text-white/60 uppercase">
            Daily Rounds — {data.cohortName}
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{data.name}</h1>
          <p className="mt-1.5 text-sm text-white/65">
            {data.cohortStart} → {data.cohortEnd}
          </p>

          <div className="mt-7 flex justify-center">
            <ProgressRing
              value={data.overall.consistencyPct}
              size={148}
              stroke={12}
              tone="citrus"
              trackClassName="stroke-white/20"
              label="Overall consistency"
            >
              <div className="text-center">
                <span className="stat-num text-stat-sm block text-white">
                  {data.overall.consistencyPct}%
                </span>
                <span className="text-2xs font-bold tracking-wide text-white/60 uppercase">
                  consistency
                </span>
              </div>
            </ProgressRing>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat
          label="Showed up"
          value={`${data.overall.completedDays}/${data.overall.activeDays}`}
          sub="active study days"
        />
        <Stat
          label="Longest streak"
          value={`${data.bestStreak}`}
          sub="study days"
          icon={<StreakFlame streak={data.bestStreak} size="sm" animated={false} />}
        />
        <Stat
          label="Sessions attended"
          value={`${data.sessionsAttended}/${data.sessionsPossible}`}
        />
        <Stat label="Topics completed" value={`${data.topicsCompleted}/${data.topicsTotal}`} />
        <Stat label="Study time" value={mins ? `${hours}h ${mins}m` : `${hours}h`} />
        <Stat label={data.subjectName ?? 'Subject'} value={`${subjectPct}%`} sub="of roadmap" />
      </div>

      <Card>
        <CardHeader title="Consistency, day by day" />
        <div className="p-5 pt-4">
          <ActivityHeatmap days={data.heatmap} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Week by week"
          description={
            data.improvement.deltaPct !== 0
              ? `${data.improvement.deltaPct > 0 ? '↑' : '↓'} ${Math.abs(data.improvement.deltaPct)} percentage points from week one`
              : undefined
          }
        />
        <div className="p-5 pt-4">
          <WeekBars weeks={data.weeks} />
        </div>
      </Card>

      {data.baseline && (
        <Card>
          <CardHeader
            title="Before and after"
            description="Recorded at onboarding, before any of this happened."
          />
          <div className="grid gap-4 p-5 pt-4 sm:grid-cols-2">
            <div className="bg-bg-sunken rounded-2xl p-5">
              <p className="eyebrow">Before</p>
              <dl className="mt-4 space-y-3">
                <Compare
                  label="Studied properly"
                  value={`${data.baseline.daysStudiedLastWeek}/7 days`}
                />
                <Compare
                  label="Self-rated consistency"
                  value={`${data.baseline.consistencyRating}/10`}
                />
                <Compare label="Subject confidence" value={`${data.baseline.confidence}/5`} />
                <div>
                  <dt className="text-fg-muted text-xs">Biggest obstacle</dt>
                  <dd className="mt-0.5">
                    <Badge tone="warning">
                      {OBSTACLE_LABELS[data.baseline.obstacle] ?? data.baseline.obstacle}
                    </Badge>
                  </dd>
                </div>
              </dl>
            </div>

            <div className="bg-pulse-500/10 rounded-2xl p-5">
              <p className="text-2xs text-pulse-700 dark:text-pulse-300 font-bold tracking-[0.14em] uppercase">
                After
              </p>
              <dl className="mt-4 space-y-3">
                <Compare
                  label="Showed up"
                  value={`${data.overall.completedDays}/${data.overall.activeDays} days`}
                  highlight
                />
                <Compare
                  label="Measured consistency"
                  value={`${data.overall.consistencyPct}%`}
                  highlight
                />
                <Compare
                  label="Subject confidence"
                  value={
                    data.finalConfidence
                      ? `${data.finalConfidence}/5`
                      : `${subjectPct}% of roadmap done`
                  }
                  highlight
                />
                <Compare label="Longest streak" value={`${data.bestStreak} days`} highlight />
              </dl>
            </div>
          </div>

          <div className="px-5 pb-5">
            <p className="bg-bg-sunken text-fg-muted rounded-2xl p-4 text-sm leading-relaxed">
              {verdict(data)}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

function verdict(data: ReportData): string {
  const { overall, baseline, bestStreak } = data;
  if (!baseline) {
    return `Across the cohort you showed up on ${overall.completedDays} of ${overall.activeDays} active study days.`;
  }

  const beforeRate = Math.round((baseline.daysStudiedLastWeek / 5) * 100);
  const delta = overall.showUpRatePct - beforeRate;

  if (delta >= 20) {
    return `You started this cohort studying about ${baseline.daysStudiedLastWeek} days a week and finished showing up on ${overall.showUpRatePct}% of active study days, with a best run of ${bestStreak} in a row. That is a real change in behaviour, not a change in intention.`;
  }
  if (delta > 0) {
    return `You showed up more often than when you started — ${overall.showUpRatePct}% of active study days against roughly ${beforeRate}% before, with a best run of ${bestStreak} days. Modest, and real.`;
  }
  return `You showed up on ${overall.completedDays} of ${overall.activeDays} active study days, with a best run of ${bestStreak}. The habit did not fully take this time — the useful question is which specific day of the week kept breaking, and what would make that one day easier.`;
}

function Stat({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <p className="eyebrow">{label}</p>
      <p className="text-fg mt-1.5 flex items-center gap-1.5 text-xl font-extrabold">
        {icon}
        {value}
      </p>
      {sub && <p className="text-fg-subtle text-xs">{sub}</p>}
    </Card>
  );
}

function Compare({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-fg-muted text-xs">{label}</dt>
      <dd
        className={cn(
          'text-sm font-extrabold tabular-nums',
          highlight ? 'text-pulse-700 dark:text-pulse-300' : 'text-fg',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
