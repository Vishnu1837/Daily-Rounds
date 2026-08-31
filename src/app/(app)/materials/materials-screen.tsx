'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, SectionTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { TextInput } from '@/components/ui/form';
import { cn } from '@/lib/cn';
import type { MaterialType } from '@/db/schema';

const TYPE_META: Record<MaterialType, { emoji: string; label: string }> = {
  pdf: { emoji: '📄', label: 'PDF' },
  drive: { emoji: '📁', label: 'Drive' },
  video: { emoji: '▶️', label: 'Video' },
  textbook: { emoji: '📚', label: 'Textbook' },
  website: { emoji: '🔗', label: 'Website' },
  recording: { emoji: '🎥', label: 'Recording' },
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

  return (
    <div className="space-y-4">
      <header className="px-1 pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">Materials</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Curated by your cohort lead, organised by topic.
        </p>
      </header>

      <TextInput
        type="search"
        placeholder="Search by topic or title"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search materials"
      />

      {quizzes.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Knowledge checks</SectionTitle>
          <p className="px-1 text-sm text-fg-muted">
            Optional and low-stakes. Attempting is what earns points — the score barely moves your
            standing.
          </p>
          <div className="space-y-2">
            {quizzes.map((quiz) => (
              <Link key={quiz.id} href={`/quiz/${quiz.id}`} className="tap block">
                <Card interactive className="flex items-center gap-3.5 p-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-bg-sunken text-xl" aria-hidden>
                    🔬
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-fg">{quiz.title}</p>
                    <p className="truncate text-xs text-fg-subtle">
                      {quiz.questionCount} questions · {quiz.topicKey}
                    </p>
                  </div>
                  {quiz.best && (
                    <Badge tone="pulse">
                      Best {quiz.best.score}/{quiz.best.total}
                    </Badge>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {grouped.length === 0 ? (
        <Card>
          <EmptyState
            emoji="📚"
            title={query ? 'Nothing matched that search' : 'No materials yet'}
            description={
              query
                ? 'Try a different topic name, or clear the search to see everything.'
                : 'Your cohort lead has not added any resources yet. They will show up here, grouped by topic.'
            }
          />
        </Card>
      ) : (
        grouped.map(([topic, items]) => (
          <section key={topic} className="space-y-2">
            <SectionTitle>{topic}</SectionTitle>
            <Card className="divide-y divide-border p-0">
              {items.map((m) => (
                <a
                  key={m.id}
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'tap flex items-start gap-3.5 p-4 transition-colors hover:bg-bg-sunken',
                  )}
                >
                  <span className="text-xl" aria-hidden>
                    {TYPE_META[m.type].emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-fg">{m.title}</p>
                    {m.description && (
                      <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{m.description}</p>
                    )}
                    <p className="mt-1.5 text-2xs font-bold tracking-wide text-fg-subtle uppercase">
                      {TYPE_META[m.type].label}
                      {m.subjectName ? ` · ${m.subjectName}` : ''}
                    </p>
                  </div>
                  <ExternalLink className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ))}
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
