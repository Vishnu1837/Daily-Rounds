import Link from 'next/link';
import { ArrowLeft, TreeDeciduous } from 'lucide-react';

import { EmptyPlot, Tree } from '@/components/grove/tree';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat';
import { cn } from '@/lib/cn';
import { SPECIES_NAMES, formatFocusMinutes } from '@/lib/domain/grove';
import type { CohortGroveRow } from '@/server/queries/grove';

/** Species, largest promise first — a row of Deodars should read as harder-won than Sprouts. */
const SPECIES_ORDER = ['deodar', 'banyan', 'neem', 'fern', 'sprout'] as const;

/**
 * The cohort's groves, side by side.
 *
 * A student's own grove answers "what did I grow?". This answers the question that actually
 * makes the mechanic work at 9pm: *everyone else is out there planting*. Names and trees
 * only — no contact details, no withered rounds, and nothing here is editable, because
 * seeing someone's grove is not the same as having a say in it.
 */
export function CohortGroveScreen({
  rows,
  cohortName,
}: {
  rows: CohortGroveRow[];
  cohortName: string;
}) {
  const totalTrees = rows.reduce((sum, r) => sum + r.trees, 0);
  const totalMinutes = rows.reduce((sum, r) => sum + r.focusMinutes, 0);
  const planters = rows.filter((r) => r.trees > 0).length;

  return (
    <div className="space-y-4">
      <Link
        href="/grove"
        className="tap text-fg-muted hover:text-fg inline-flex items-center gap-1.5 px-1 py-2 text-sm font-semibold"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Your grove
      </Link>

      <PageHeader
        eyebrow={cohortName}
        title="Student groves"
        description="Every grove in your cohort, built only from Pomodoro rounds that were sat all the way through."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile
          label="Trees in the cohort"
          value={totalTrees}
          tone="success"
          emphasis
          icon={<TreeDeciduous className="size-4" aria-hidden />}
        />
        <StatTile
          label="Verified focus"
          value={formatFocusMinutes(totalMinutes)}
          sub="grown rounds only"
          tone="pulse"
          emphasis
        />
        <StatTile
          label="Students planting"
          value={`${planters}/${rows.length}`}
          sub="have grown at least one"
          tone="iris"
        />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<TreeDeciduous className="size-6" aria-hidden />}
            title="No one here yet"
            description="Once your cohort has students, their groves appear here."
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <Link key={row.memberId} href={`/grove/cohort/${row.memberId}`} className="block">
              <Card
                interactive
                padding="md"
                variant={row.isYou ? 'wash' : 'surface'}
                tone={row.isYou ? 'pulse' : 'neutral'}
                className="h-full"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={row.name} src={row.avatarUrl} size="md" glow={row.isYou} />
                  <div className="min-w-0 flex-1">
                    <p className="text-fg truncate text-sm font-bold">
                      {row.name}
                      {row.isYou && (
                        <Badge tone="pulse" size="sm" className="ml-2">
                          You
                        </Badge>
                      )}
                    </p>
                    <p className="text-fg-muted mt-0.5 text-xs">
                      {row.trees === 0
                        ? 'No trees yet'
                        : `${row.trees} ${row.trees === 1 ? 'tree' : 'trees'} · ${formatFocusMinutes(row.focusMinutes)}`}
                    </p>
                  </div>
                </div>

                {/* The preview: up to twelve trees, biggest species first. */}
                <div className="rounded-panel bg-bg-sunken text-fg mt-3 flex min-h-16 flex-wrap items-end gap-0.5 p-3">
                  {row.trees === 0 ? (
                    <span className="flex w-full items-center gap-2">
                      <EmptyPlot size={32} />
                      <span className="text-fg-subtle text-xs">Bare soil, for now.</span>
                    </span>
                  ) : (
                    <GrovePreview row={row} limit={12} />
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {SPECIES_ORDER.filter((s) => row.species[s] > 0).map((s) => (
                    <Badge key={s} size="sm">
                      {SPECIES_NAMES[s]} × {row.species[s]}
                    </Badge>
                  ))}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <p className="text-fg-subtle px-1 text-xs leading-relaxed">
        Groves are read-only: you can look at anyone&apos;s in this cohort, and change
        nobody&apos;s. Withered rounds stay private to the student they belong to, and no contact
        details are shown here.
      </p>
    </div>
  );
}

/**
 * A miniature of the grove.
 *
 * Drawn from the species counts rather than from the individual rows, so the card needs one
 * grouped query instead of every tree in the cohort — and still shows honestly what the
 * grove is *made of*, because the species is fixed by the length of round that earned it.
 */
function GrovePreview({ row, limit }: { row: CohortGroveRow; limit: number }) {
  const drawn: { species: (typeof SPECIES_ORDER)[number]; key: string }[] = [];
  for (const species of SPECIES_ORDER) {
    for (let i = 0; i < row.species[species] && drawn.length < limit; i += 1) {
      drawn.push({ species, key: `${species}-${i}` });
    }
  }
  const hidden = row.trees - drawn.length;

  return (
    <>
      {drawn.map((tree) => (
        <Tree
          key={tree.key}
          species={tree.species}
          size={26}
          className="text-fg"
          title={SPECIES_NAMES[tree.species]}
        />
      ))}
      {hidden > 0 && (
        <span className={cn('text-fg-subtle self-center pl-1 text-xs font-semibold')}>
          +{hidden}
        </span>
      )}
    </>
  );
}
