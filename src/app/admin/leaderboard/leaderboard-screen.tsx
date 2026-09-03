'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Flame, Sparkles, Star, TrendingUp, Trophy } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Card, SectionTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { Select } from '@/components/ui/form';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/cn';
import type { AdminLeaderboardRecognitions, AdminLeaderboardRow } from '@/server/queries/admin';

type SortKey = 'rank' | 'streak' | 'points' | 'improvement' | 'showUp' | 'name';

const RECOGNITIONS: {
  key: keyof AdminLeaderboardRecognitions;
  label: string;
  icon: typeof Star;
}[] = [
  { key: 'mostConsistent', label: 'Most consistent', icon: Star },
  { key: 'longestStreak', label: 'Longest streak', icon: Flame },
  { key: 'mostImproved', label: 'Most improved', icon: TrendingUp },
  { key: 'bestComeback', label: 'Best comeback', icon: Sparkles },
  { key: 'perfectWeek', label: 'Perfect week', icon: Trophy },
];

/**
 * The cohort ranking with its workings shown.
 *
 * The student leaderboard is deliberately gentle: a podium, a position, and the number that
 * earned it. This is the same ranking with every input column visible at once, because the
 * question an admin brings to it is never "who is first" — it is "why is this student
 * where they are, and which of them do I call tonight".
 *
 * Rank is the server's consistency ordering and never changes. Re-sorting the table is a
 * view of the same ranking, not a re-ranking, which is why the rank column keeps its
 * original number when you sort by streak.
 */
export function AdminLeaderboardScreen({
  cohortName,
  rows,
  recognitions,
}: {
  cohortName: string;
  rows: AdminLeaderboardRow[];
  recognitions: AdminLeaderboardRecognitions;
}) {
  const [sort, setSort] = useState<SortKey>('rank');

  const sorted = useMemo(() => {
    const copy = [...rows];
    switch (sort) {
      case 'streak':
        return copy.sort((a, b) => b.streak - a.streak || a.rank - b.rank);
      case 'points':
        return copy.sort((a, b) => b.points - a.points || a.rank - b.rank);
      case 'improvement':
        return copy.sort((a, b) => b.improvementPct - a.improvementPct || a.rank - b.rank);
      case 'showUp':
        return copy.sort((a, b) => b.showUpRatePct - a.showUpRatePct || a.rank - b.rank);
      case 'name':
        return copy.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return copy.sort((a, b) => a.rank - b.rank);
    }
  }, [rows, sort]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={cohortName}
        title="Leaderboard"
        description={`The ranking your students see, with the numbers behind it. ${rows.length} active ${rows.length === 1 ? 'student' : 'students'}.`}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Trophy className="size-6" aria-hidden />}
            title="Nobody to rank yet"
            description="Once students start showing up, the cohort ranking appears here."
          />
        </Card>
      ) : (
        <>
          <div>
            <SectionTitle>Recognitions</SectionTitle>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {RECOGNITIONS.map(({ key, label, icon: Icon }) => {
                const winner = recognitions[key];
                return (
                  <Card key={key} className="flex items-center gap-3 p-4">
                    <span className="bg-bg-sunken text-fg-subtle grid size-9 shrink-0 place-items-center rounded-full">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="eyebrow">{label}</p>
                      {winner ? (
                        <Link
                          href={`/admin/students/${winner.memberId}`}
                          className="text-fg mt-0.5 block truncate text-sm font-bold hover:underline"
                        >
                          {winner.name}
                        </Link>
                      ) : (
                        <p className="text-fg-muted mt-0.5 text-sm">Not awarded yet</p>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort the leaderboard"
              className="w-auto"
            >
              <option value="rank">Rank (consistency)</option>
              <option value="streak">Streak</option>
              <option value="points">XP</option>
              <option value="improvement">Improvement</option>
              <option value="showUp">Show-up rate</option>
              <option value="name">Name</option>
            </Select>
            {sort !== 'rank' && (
              <p className="text-fg-subtle text-xs">
                Sorted for reading. Rank is always the consistency ordering.
              </p>
            )}
          </div>

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-left">
                <thead>
                  <tr className="border-border text-2xs text-fg-subtle border-b tracking-[0.1em] uppercase">
                    <th scope="col" className="px-5 py-3 font-bold">
                      #
                    </th>
                    <th scope="col" className="px-3 py-3 font-bold">
                      Student
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-bold">
                      Consistency
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-bold">
                      Show-up
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-bold">
                      Streak
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-bold">
                      Best
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-bold">
                      Perfect wks
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-bold">
                      Improvement
                    </th>
                    <th scope="col" className="px-5 py-3 text-right font-bold">
                      XP
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {sorted.map((row) => (
                    <tr key={row.memberId} className="hover:bg-bg-sunken transition-colors">
                      <td
                        className={cn(
                          'text-fg-muted px-5 py-3 text-sm font-bold tabular-nums',
                          row.rank <= 3 && 'text-citrus-700 dark:text-citrus-300',
                        )}
                      >
                        {row.rank}
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/admin/students/${row.memberId}`}
                          className="text-fg flex items-center gap-2.5 text-sm font-semibold hover:underline"
                        >
                          <Avatar name={row.name} src={row.avatarUrl} size="xs" />
                          {row.name}
                        </Link>
                      </td>
                      <td className="text-fg px-3 py-3 text-right text-sm font-bold tabular-nums">
                        {row.consistencyPct}%
                      </td>
                      <td className="text-fg-muted px-3 py-3 text-right text-sm tabular-nums">
                        {row.showUpRatePct}%
                      </td>
                      <td className="text-fg px-3 py-3 text-right text-sm font-bold tabular-nums">
                        {row.streak}
                      </td>
                      <td className="text-fg-muted px-3 py-3 text-right text-sm tabular-nums">
                        {row.bestStreak}
                      </td>
                      <td className="text-fg-muted px-3 py-3 text-right text-sm tabular-nums">
                        {row.perfectWeeks}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-3 text-right text-sm tabular-nums',
                          row.improvementPct > 0
                            ? 'text-success-strong dark:text-success'
                            : row.improvementPct < 0
                              ? 'text-danger-strong dark:text-danger'
                              : 'text-fg-muted',
                        )}
                      >
                        {row.improvementPct > 0 ? '+' : ''}
                        {row.improvementPct}%
                      </td>
                      <td className="text-fg-muted px-5 py-3 text-right text-sm tabular-nums">
                        {row.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
