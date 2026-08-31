'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { ChevronRight, Loader2, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardAurora } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import { cn } from '@/lib/cn';
import { type CurriculumSearchHit, searchCurriculumAction } from '@/server/actions/curriculum';

type SubjectCard = {
  slug: string;
  name: string;
  number: number;
  sectionCount: number;
  topicCount: number;
};

type Phase = { id: string; label: string; title: string; subjects: SubjectCard[] };

export function SyllabusScreen({
  phases,
  totals,
  mySubjects,
}: {
  phases: Phase[];
  totals: { subjects: number; sections: number; topics: number; nodes: number };
  mySubjects: string[];
}) {
  const mine = new Set(mySubjects);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="The whole course"
        title="Syllabus"
        description={`All ${totals.subjects} MBBS subjects, ${totals.sections} sections and ${totals.nodes.toLocaleString()} topic nodes — the map your roadmap is cut from.`}
      >
        <SyllabusSearch />
      </PageHeader>

      {phases.map((phase, phaseIndex) => (
        <Reveal key={phase.id} delay={phaseIndex}>
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
              <h2 className="text-fg text-base font-bold">{phase.label}</h2>
              <p className="text-fg-subtle text-xs">{phase.title}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {phase.subjects.map((subject) => (
                <SubjectTile key={subject.slug} subject={subject} isMine={mine.has(subject.name)} />
              ))}
            </div>
          </section>
        </Reveal>
      ))}
    </div>
  );
}

function SubjectTile({ subject, isMine }: { subject: SubjectCard; isMine: boolean }) {
  return (
    <Link href={`/syllabus/${subject.slug}`} className="tap block rounded-2xl">
      <Card interactive padding="md" className="h-full overflow-hidden">
        {isMine && <CardAurora tone="iris" />}
        <div className="relative flex items-start gap-3">
          <span className="text-2xs bg-bg-sunken text-fg-subtle grid size-7 shrink-0 place-items-center rounded-full font-bold tabular-nums">
            {String(subject.number).padStart(2, '0')}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-fg truncate text-sm font-bold">{subject.name}</h3>
              <ChevronRight className="text-fg-subtle mt-0.5 size-4 shrink-0" aria-hidden />
            </div>
            <p className="text-fg-muted mt-1 text-xs">
              {subject.sectionCount} sections · {subject.topicCount} topics
            </p>
            {isMine && (
              <Badge tone="iris" size="sm" className="mt-2">
                Your subject
              </Badge>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

/**
 * Search runs as a server action rather than over a client-side copy of the tree — the
 * curriculum is far too large to ship to the browser for this.
 */
function SyllabusSearch() {
  const [query, setQuery] = useState('');
  /** Results are stored with the query they answer, so a stale list is never rendered. */
  const [result, setResult] = useState<{ query: string; hits: CurriculumSearchHit[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const latest = useRef(0);

  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2) return;
    const timer = setTimeout(() => {
      const ticket = ++latest.current;
      startTransition(async () => {
        const hits = await searchCurriculumAction(trimmed);
        // Ignore a slow response that lost the race to a newer keystroke.
        if (ticket === latest.current) setResult({ query: trimmed, hits });
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const hits = result && result.query === trimmed ? result.hits : null;

  return (
    <div className="relative">
      <div className="relative">
        <Search
          className="text-fg-subtle pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search every topic — try “brachial plexus” or “urea cycle”"
          aria-label="Search the syllabus"
          className={cn(
            'border-border bg-bg-elevated text-fg placeholder:text-fg-subtle w-full rounded-xl border py-2.5 pr-10 pl-10 text-sm',
            'focus:border-iris-400 focus:ring-iris-400/30 outline-none focus:ring-2',
          )}
        />
        {pending && (
          <Loader2
            className="text-fg-subtle absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin"
            aria-hidden
          />
        )}
      </div>

      {hits && (
        <div className="border-border bg-bg-elevated shadow-lift mt-2 overflow-hidden rounded-xl border">
          {hits.length === 0 ? (
            <p className="text-fg-muted p-4 text-sm">
              Nothing in the syllabus matches “{trimmed}”.
            </p>
          ) : (
            <ul className="divide-border max-h-80 divide-y overflow-y-auto">
              {hits.map((hit, i) => (
                <li key={`${hit.subjectSlug}-${hit.sectionSlug}-${hit.topicTitle}-${i}`}>
                  <Link
                    href={`/syllabus/${hit.subjectSlug}#${hit.sectionSlug}`}
                    onClick={() => setQuery('')}
                    className="hover:bg-bg-sunken block px-4 py-3"
                  >
                    <p className="text-fg text-sm font-semibold">{hit.node ?? hit.topicTitle}</p>
                    <p className="text-fg-subtle mt-0.5 text-xs">
                      {hit.subjectName} · {hit.sectionTitle}
                      {hit.node ? ` · ${hit.topicTitle}` : ''}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
