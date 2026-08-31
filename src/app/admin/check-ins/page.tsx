import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { requireAdmin } from '@/lib/auth/guards';
import { OBSTACLE_LABELS } from '@/lib/validation';
import { getCohortContext, getPrimaryCohort } from '@/server/context';
import { getRecentCheckIns } from '@/server/queries/admin';

export const metadata: Metadata = { title: 'Check-ins' };
export const dynamic = 'force-dynamic';

export default async function CheckInsPage() {
  await requireAdmin();
  const cohort = await getPrimaryCohort();
  if (!cohort) redirect('/admin/no-cohort');

  const ctx = await getCohortContext(cohort.id);
  if (!ctx) redirect('/admin/no-cohort');

  const checkIns = await getRecentCheckIns(ctx, 80);

  // Group by date so the newest day reads as a single block.
  const byDate = new Map<string, typeof checkIns>();
  for (const c of checkIns) {
    const list = byDate.get(c.date) ?? [];
    list.push(c);
    byDate.set(c.date, list);
  }

  const obstacleCounts = new Map<string, number>();
  for (const c of checkIns) {
    if (c.obstacle === 'none') continue;
    obstacleCounts.set(c.obstacle, (obstacleCounts.get(c.obstacle) ?? 0) + 1);
  }
  const topObstacles = [...obstacleCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div className="space-y-4">
      <header className="px-1 pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">Check-ins</h1>
        <p className="mt-1 text-sm text-fg-muted">
          What students actually did, and what stopped them.
        </p>
      </header>

      {topObstacles.length > 0 && (
        <Card>
          <CardHeader
            title="What is getting in the way"
            description="Across the most recent check-ins."
          />
          <ul className="flex flex-wrap gap-2 p-5 pt-4">
            {topObstacles.map(([obstacle, count]) => (
              <li key={obstacle}>
                <Badge tone="warning">
                  {OBSTACLE_LABELS[obstacle] ?? obstacle} · {count}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {byDate.size === 0 ? (
        <Card>
          <EmptyState
            emoji="📝"
            title="No check-ins yet"
            description="Once students start checking in, their answers will appear here newest first."
          />
        </Card>
      ) : (
        [...byDate.entries()].map(([date, entries]) => (
          <section key={date} className="space-y-2">
            <h2 className="px-1 text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">
              {date === ctx.today ? `Today · ${date}` : date} · {entries.length} check-ins
            </h2>
            <Card className="divide-y divide-border p-0">
              {entries.map((c) => (
                <article key={c.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Avatar name={c.name} size="xs" />
                    <Link
                      href={`/admin/students/${c.memberId}`}
                      className="text-sm font-bold text-fg hover:underline"
                    >
                      {c.name}
                    </Link>
                    <Badge
                      tone={
                        c.completion === 'completed'
                          ? 'success'
                          : c.completion === 'partial'
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {c.completion}
                    </Badge>
                    <Badge>{c.actualMinutes} min</Badge>
                    <span className="text-xs text-fg-subtle" title={`${c.satisfaction} out of 5`}>
                      {'★'.repeat(c.satisfaction)}
                      {'☆'.repeat(5 - c.satisfaction)}
                    </span>
                    {c.isComeback && <Badge tone="flame">Comeback</Badge>}
                  </div>

                  <p className="mt-2 text-sm text-fg">{c.whatStudied}</p>

                  {c.obstacle !== 'none' && (
                    <p className="mt-1.5 text-sm text-fg-muted">
                      <strong className="text-fg">Blocked by:</strong>{' '}
                      {OBSTACLE_LABELS[c.obstacle] ?? c.obstacle}
                      {c.obstacleNote ? ` — ${c.obstacleNote}` : ''}
                    </p>
                  )}
                  {c.tomorrowTarget && (
                    <p className="mt-1.5 text-sm text-fg-muted">
                      <strong className="text-fg">Tomorrow:</strong> {c.tomorrowTarget}
                    </p>
                  )}
                  {c.reflection && (
                    <p className="mt-1.5 text-sm text-fg-subtle italic">“{c.reflection}”</p>
                  )}
                </article>
              ))}
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
