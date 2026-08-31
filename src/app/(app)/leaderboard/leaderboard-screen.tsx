'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Flame, Sparkles, Star, TrendingUp, Trophy } from 'lucide-react';

import { LeagueBadge } from '@/components/gamification/level';
import { StreakFlame } from '@/components/gamification/streak-flame';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardAurora, SectionTitle } from '@/components/ui/card';
import { AnimatedCounter } from '@/components/ui/counter';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressBar } from '@/components/ui/progress';
import { Reveal } from '@/components/ui/reveal';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/cn';
import { leagueFor, nextLeague } from '@/lib/domain/level';
import type { LeaderboardRow, Recognitions } from '@/server/queries/student';

type SortKey = 'consistency' | 'streak' | 'points';

export function LeaderboardScreen({
  rows,
  recognitions,
  pulse,
  cohortName,
}: {
  rows: LeaderboardRow[];
  recognitions: Recognitions;
  pulse: {
    size: number;
    showedUpToday: number;
    cohortStreak: number;
    thresholdPct: number;
    weeklyConsistency: number;
  };
  cohortName: string;
}) {
  const [sort, setSort] = useState<SortKey>('consistency');

  const me = rows.find((r) => r.isSelf);
  // The canonical rank is always the consistency ordering the server returned. Re-sorting
  // the table is a *view*, not a re-ranking, so a student can never be told they are third
  // because they happened to look at the streak column.
  const myRank = me ? rows.indexOf(me) + 1 : null;

  const sorted = [...rows].sort((a, b) => {
    if (sort === 'streak') return b.streak - a.streak || b.consistencyPct - a.consistencyPct;
    if (sort === 'points') return b.points - a.points || b.consistencyPct - a.consistencyPct;
    return 0; // already ranked by consistency
  });

  const podium = rows.slice(0, 3);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={cohortName}
        title="Leaderboard"
        description="Ranked by consistency, not marks. Turning up beats being clever."
        actions={me ? <LeagueBadge league={leagueFor(me.consistencyPct)} /> : undefined}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        {/* --------------------------------------------------- your position */}
        {me && myRank && (
          <Reveal className="lg:col-span-5">
            <YourPosition row={me} rank={myRank} total={rows.length} />
          </Reveal>
        )}

        {/* ---------------------------------------------------------- podium */}
        {podium.length === 3 && (
          <Reveal delay={1} className={me && myRank ? 'lg:col-span-7' : 'lg:col-span-12'}>
            <Podium rows={podium} />
          </Reveal>
        )}
      </div>

      {/* ----------------------------------------------------- recognitions */}
      <section className="space-y-3">
        <SectionTitle>Five ways to be recognised</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <RecognitionCard
            icon={<Trophy className="size-4" aria-hidden />}
            tone="pulse"
            title="Most Consistent"
            person={recognitions.mostConsistent}
            detail={(r) => `${r.consistencyPct}% consistency`}
          />
          <RecognitionCard
            icon={<Flame className="size-4" aria-hidden />}
            tone="flame"
            title="Longest Streak"
            person={recognitions.longestStreak}
            detail={(r) => `${r.bestStreak} days`}
          />
          <RecognitionCard
            icon={<TrendingUp className="size-4" aria-hidden />}
            tone="success"
            title="Most Improved"
            person={recognitions.mostImproved}
            detail={(r) => `+${r.improvementPct} points`}
          />
          <RecognitionCard
            icon={<Sparkles className="size-4" aria-hidden />}
            tone="iris"
            title="Best Comeback"
            person={recognitions.bestComeback}
            detail={(r) => `back on a ${r.streak}-day run`}
          />
          <RecognitionCard
            icon={<Star className="size-4" aria-hidden />}
            tone="citrus"
            title="Perfect Week"
            person={recognitions.perfectWeek}
            detail={(r) => `${r.perfectWeeks} perfect ${r.perfectWeeks === 1 ? 'week' : 'weeks'}`}
            className="col-span-2 lg:col-span-1"
          />
        </div>
      </section>

      {/* -------------------------------------------------------- standings */}
      <Card padding="none" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4">
          <div>
            <h2 className="text-fg text-base font-bold">Full standings</h2>
            <p className="text-fg-muted mt-0.5 text-sm">
              {rows.length} students · consistency first, points as the tiebreak
            </p>
          </div>
          <Segmented
            ariaLabel="Sort standings"
            size="sm"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'consistency', label: 'Consistency' },
              { value: 'streak', label: 'Streak' },
              { value: 'points', label: 'XP' },
            ]}
          />
        </div>

        <ul className="divide-border border-border divide-y border-t">
          {sorted.map((row, i) => (
            <StandingRow
              key={row.memberId}
              row={row}
              index={i}
              rank={rows.indexOf(row) + 1}
              sort={sort}
            />
          ))}
        </ul>
      </Card>

      {/* ----------------------------------------------------- cohort streak */}
      <Card variant="wash" tone="flame" padding="lg" className="overflow-hidden">
        <CardAurora tone="flame" />
        <div className="relative flex flex-wrap items-center gap-5">
          <StreakFlame streak={pulse.cohortStreak} size="xl" />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Cohort streak</p>
            <p className="stat-num text-stat-sm text-flame-700 dark:text-flame-300 mt-1.5">
              {pulse.cohortStreak}
              <span className="text-fg-muted ml-2 text-base font-bold">study days</span>
            </p>
            <p className="text-fg-muted mt-1.5 text-sm">
              Kept alive on any day at least {pulse.thresholdPct}% of the cohort shows up. Today:{' '}
              <strong className="text-fg">
                {pulse.showedUpToday} of {pulse.size}
              </strong>
              . This one is not about you — it is about whether the group carries each other.
            </p>
          </div>
        </div>
      </Card>

      <p className="text-fg-subtle px-1 pb-1 text-center text-xs">
        <Link href="/how-points-work" className="hover:text-fg-muted underline underline-offset-2">
          How ranking works
        </Link>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- subviews */

