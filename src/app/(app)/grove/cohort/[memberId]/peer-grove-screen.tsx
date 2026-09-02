import Link from 'next/link';
import { ArrowLeft, Eye, Flame, TreeDeciduous } from 'lucide-react';

import { EmptyPlot, Tree } from '@/components/grove/tree';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat';
import { cn } from '@/lib/cn';
import type { ISODate } from '@/lib/domain/calendar';
import { SPECIES_NAMES, formatFocusMinutes } from '@/lib/domain/grove';
import type { PeerGrove } from '@/server/queries/grove';

const SPECIES_ORDER = ['deodar', 'banyan', 'neem', 'fern', 'sprout'] as const;

function dayLabel(date: ISODate): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function weekdayLetter(date: ISODate): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { weekday: 'narrow', timeZone: 'UTC' });
}

/**
 * A classmate's grove.
 *
 * The same shapes as your own grove — the wall, today's plot, the species breakdown — with
 * every control removed. Nothing on this screen writes anything: there is no action to
 * import, which is the most reliable way to make "read-only" true rather than merely
 * intended.
 */
export function PeerGroveScreen({ grove, today }: { grove: PeerGrove; today: ISODate }) {
  const first = grove.name.split(' ')[0] ?? grove.name;

  return (
    <div className="space-y-4">
      <Link
        href="/grove/cohort"
        className="tap text-fg-muted hover:text-fg inline-flex items-center gap-1.5 px-1 py-2 text-sm font-semibold"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All student groves
      </Link>

      <PageHeader
        eyebrow={grove.isYou ? 'Your grove' : 'Cohort grove'}
        title={`${grove.name}'s grove`}
        description={
          grove.trees === 0
            ? `${first} has not grown a tree yet.`
            : `${grove.trees} ${grove.trees === 1 ? 'tree' : 'trees'} from ${formatFocusMinutes(grove.focusMinutes)} of verified focus.`
        }
        actions={
          grove.isYou ? (
            <LinkButton href="/grove" size="sm" variant="outline">
              Open your grove
            </LinkButton>
          ) : undefined
        }
      >
        <span className="text-fg-muted inline-flex items-center gap-1.5 text-xs font-semibold">
          <Eye className="size-3.5" aria-hidden />
          Read-only
        </span>
      </PageHeader>

      <Card padding="lg">
        <div className="flex items-center gap-4">
          <Avatar name={grove.name} src={grove.avatarUrl} size="lg" ring />
          <div className="min-w-0">
            <p className="text-fg text-lg font-extrabold">{grove.name}</p>
            <p className="text-fg-muted text-sm">
              {grove.lastPlantedOn
                ? `Last planted ${dayLabel(grove.lastPlantedOn)}`
                : 'Nothing planted yet'}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile
          label="Trees planted"
          value={grove.trees}
          sub="all time"
          tone="success"
          emphasis
          icon={<TreeDeciduous className="size-4" aria-hidden />}
        />
        <StatTile
          label="Verified study time"
          value={formatFocusMinutes(grove.focusMinutes)}
          sub="completed rounds only"
          tone="pulse"
          emphasis
        />
        <StatTile
          label="Planting streak"
          value={grove.streak}
          sub={grove.streak === 1 ? 'day' : 'days in a row'}
          tone="flame"
          icon={<Flame className="size-4" aria-hidden />}
        />
      </div>

      {/* --------------------------------------------------------- species */}
      <Card padding="lg">
        <p className="eyebrow">What grew</p>
        <p className="text-fg-muted mt-1 text-sm">
          The species is fixed by the length of round that earned it, so this is a breakdown of how
          long {first} sat, not of how many timers were started.
        </p>

        <ul className="mt-4 space-y-2">
          {SPECIES_ORDER.map((species) => {
            const count = grove.species[species];
            return (
              <li
                key={species}
                className={cn(
                  'rounded-panel flex items-center gap-3 p-2.5',
                  count > 0 ? 'bg-bg-sunken' : 'opacity-50',
                )}
              >
                <Tree species={species} size={28} className="text-fg" />
                <span className="text-fg min-w-0 flex-1 text-sm font-semibold">
                  {SPECIES_NAMES[species]}
                </span>
                <span className="text-fg-muted text-sm font-bold tabular-nums">{count}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* ----------------------------------------------------------- today */}
      <Card padding="lg">
        <p className="eyebrow">Today</p>
        <p className="text-fg mt-1 text-lg font-extrabold">
          {grove.todayTrees.length === 0
            ? 'Nothing yet today'
            : `${grove.todayTrees.length} ${grove.todayTrees.length === 1 ? 'tree' : 'trees'}`}
        </p>

        <div className="rounded-panel bg-bg-sunken text-fg mt-4 flex min-h-28 flex-wrap items-end gap-1 p-4">
          {grove.todayTrees.length === 0 ? (
            <div className="flex w-full flex-col items-center gap-2 py-2">
              <EmptyPlot size={56} />
              <p className="text-fg-subtle text-sm">Bare soil so far.</p>
            </div>
          ) : (
            grove.todayTrees.map((tree) => (
              <Tree
                key={tree.id}
                species={tree.species}
                size={48}
                title={`${SPECIES_NAMES[tree.species]}, ${tree.focusMinutes} minutes`}
              />
            ))
          )}
        </div>
      </Card>

      {/* ------------------------------------------------------- the wall */}
      <Card padding="lg">
        <p className="eyebrow">The last two weeks</p>
        <p className="text-fg-muted mt-1 text-sm">One column a day. Grown trees only.</p>

        <div className="-mx-1 mt-5 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max items-end gap-1.5">
            {grove.days.map((day) => (
              <div key={day.date} className="flex w-5 flex-col items-center gap-1">
                <div className="flex h-20 w-full flex-col-reverse items-center justify-start">
                  {Array.from({ length: Math.min(day.grown, 4) }).map((_, i) => (
                    <Tree key={i} species="neem" size={16} className="text-fg" />
                  ))}
                  {day.grown === 0 && <span className="bg-bg-inset mb-1 h-1 w-3 rounded-full" />}
                </div>
                <span
                  className={cn(
                    'text-2xs font-semibold',
                    day.date === today ? 'text-pulse-600 dark:text-pulse-300' : 'text-fg-subtle',
                  )}
                  title={`${dayLabel(day.date)}: ${day.grown} grown`}
                >
                  {weekdayLetter(day.date)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card padding="lg" variant="wash" tone="success">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success">Only completed rounds count</Badge>
          <Badge>Withered rounds stay private</Badge>
        </div>
        <p className="text-fg-muted mt-3 text-sm leading-relaxed">
          Starting, pausing or walking out on a Pomodoro grows nothing. Every tree here is a round
          the server watched run its full length, counted from stored sessions rather than from
          anything a browser claimed.
        </p>
      </Card>
    </div>
  );
}
