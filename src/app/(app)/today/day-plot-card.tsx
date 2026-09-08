'use client';

import { useEffect, useState } from 'react';
import { Sprout, TreeDeciduous } from 'lucide-react';

import { EmptyPlot, Tree } from '@/components/grove/tree';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { GROWTH_STAGES, SPECIES_NAMES, growthStage } from '@/lib/domain/grove';
import type { TodayPlot } from '@/server/queries/grove';

/** How often the growing tree re-checks its own progress. */
const TICK_MS = 4_000;

/**
 * Today's plot, on the dashboard.
 *
 * The grove already draws a tree that grows while you sit still and dies when you walk out,
 * and it is the most alive thing in the product — but it only ever existed on the two screens
 * a student visits *after* deciding to work. The dashboard, which is where every student
 * lands and the screen they open most, was cards and numbers: nothing on it looked back.
 *
 * So this is not a new mechanic, and deliberately so. It is the existing tree, reading the
 * existing rows, in the one place it was missing. Three things follow from that:
 *
 *   - **It never invents a state.** The plot shows exactly what the grove shows for today —
 *     grown trees, withered stumps and a round still in the ground. If it drew a tree for
 *     ticked-off tasks or completed topics, the tree would stop meaning "a round survived",
 *     and the grove's whole vocabulary would go with it.
 *
 *   - **A live round keeps growing here.** The canopy is a pure function of two timestamps,
 *     so a student who plants a round and comes back to the dashboard watches it grow rather
 *     than seeing a frozen snapshot of the moment the page rendered.
 *
 *   - **Stumps are shown, not swept.** An empty plot at 9pm is supposed to be uncomfortable,
 *     and a plot that hid its failures could not be.
 */
export function DayPlotCard({ plot }: { plot: TodayPlot }) {
  const grown = plot.trees.filter((t) => t.status === 'grown').length;
  const withered = plot.trees.filter((t) => t.status === 'withered').length;
  const isEmpty = plot.trees.length === 0 && !plot.live;

  return (
    <Card
      variant={isEmpty ? 'outline' : 'surface'}
      padding="md"
      className="flex h-full flex-col gap-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Today&apos;s plot</p>
          <h2 className="text-fg mt-1.5 leading-tight font-bold">
            {plot.live
              ? `${SPECIES_NAMES[plot.live.species]} in the ground`
              : grown > 0
                ? `${grown} ${grown === 1 ? 'tree' : 'trees'} grown`
                : withered > 0
                  ? 'Nothing standing yet'
                  : 'Bare soil'}
          </h2>
        </div>

        {plot.streak > 0 && (
          <Badge tone="success">
            {plot.streak} {plot.streak === 1 ? 'day' : 'days'} planting
          </Badge>
        )}
      </div>

      <div className="flex flex-1 items-end justify-center py-1">
        {plot.live ? (
          <GrowingTree key={plot.live.plantedAt} live={plot.live} />
        ) : plot.trees.length > 0 ? (
          <PlantedRow trees={plot.trees} />
        ) : (
          <EmptyPlot size={64} className="text-fg-subtle" />
        )}
      </div>

      <div>
        <p className="text-fg-muted text-center text-sm text-balance">
          {plot.live
            ? 'Still growing. It only survives if you sit the round out.'
            : grown > 0
              ? withered > 0
                ? `${grown} survived, ${withered} walked out on.`
                : 'Every round you started today, you finished.'
              : withered > 0
                ? 'Every round today ended early. The next one does not have to.'
                : 'No study block yet today. A round is 25 minutes.'}
        </p>

        {!plot.live && (
          <LinkButton
            href="/study"
            variant={grown > 0 ? 'outline' : 'primary'}
            size="md"
            fullWidth
            className="mt-3"
          >
            <Sprout className="size-4" aria-hidden />
            {grown > 0 || withered > 0 ? 'Start another round' : 'Start study block'}
          </LinkButton>
        )}

        {plot.live && (
          <LinkButton href="/study" variant="outline" size="md" fullWidth className="mt-3">
            <TreeDeciduous className="size-4" aria-hidden />
            Back to the round
          </LinkButton>
        )}
      </div>
    </Card>
  );
}

/**
 * The round currently in the ground.
 *
 * Progress is recomputed from `plantedAt` → `dueAt` on a timer rather than counted down from
 * a starting value, so a laptop that slept for an hour reopens on the correct canopy instead
 * of one that is an hour behind. The interval is slow — a growth stage lasts minutes, and a
 * per-second tick would re-render the dashboard nine hundred times to move a tree four times.
 */
function GrowingTree({ live }: { live: NonNullable<TodayPlot['live']> }) {
  const [stage, setStage] = useState(() => stageOf(live));

  // No resync on `live` changing: a different round is a different tree, and the caller
  // remounts this on `plantedAt` so the initialiser above runs again. Same reason `Confetti`
  // re-arms by key rather than resetting its own state from inside an effect.
  useEffect(() => {
    const id = window.setInterval(() => setStage(stageOf(live)), TICK_MS);
    return () => window.clearInterval(id);
  }, [live]);

  return (
    <Tree
      species={live.species}
      status="growing"
      stage={stage}
      size={96}
      sway
      title={`${SPECIES_NAMES[live.species]}, growing`}
    />
  );
}

function stageOf(live: NonNullable<TodayPlot['live']>): number {
  const planted = new Date(live.plantedAt).getTime();
  const due = new Date(live.dueAt).getTime();
  const span = due - planted;
  if (span <= 0) return GROWTH_STAGES - 1;
  return growthStage((Date.now() - planted) / span);
}

/**
 * The day's settled rounds, in the order they were planted.
 *
 * Capped at eight drawings with a count for the remainder: a student on their twelfth round
 * has earned a bigger number, not a row of trees small enough to be unreadable.
 */
function PlantedRow({ trees }: { trees: TodayPlot['trees'] }) {
  const shown = trees.slice(0, 8);
  const extra = trees.length - shown.length;

  return (
    <div className="flex flex-wrap items-end justify-center gap-x-1 gap-y-2">
      {shown.map((tree) => (
        <Tree
          key={tree.id}
          species={tree.species}
          status={tree.status}
          size={trees.length > 4 ? 44 : 56}
          className={cn(tree.status === 'withered' && 'opacity-70')}
          title={`${SPECIES_NAMES[tree.species]}, ${tree.status === 'grown' ? 'grown' : 'withered'}`}
        />
      ))}
      {extra > 0 && (
        <span className="text-fg-subtle self-center pl-1 text-sm font-bold">+{extra}</span>
      )}
    </div>
  );
}