function YourPosition({ row, rank, total }: { row: LeaderboardRow; rank: number; total: number }) {
  const next = nextLeague(row.consistencyPct);

  return (
    <Card
      variant="solid"
      tone="pulse"
      padding="lg"
      glow
      className="h-full overflow-hidden text-white"
    >
      <CardAurora tone="pulse" />
      <div className="relative">
        <p className="text-2xs font-bold tracking-[0.16em] text-white/65 uppercase">
          Your position
        </p>

        <div className="mt-3 flex items-end gap-4">
          <p className="stat-num text-stat-lg">
            <span className="align-top text-3xl opacity-60">#</span>
            <AnimatedCounter value={rank} />
          </p>
          <p className="pb-2 text-sm font-semibold text-white/70">of {total} students</p>
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex items-baseline justify-between text-sm font-semibold">
            <span className="text-white/75">Consistency</span>
            <span className="stat-num text-lg">{row.consistencyPct}%</span>
          </div>
          <div className="rounded-pill h-2.5 w-full overflow-hidden bg-white/20">
            <div
              className="rounded-pill from-citrus-300 ease-out-soft h-full bg-linear-to-r to-white transition-[width] duration-700"
              style={{ width: `${Math.max(2, row.consistencyPct)}%` }}
            />
          </div>
        </div>

        <p className="mt-4 text-sm text-white/75">
          {next
            ? `${next.gap} more points of consistency reaches ${next.league.label}.`
            : 'Top league. Hold it.'}
        </p>

        <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-white/15 pt-4">
          <div>
            <dt className="text-2xs font-bold tracking-[0.12em] text-white/55 uppercase">Streak</dt>
            <dd className="stat-num mt-1 text-lg">{row.streak}</dd>
          </div>
          <div>
            <dt className="text-2xs font-bold tracking-[0.12em] text-white/55 uppercase">
              Show-up
            </dt>
            <dd className="stat-num mt-1 text-lg">{row.showUpRatePct}%</dd>
          </div>
          <div>
            <dt className="text-2xs font-bold tracking-[0.12em] text-white/55 uppercase">XP</dt>
            <dd className="stat-num mt-1 text-lg">{row.points.toLocaleString()}</dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}

/**
 * The top three, drawn as an actual podium.
 *
 * Ordered second–first–third rather than 1–2–3 so the shape itself carries the ranking,
 * which is faster to read than three identical cards with numbers on them.
 */
function Podium({ rows }: { rows: LeaderboardRow[] }) {
  const reduce = useReducedMotion();
  const [second, first, third] = [rows[1], rows[0], rows[2]];
  const order = [
    { row: second, place: 2, height: 'h-20', tone: 'from-ink-300 to-ink-400' },
    { row: first, place: 1, height: 'h-28', tone: 'from-citrus-300 to-flame-400' },
    { row: third, place: 3, height: 'h-14', tone: 'from-flame-300 to-flame-500' },
  ];

  return (
    <Card padding="lg" className="h-full overflow-hidden">
      <p className="eyebrow">Top of the cohort</p>
      <div className="mt-6 grid grid-cols-3 items-end gap-3">
        {order.map(({ row, place, height, tone }) => {
          if (!row) return <div key={place} />;
          return (
            <div key={place} className="flex flex-col items-center text-center">
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: place === 1 ? 0.05 : 0.15, duration: 0.35 }}
                className="flex flex-col items-center"
              >
                <Avatar name={row.name} size={place === 1 ? 'lg' : 'md'} ring glow={place === 1} />
                <p className="text-fg mt-2 line-clamp-1 max-w-full text-xs font-bold">
                  {row.isSelf ? 'You' : row.name.split(' ')[0]}
                </p>
                <p className="stat-num text-fg-muted text-sm">{row.consistencyPct}%</p>
              </motion.div>

              <div
                className={cn(
                  'rounded-t-panel mt-3 grid w-full place-items-center bg-linear-to-b',
                  tone,
                  height,
                )}
              >
                <span className="stat-num text-2xl text-white drop-shadow-sm">{place}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function StandingRow({
  row,
  index,
  rank,
  sort,
}: {
  row: LeaderboardRow;
  index: number;
  rank: number;
  sort: SortKey;
}) {
  const reduce = useReducedMotion();
  const headline =
    sort === 'streak'
      ? `${row.streak}`
      : sort === 'points'
        ? row.points.toLocaleString()
        : `${row.consistencyPct}%`;

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.35), duration: 0.25 }}
      className={cn(
        'hover:bg-bg-sunken flex items-center gap-3 px-5 py-3 transition-colors',
        row.isSelf && 'bg-pulse-500/8 hover:bg-pulse-500/12',
      )}
    >
      <span
        className={cn(
          'stat-num grid size-7 shrink-0 place-items-center rounded-lg text-xs',
          rank === 1 && 'bg-citrus-400 text-ink-950',
          rank === 2 && 'bg-ink-200 text-ink-900',
          rank === 3 && 'bg-flame-400 text-white',
          rank > 3 && 'text-fg-subtle',
        )}
      >
        {rank}
      </span>

      <Avatar name={row.name} size="sm" ring={row.isSelf} />

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-sm font-bold',
            row.isSelf ? 'text-pulse-700 dark:text-pulse-300' : 'text-fg',
          )}
        >
          {row.name}
          {row.isSelf && <span className="ml-1.5 text-xs font-semibold">(you)</span>}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <ProgressBar
            value={row.consistencyPct}
            height="xs"
            tone={row.isSelf ? 'pulse' : 'neutral'}
            className="max-w-24"
            label={`${row.name} consistency`}
          />
          <span className="text-2xs text-fg-subtle truncate">
            {row.mbbsYear ? `Year ${row.mbbsYear} · ` : ''}
            {row.showUpRatePct}% show-up
          </span>
        </div>
      </div>

      <span className="text-flame-700 dark:text-flame-300 flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums">
        <StreakFlame streak={row.streak} size="sm" animated={false} />
        {row.streak}
      </span>

      <span className="stat-num text-fg w-14 shrink-0 text-right text-base">{headline}</span>
    </motion.li>
  );
}

