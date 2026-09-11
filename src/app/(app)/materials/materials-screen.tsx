'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderOpen,
  Globe,
  Library,
  PlayCircle,
  Search,
  SlidersHorizontal,
  Video,
} from 'lucide-react';

import { BookCover } from '@/components/textbook/book-cover';
import { Badge } from '@/components/ui/badge';
import { Card, SectionTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { TextInput } from '@/components/ui/form';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import { Segmented } from '@/components/ui/segmented';
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
  /** Null for a hosted textbook, which opens in the in-app reader instead. */
  url: string | null;
  hosted: boolean;
  curriculumRef: string | null;
  /** The curriculum section or topic this sits under, resolved server-side. */
  topicLabel: string | null;
  subjectName: string | null;
  /** Non-null when this book has an uploaded cover. Changes when the image is replaced. */
  coverVersion: string | null;
};

type Shelf = 'textbooks' | 'links';

type Quiz = {
  id: string;
  title: string;
  topicLabel: string | null;
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

  /*
   * Textbooks are the `textbook` type; everything else — videos, drives, sites, recordings —
   * is a link. A cohort with no textbooks yet opens on Links rather than on an empty tab.
   */
  const textbooks = useMemo(() => materials.filter((m) => m.type === 'textbook'), [materials]);
  const links = useMemo(() => materials.filter((m) => m.type !== 'textbook'), [materials]);
  const [shelf, setShelf] = useState<Shelf>(textbooks.length > 0 ? 'textbooks' : 'links');

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Library"
        title="Materials"
        description="Curated by your cohort lead and grouped by topic."
      >
        <Segmented
          ariaLabel="Material type"
          value={shelf}
          onChange={setShelf}
          options={[
            { value: 'textbooks', label: 'Textbooks', count: textbooks.length },
            { value: 'links', label: 'Links', count: links.length },
          ]}
          className="mb-3"
        />
        <TextInput
          type="search"
          placeholder={
            shelf === 'textbooks' ? 'Search books by title or subject' : 'Search by topic or title'
          }
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
                        {quiz.questionCount} questions{quiz.topicLabel && ` · ${quiz.topicLabel}`}
                      </p>
                    </Card>
                  </Link>
                </Reveal>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {shelf === 'textbooks' ? (
        <Bookshelf books={textbooks} query={query} />
      ) : (
        <LinkShelf links={links} query={query} />
      )}
    </div>
  );
}

/* --------------------------------------------------------------- textbooks */

/**
 * The books, as books.
 *
 * A textbook is chosen by sight — a student looking for the red anatomy one is not reading
 * titles, they are looking for the red one — so the shelf is a grid of covers rather than
 * the row-per-item list the links use. Subject chips sit above it because a cohort with
 * fifteen books across six subjects is one filter away from being a shelf of three.
 */
function Bookshelf({ books, query }: { books: Material[]; query: string }) {
  const [subject, setSubject] = useState<string>('all');

  const subjects = useMemo(() => {
    const names = new Set<string>();
    for (const book of books) if (book.subjectName) names.add(book.subjectName);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [books]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books.filter((book) => {
      if (subject !== 'all' && book.subjectName !== subject) return false;
      if (!q) return true;
      return (
        book.title.toLowerCase().includes(q) ||
        (book.subjectName ?? '').toLowerCase().includes(q) ||
        (book.topicLabel ?? '').toLowerCase().includes(q)
      );
    });
  }, [books, subject, query]);

  if (books.length === 0) {
    return (
      <Card variant="outline">
        <EmptyState
          icon={<BookOpen className="size-6" aria-hidden />}
          title="No textbooks yet"
          description="Your cohort lead has not uploaded any books yet. They will appear here, ready to read chapter by chapter."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {subjects.length > 0 && (
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
          <span
            className="text-fg-subtle border-border grid size-8 shrink-0 place-items-center rounded-full border"
            aria-hidden
          >
            <SlidersHorizontal className="size-3.5" />
          </span>
          <FilterChip label="All" active={subject === 'all'} onClick={() => setSubject('all')} />
          {subjects.map((name) => (
            <FilterChip
              key={name}
              label={name}
              active={subject === name}
              onClick={() => setSubject(name)}
            />
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <Card variant="outline">
          <EmptyState
            icon={<BookOpen className="size-6" aria-hidden />}
            title="Nothing matched"
            description="Try a different title, or clear the search and filter to see every book."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((book, index) => (
            <Reveal key={book.id} delay={Math.min(index, 8)}>
              <Link href={`/materials/${book.id}`} className="tap group block">
                <BookCover
                  title={book.title}
                  materialId={book.id}
                  coverVersion={book.coverVersion}
                  size="shelf"
                  className="transition-transform duration-200 group-hover:-translate-y-1 group-hover:shadow-lg"
                />
                <p className="text-fg mt-2.5 line-clamp-2 text-sm font-bold">{book.title}</p>
                {(book.subjectName ?? book.topicLabel) && (
                  <p className="text-fg-subtle mt-0.5 truncate text-xs font-semibold">
                    {book.subjectName ?? book.topicLabel}
                  </p>
                )}
              </Link>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'tap rounded-pill shrink-0 px-3.5 py-1.5 text-xs font-bold whitespace-nowrap transition-colors',
        active
          ? 'bg-pulse-600 text-white'
          : 'border-border text-fg-muted hover:text-fg hover:bg-bg-sunken border',
      )}
    >
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------- links */

function LinkShelf({ links, query }: { links: Material[]; query: string }) {
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? links.filter(
          (m) =>
            m.title.toLowerCase().includes(q) ||
            (m.topicLabel ?? '').toLowerCase().includes(q) ||
            (m.subjectName ?? '').toLowerCase().includes(q),
        )
      : links;

    const map = new Map<string, Material[]>();
    for (const m of filtered) {
      const key = m.topicLabel ?? m.subjectName ?? 'General';
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [links, query]);

  const matchCount = grouped.reduce((sum, [, items]) => sum + items.length, 0);

  if (grouped.length === 0) {
    return (
      <Card variant="outline">
        <EmptyState
          icon={<BookOpen className="size-6" aria-hidden />}
          title={query ? 'Nothing matched that search' : 'No links yet'}
          description={
            query
              ? 'Try a different topic name, or clear the search to see everything.'
              : 'Your cohort lead has not added any links yet. They will show up here, grouped by topic.'
          }
        />
      </Card>
    );
  }

  return (
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
  );
}

function MaterialRow({ material }: { material: Material }) {
  const meta = TYPE_META[material.type];
  const Icon = meta.icon;
  const className = 'tap group hover:bg-bg-sunken flex items-start gap-3.5 p-4 transition-colors';

  const body = (
    <>
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
    </>
  );

  if (material.hosted || !material.url) {
    return (
      <Link href={`/materials/${material.id}`} className={className}>
        {body}
        <ChevronRight
          className="text-fg-subtle group-hover:text-fg-muted mt-0.5 size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    );
  }

  return (
    <a href={material.url} target="_blank" rel="noopener noreferrer" className={className}>
      {body}
      <ExternalLink
        className="text-fg-subtle group-hover:text-fg-muted mt-0.5 size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        aria-hidden
      />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
