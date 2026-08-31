'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  ExternalLink,
  FileText,
  FolderOpen,
  Globe,
  Library,
  PlayCircle,
  Search,
  Video,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, SectionTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { TextInput } from '@/components/ui/form';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import { cn } from '@/lib/cn';
import type { MaterialType } from '@/db/schema';

/*
 * Each resource type gets its own icon *and* its own colour, and the pair is fixed. A drive
 * folder is always amber, a video is always violet — after a week of use the shape of the
 * list is scannable without reading a single label.
 */
const TYPE_META: Record<MaterialType, { icon: typeof FileText; label: string; className: string }> =
  {
    pdf: {
      icon: FileText,
      label: 'PDF',
      className: 'bg-danger/12 text-danger-strong dark:text-danger',
    },
    drive: {
      icon: FolderOpen,
      label: 'Drive',
      className: 'bg-flame-500/14 text-flame-700 dark:text-flame-300',
    },
    video: {
      icon: PlayCircle,
      label: 'Video',
      className: 'bg-iris-500/12 text-iris-700 dark:text-iris-300',
    },
    textbook: {
      icon: BookOpen,
      label: 'Textbook',
      className: 'bg-pulse-500/12 text-pulse-700 dark:text-pulse-300',
    },
    website: {
      icon: Globe,
      label: 'Website',
      className: 'bg-aqua-400/18 text-aqua-500',
    },
    recording: {
      icon: Video,
      label: 'Recording',
      className: 'bg-citrus-500/18 text-citrus-700 dark:text-citrus-300',
    },
  };

type Material = {
  id: string;
  title: string;
  description: string | null;
  type: MaterialType;
  url: string;
  topicKey: string | null;
  subjectName: string | null;
};

type Quiz = {
  id: string;
  title: string;
  topicKey: string;
  questionCount: number;
  best: { score: number; total: number } | null;
};

export function MaterialsScreen({
  materials,
  quizzes,
}: {
  materials: Material[];
  quizzes: Quiz[];
}) {
  const [query, setQuery] = useState('');

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? materials.filter(
          (m) =>
            m.title.toLowerCase().includes(q) ||
            (m.topicKey ?? '').toLowerCase().includes(q) ||
            (m.subjectName ?? '').toLowerCase().includes(q),
        )
      : materials;

    const map = new Map<string, Material[]>();
    for (const m of filtered) {
      const key = m.topicKey ?? m.subjectName ?? 'General';
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [materials, query]);

  const matchCount = grouped.reduce((sum, [, items]) => sum + items.length, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Library"
        title="Materials"
        description="Curated by your cohort lead and grouped by topic."
      >
        <TextInput
          type="search"
          placeholder="Search by topic, subject or title"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search materials"
          leading={<Search className="size-4" aria-hidden />}
          className="max-w-xl"
        />
      </PageHeader>

      {/* ------------------------------------------------- knowledge checks */}
      {quizzes.length > 0 && !query && (
        <Reveal>
          <section className="space-y-3">
            <SectionTitle>Knowledge checks</SectionTitle>
            <p className="text-fg-muted px-1 text-sm">
              Optional and low-stakes. Attempting is what earns XP — the score barely moves your
              standing.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {quizzes.map((quiz, i) => (
                <Reveal key={quiz.id} delay={i}>
                  <Link href={`/quiz/${quiz.id}`} className="tap block h-full">
                    <Card
                      variant="wash"
                      tone="pulse"
                      padding="md"
                      interactive
                      className="flex h-full flex-col"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className="bg-pulse-500/14 text-pulse-600 dark:text-pulse-300 grid size-10 shrink-0 place-items-center rounded-xl"
                          aria-hidden
                        >
                          <Library className="size-5" />
                        </span>
                        {quiz.best && (
                          <Badge tone="success" size="sm">
                            Best {quiz.best.score}/{quiz.best.total}
                          </Badge>
                        )}
                      </div>
                      <p className="text-fg mt-3.5 text-sm font-bold">{quiz.title}</p>
                      <p className="text-fg-muted mt-auto pt-2 text-xs">
                        {quiz.questionCount} questions · {quiz.topicKey}
                      </p>
                    </Card>
                  </Link>
                </Reveal>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {/* ------------------------------------------------------- the library */}
      {grouped.length === 0 ? (
        <Card variant="outline">
          <EmptyState
            icon={<BookOpen className="size-6" aria-hidden />}
            title={query ? 'Nothing matched that search' : 'No materials yet'}
            description={
              query
                ? 'Try a different topic name, or clear the search to see everything.'
                : 'Your cohort lead has not added any resources yet. They will show up here, grouped by topic.'
            }
          />
        </Card>
      ) : (
        <>
          {query && (
            <p className="text-fg-muted px-1 text-sm">
              <strong className="text-fg">{matchCount}</strong>{' '}
              {matchCount === 1 ? 'resource' : 'resources'} matching “{query}”
            </p>
          )}
          <div className="space-y-5">
            {grouped.map(([topic, items], groupIndex) => (
              <Reveal key={topic} delay={groupIndex}>
                <section className="space-y-2.5">
                  <SectionTitle
                    action={
                      <span className="text-2xs text-fg-subtle font-bold tabular-nums">
                        {items.length}
                      </span>
                    }
                  >
                    {topic}
                  </SectionTitle>
                  <Card padding="none" className="overflow-hidden">
                    <ul className="divide-border divide-y">
                      {items.map((m) => (
                        <li key={m.id}>
                          <MaterialRow material={m} />
                        </li>
                      ))}
                    </ul>
                  </Card>
                </section>
              </Reveal>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MaterialRow({ material }: { material: Material }) {
  const meta = TYPE_META[material.type];
  const Icon = meta.icon;

  return (
    <a
      href={material.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('tap group hover:bg-bg-sunken flex items-start gap-3.5 p-4 transition-colors')}
    >
      <span
        className={cn('grid size-10 shrink-0 place-items-center rounded-xl', meta.className)}
        aria-hidden
      >
        <Icon className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-fg text-sm font-bold">{material.title}</p>
        {material.description && (
          <p className="text-fg-muted mt-0.5 text-xs leading-relaxed">{material.description}</p>
        )}
        <p className="eyebrow mt-1.5">
          {meta.label}
          {material.subjectName ? ` · ${material.subjectName}` : ''}
        </p>
      </div>

      <ExternalLink
        className="text-fg-subtle group-hover:text-fg-muted mt-0.5 size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        aria-hidden
      />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