function RecognitionCard({
  icon,
  tone,
  title,
  person,
  detail,
  className,
}: {
  icon: React.ReactNode;
  tone: 'pulse' | 'flame' | 'iris' | 'citrus' | 'success';
  title: string;
  person: LeaderboardRow | null;
  detail: (row: LeaderboardRow) => string;
  className?: string;
}) {
  const chip = {
    pulse: 'bg-pulse-500/14 text-pulse-600 dark:text-pulse-300',
    flame: 'bg-flame-500/16 text-flame-600 dark:text-flame-300',
    iris: 'bg-iris-500/14 text-iris-600 dark:text-iris-300',
    citrus: 'bg-citrus-500/20 text-citrus-700 dark:text-citrus-300',
    success: 'bg-success/14 text-success-strong dark:text-success',
  }[tone];

  return (
    <Card
      variant={person?.isSelf ? 'wash' : 'surface'}
      tone={tone}
      padding="md"
      className={cn('flex h-full flex-col', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn('grid size-8 place-items-center rounded-xl', chip)} aria-hidden>
          {icon}
        </span>
        {person?.isSelf && (
          <Badge tone={tone} size="sm" solid>
            You
          </Badge>
        )}
      </div>
      <p className="eyebrow mt-3">{title}</p>
      {person ? (
        <>
          <p className="text-fg mt-1 truncate text-sm font-extrabold">
            {person.isSelf ? 'You' : person.name}
          </p>
          <p className="text-fg-muted mt-auto pt-1 text-xs">{detail(person)}</p>
        </>
      ) : (
        <p className="text-fg-subtle mt-1 text-sm">Still up for grabs</p>
      )}
    </Card>
  );
}
