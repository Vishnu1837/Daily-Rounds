import Link from 'next/link';
import { Flame, Sprout, TreeDeciduous, Users } from 'lucide-react';

import { EmptyPlot, Tree } from '@/components/grove/tree';
import { Avatar } from '@/components/ui/avatar';
import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat';
import { cn } from '@/lib/cn';
import type { ISODate } from '@/lib/domain/calendar';
import { SPECIES_NAMES, WITHER_REASONS, formatFocusMinutes } from '@/lib/domain/grove';
import type { GroveData } from '@/server/queries/grove';

function dayLabel(date: ISODate): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function weekdayLetter(date: ISODate): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { weekday: 'narrow', timeZone: 'UTC' });
}

/**
 * The grove.
 *
 * Read top to bottom this screen answers three questions in order: what you have grown, what
 * you are growing today, and who else is out there. The withered log sits at the bottom
 * rather than being hidden behind a toggle — visible, but not the first thing you meet.
 */
export function GroveScreen({ data, today }: { data: GroveData; today: ISODate }) {
  const { stats, days, cohort } = data;
  const todayGrown = data.today.filter((t) => t.status === 'grown');
  const todayWithered = data.today.filter((t) => t.status === 'withered');
  const withered = data.recent.filter((t) => t.status === 'withered').slice(0, 8);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="The grove"
        title="What your focus actually grew"
        description="One Pomodoro round, sat all the way through, is one tree. Walk out on a round and the stump stays."
        actions={
          <>
            <LinkButton href="/grove/cohort" size="sm" variant="outline">
              <Users className="size-4" aria-hidden />
              Student groves
            </LinkButton>
            <LinkButton href="/study" size="sm">
              <Sprout className="size-4" aria-hidden />
              Plant a tree
            </LinkButton>
          </>
        }
      />

      {/* ------------------------------------------------------------ stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Trees grown"
          value={stats.grown}
          sub="last 14 days"
          tone="success"
          emphasis
          icon={<TreeDeciduous className="size-4" aria-hidden />}
        />
        <StatTile
          label="Focus time"
          value={formatFocusMinutes(stats.focusMinutes)}
          sub="from grown trees only"
          tone="pulse"
          emphasis
        />
        <StatTile
          label="Rounds survived"
          value={`${stats.survivalPct}%`}
          sub={
            stats.withered === 0
              ? 'nothing withered yet'
              : `${stats.withered} withered, ${stats.grown} grown`
          }
          tone={
            stats.survivalPct >= 80 ? 'success' : stats.survivalPct >= 50 ? 'warning' : 'danger'
          }
        />
        <StatTile
          label="Planting streak"
          value={data.streak}
          sub={data.streak === 1 ? 'day' : 'days in a row'}
          tone="flame"
          icon={<Flame className="size-4" aria-hidden />}
        />
      </div>

      {/* ------------------------------------------------------ today's plot */}
      <Card padding="lg">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Today</p>
            <p className="text-fg mt-1 text-lg font-extrabold">
              {todayGrown.length === 0
                ? 'Bare soil'
                : `${todayGrown.length} ${todayGrown.length === 1 ? 'tree' : 'trees'}`}
            </p>
          </div>
          {stats.bestDay && (
            <p className="text-fg-subtle text-xs">
              Your best day: {stats.bestDay.trees} on {dayLabel(stats.bestDay.date)}
            </p>
          )}
        </div>

        <div className="rounded-panel bg-bg-sunken text-fg mt-4 flex min-h-28 flex-wrap items-end gap-1 p-4">
          {data.today.length === 0 ? (
            <div className="flex w-full flex-col items-center gap-2 py-2">
              <EmptyPlot size={56} />
              <p className="text-fg-subtle text-sm">
                Nothing planted yet today. A twenty-five minute round is enough to start.
              </p>
            </div>
          ) : (
            data.today.map((tree) => (
              <Tree
                key={tree.id}
                species={tree.species}
                status={tree.status}
                size={48}
                title={`${SPECIES_NAMES[tree.species]}, ${tree.status === 'grown' ? 'grown' : 'withered'}, ${tree.focusMinutes} minutes`}
              />
            ))
          )}
        </div>

        {todayWithered.length > 0 && (
          <p className="text-fg-muted mt-3 text-sm">
            {todayWithered.length === 1 ? 'One round' : `${todayWithered.length} rounds`} withered
            today. That is information, not a verdict — the next one is a fresh plot.
          </p>
        )}
      </Card>

      {/* -------------------------------------------------------- the wall */}
      <Card padding="lg">
        <p className="eyebrow">The last two weeks</p>
        <p className="text-fg-muted mt-1 text-sm">
          One column a day. Grown trees stack up; stumps stay where they fell.
        </p>

        <div className="-mx-1 mt-5 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max items-end gap-1.5">
            {days.map((day) => {
              const total = day.grown + day.withered;
              return (
                <div key={day.date} className="flex w-5 flex-col items-center gap-1">
                  {/*
                    A fortnight has to fit without scrolling, so the columns are narrow and
                    stack at most four trees. A day that beat that is carried by the count in
                    its tooltip rather than by a taller column — the wall is about "did you
                    plant?", not about ranking your best days against each other.
                  */}
                  <div className="flex h-20 w-full flex-col-reverse items-center justify-start">
                    {Array.from({ length: Math.min(day.grown, 4) }).map((_, i) => (
                      <Tree key={`g${i}`} species="neem" size={16} className="text-fg" />
                    ))}
                    {Array.from({ length: Math.min(day.withered, 2) }).map((_, i) => (
                      <Tree key={`w${i}`} species="neem" status="withered" size={16} />
                    ))}
                    {total === 0 && <span className="bg-bg-inset mb-1 h-1 w-3 rounded-full" />}
                  </div>
                  <span
                    className={cn(
                      'text-2xs font-semibold',
                      day.date === today ? 'text-pulse-600 dark:text-pulse-300' : 'text-fg-subtle',
                    )}
                    title={`${dayLabel(day.date)}: ${day.grown} grown, ${day.withered} withered`}
                  >
                    {weekdayLetter(day.date)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------- the cohort */}
      <Card padding="lg">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Your cohort today</p>
            <p className="text-fg mt-1 text-lg font-extrabold">
              {cohort.treesToday === 0
                ? 'Nobody has planted yet'
                : `${cohort.treesToday} ${cohort.treesToday === 1 ? 'tree' : 'trees'} across ${cohort.studentsPlantingToday} ${cohort.studentsPlantingToday === 1 ? 'student' : 'students'}`}
            </p>
          </div>
          <Link
            href="/grove/cohort"
            className="text-pulse-700 hover:text-pulse-500 dark:text-pulse-300 text-sm font-semibold"
          >
            See every grove
          </Link>
        </div>

        {cohort.top.length > 0 && (
          <ul className="mt-4 space-y-2">
            {cohort.top.map((person) => (
              <li key={person.memberId}>
                <Link
                  href={`/grove/cohort/${person.memberId}`}
                  className={cn(
                    'tap rounded-panel flex items-center gap-3 p-2.5 transition-colors',
                    person.isYou
                      ? 'bg-pulse-500/8 ring-pulse-500/20 ring-1 ring-inset'
                      : 'bg-bg-sunken hover:bg-bg-inset',
                  )}
                >
                  <Avatar name={person.name} src={person.avatarUrl} size="sm" glow={person.isYou} />
                  <span className="text-fg min-w-0 flex-1 truncate text-sm font-semibold">
                    {person.isYou ? 'You' : person.name}
                  </span>
                  <span className="flex items-center gap-0.5">
                    {Array.from({ length: Math.min(person.trees, 6) }).map((_, i) => (
                      <Tree key={i} species="neem" size={18} className="text-fg" />
                    ))}
                  </span>
                  <span className="text-fg-muted text-sm font-bold tabular-nums">
                    {person.trees}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="text-fg-subtle mt-4 text-xs leading-relaxed">
          Only grown trees are shared with your cohort. Withered rounds are yours alone — a failure
          you look at is a correction, and a failure everybody watches is just a punishment.
        </p>
      </Card>

      {/* ------------------------------------------------------- the stumps */}
      {stats.withered > 0 && (
        <Card padding="lg">
          <p className="eyebrow">Withered rounds</p>
          <p className="text-fg-muted mt-1 text-sm">
            Kept on purpose. A grove that deletes your failures cannot hold you to anything.
          </p>
          <ul className="divide-border mt-4 divide-y">
            {withered.map((tree) => (
              <li key={tree.id} className="flex items-center gap-3 py-2.5">
                <Tree species={tree.species} status="withered" size={26} />
                <span className="text-fg flex-1 text-sm font-semibold">
                  {SPECIES_NAMES[tree.species]} · {tree.focusMinutes} min
                </span>
                <span className="text-fg-subtle text-xs">{dayLabel(tree.date)}</span>
                <span className="text-fg-muted text-xs">
                  {tree.witherReason ? WITHER_REASONS[tree.witherReason] : 'Withered'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ------------------------------------------------------ the rules */}
      <Card padding="lg" variant="wash" tone="success">
        <p className="eyebrow">How the grove works</p>
        <ul className="text-fg-muted mt-3 space-y-2 text-sm">
          <li>
            <strong className="text-fg">A round is a promise.</strong> Pick 25, 50 or 90 minutes.
            The tree only grows if you sit the whole thing out.
          </li>
          <li>
            <strong className="text-fg">Leaving kills it.</strong> Switch away from the tab for more
            than twenty seconds and the tree withers, with the reason recorded.
          </li>
          <li>
            <strong className="text-fg">No XP here.</strong> Points still come from your study block
            and your check-in. The tree is the reward, so nobody can farm the leaderboard by
            starting timers.
          </li>
          <li>
            <strong className="text-fg">The minutes still count.</strong> Time you sat before
            quitting goes to your study block even when the tree does not survive.
          </li>
        </ul>
      </Card>
    </div>
  );
}
