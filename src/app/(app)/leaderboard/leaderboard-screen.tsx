'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

import { StreakFlame } from '@/components/gamification/streak-flame';
import { Avatar } from '@/components/ui/avatar';
import { Card, CardHeader, SectionTitle } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress';
import { cn } from '@/lib/cn';
import type { LeaderboardRow, Recognitions } from '@/server/queries/student';

const MEDALS = ['🥇', '🥈', '🥉'];

export function LeaderboardScreen({
  rows,
  recognitions,
  pulse,
  cohortName,
}: {
  rows: LeaderboardRow[];
  recognitions: Recognitions;
  pulse: { size: number; showedUpToday: number; cohortStreak: number; thresholdPct: number; weeklyConsistency: number };
  cohortName: string;
}) {
  const reduce = useReducedMotion();
  const me = rows.find((r) => r.isSelf);
  const myRank = me ? rows.indexOf(me) + 1 : null;

  return (
    <div className="space-y-4">
      <header className="px-1 pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">Leaderboard</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Ranked by consistency, not marks. Turning up beats being clever.
        </p>
      </header>

      {/* ------------------------------------------------------ your position */}
      {me && myRank && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-4 bg-linear-to-br from-pulse-500/14 to-transparent p-5">
            <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-bg-elevated text-xl font-extrabold text-fg shadow-soft">
              #{myRank}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">
                Your position
              </p>
              <p className="mt-1 text-lg font-extrabold text-fg">
                {me.consistencyPct}% consistency
              </p>
              <ProgressBar value={me.consistencyPct} className="mt-2" label="Your consistency" />
            </div>
          </div>
        </Card>
      )}

      {/* ------------------------------------------------------- recognitions */}
      <section className="space-y-2">
        <SectionTitle>Multiple ways to win</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <RecognitionCard
            emoji="🏆"
            title="Most Consistent"
            person={recognitions.mostConsistent}
            detail={(r) => `${r.consistencyPct}%`}
          />
          <RecognitionCard
            emoji="🔥"
            title="Longest Streak"
            person={recognitions.longestStreak}
            detail={(r) => `${r.bestStreak} days`}
          />
          <RecognitionCard
            emoji="📈"
            title="Most Improved"
            person={recognitions.mostImproved}
            detail={(r) => `+${r.improvementPct} pts`}
          />
          <RecognitionCard
            emoji="💪"
            title="Best Comeback"
            person={recognitions.bestComeback}
            detail={(r) => `back on ${r.streak}-day streak`}
          />
          <RecognitionCard
            emoji="⭐"
            title="Perfect Week"
            person={recognitions.perfectWeek}
            detail={(r) => `${r.perfectWeeks} perfect ${r.perfectWeeks === 1 ? 'week' : 'weeks'}`}
            className="col-span-2"
          />
        </div>
      </section>

      {/* --------------------------------------------------------- full table */}
      <Card className="overflow-hidden">
        <CardHeader
          title={`${cohortName} · ${rows.length} students`}
          description="Consistency first, points as the tiebreak."
        />
        <ul className="mt-2 divide-y divide-border">
          {rows.map((row, i) => (
            <motion.li
              key={row.memberId}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.025, 0.4), duration: 0.25 }}
              className={cn(
                'flex items-center gap-3 px-5 py-3',
                row.isSelf && 'bg-pulse-500/8 ring-1 ring-pulse-500/20 ring-inset',
              )}
            >
              <span
                className={cn(
                  'w-7 shrink-0 text-center text-sm font-extrabold tabular-nums',
                  i < 3 ? 'text-base' : 'text-fg-subtle',
                )}
              >
                {MEDALS[i] ?? i + 1}
              </span>

              <Avatar name={row.name} size="sm" />

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
                <p className="text-xs text-fg-subtle">
                  {row.mbbsYear ? `Year ${row.mbbsYear} · ` : ''}
                  {row.showUpRatePct}% show-up
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <span className="flex items-center gap-1 text-sm font-bold text-flame-600 tabular-nums dark:text-flame-300">
                  <StreakFlame streak={row.streak} size="sm" animated={false} />
                  {row.streak}
                </span>
                <span className="w-11 text-right text-sm font-extrabold text-fg tabular-nums">
                  {row.consistencyPct}%
                </span>
              </div>
            </motion.li>
          ))}
        </ul>
      </Card>

      {/* ------------------------------------------------------------ cohort */}
      <Card className="p-5">
        <h2 className="text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">
          Cohort streak
        </h2>
        <div className="mt-3 flex items-center gap-3">
          <StreakFlame streak={pulse.cohortStreak} size="lg" />
          <div>
            <p className="text-xl font-extrabold text-fg">{pulse.cohortStreak} study days</p>
            <p className="text-sm text-fg-muted">
              Kept alive whenever {pulse.thresholdPct}% of the cohort shows up.
            </p>
          </div>
        </div>
        <p className="mt-4 rounded-2xl bg-bg-sunken p-3.5 text-sm text-fg-muted">
          Today: <strong className="text-fg">{pulse.showedUpToday} of {pulse.size}</strong> have
          shown up. This one is not about you — it is about whether the group carries each other.
        </p>
      </Card>

      <p className="px-1 pb-1 text-center text-xs text-fg-subtle">
        <Link href="/how-points-work" className="underline">
          How ranking works
        </Link>
      </p>
    </div>
  );
}

function RecognitionCard({
  emoji,
  title,
  person,
  detail,
  className,
}: {
  emoji: string;
  title: string;
  person: LeaderboardRow | null;
  detail: (row: LeaderboardRow) => string;
  className?: string;
}) {
  return (
    <Card className={cn('p-4', className, person?.isSelf && 'ring-2 ring-pulse-500/30')}>
      <span className="text-xl" aria-hidden>
        {emoji}
      </span>
      <p className="mt-1.5 text-2xs font-bold tracking-[0.1em] text-fg-subtle uppercase">{title}</p>
      {person ? (
        <>
          <p className="mt-1 truncate text-sm font-extrabold text-fg">
            {person.isSelf ? 'You' : person.name}
          </p>
          <p className="text-xs text-fg-muted">{detail(person)}</p>
        </>
      ) : (
        <p className="mt-1 text-sm text-fg-subtle">Still up for grabs</p>
      )}
    </Card>
  );
}
