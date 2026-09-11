'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight } from 'lucide-react';

import { BookCover } from '@/components/textbook/book-cover';
import { Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress';
import { Reveal } from '@/components/ui/reveal';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import {
  nextUnstudiedTopic,
  summariseTopicProgress,
  topicPageCount,
} from '@/lib/domain/textbook-topics';
import { setTopicStudiedAction } from '@/server/actions/textbooks';

export type ScreenTopic = {
  id: string;
  position: number;
  title: string;
  startPage: number;
  endPage: number;
  studied: boolean;
};

/**
 * A textbook as a reading list.
 *
 * The screen answers three questions in the order a student asks them: what do I read next,
 * how far through am I, and what else is in here. So the continue card comes first, the
 * chapter count second, and the timeline — which is the long part — last.
 *
 * Studied marks are held here rather than re-fetched, and the toggle is optimistic. Marking
 * a chapter read is the least consequential write in the app; making someone watch a
 * spinner for it, or bouncing the whole timeline through a server round trip, would cost
 * more than the mark is worth. A failure puts the mark back and says so.
 */
export function BookScreen({
  materialId,
  title,
  coverVersion = null,
  topics: initial,
}: {
  materialId: string;
  title: string;
  /** Non-null when an admin uploaded a cover; otherwise the drawn title card is used. */
  coverVersion?: string | null;
  topics: ScreenTopic[];
}) {
  const [topics, setTopics] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const studiedIds = useMemo(
    () => new Set(topics.filter((t) => t.studied).map((t) => t.id)),
    [topics],
  );
  const progress = summariseTopicProgress(topics, studiedIds);
  const next = nextUnstudiedTopic(topics, studiedIds);
  const open = topics.find((t) => t.id === openId) ?? null;

  const toggle = useCallback(async (topic: ScreenTopic) => {
    const studied = !topic.studied;
    setPending(true);
    setError(null);
    setTopics((prev) => prev.map((t) => (t.id === topic.id ? { ...t, studied } : t)));

    const result = await setTopicStudiedAction(topic.id, studied);
    setPending(false);
    if (!result.ok) {
      setTopics((prev) => prev.map((t) => (t.id === topic.id ? { ...t, studied: !studied } : t)));
      setError(result.message);
    }
  }, []);

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------ header */}
      <header className="flex items-start gap-3 px-1 pt-1">
        <Link
          href="/materials"
          aria-label="Back to materials"
          className="tap text-fg-muted hover:bg-bg-sunken hover:text-fg mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="eyebrow mb-1">Textbook</p>
          <h1 className="text-fg text-2xl font-extrabold tracking-tight text-balance sm:text-3xl">
            {title}
          </h1>
        </div>
      </header>

      {error && (
        <p className="text-danger-strong dark:text-danger px-1 text-sm font-semibold" role="alert">
          {error}
        </p>
      )}

      {/* --------------------------------------------------- continue reading */}
      <Reveal>
        {next ? (
          <ContinueCard
            materialId={materialId}
            bookTitle={title}
            coverVersion={coverVersion}
            topic={next}
          />
        ) : (
          <Card variant="wash" tone="success" padding="md">
            <div className="flex items-center gap-3">
              <span
                className="bg-success/16 text-success-strong dark:text-success grid size-10 shrink-0 place-items-center rounded-xl"
                aria-hidden
              >
                <Check className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-fg text-sm font-bold">You have read every chapter</p>
                <p className="text-fg-muted mt-0.5 text-xs">
                  Tap any chapter below to open it again.
                </p>
              </div>
            </div>
          </Card>
        )}
      </Reveal>

      {/* --------------------------------------------------- how far through */}
      <Reveal delay={1}>
        <Card padding="md">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow mb-1 truncate">{title}</p>
              <p className="text-fg text-lg font-extrabold tracking-tight">Chapters</p>
            </div>
            <p className="text-fg text-lg font-extrabold tabular-nums">{progress.percent}%</p>
          </div>
          <ProgressBar
            value={progress.percent}
            className="mt-3"
            height="sm"
            label={`${progress.studied} of ${progress.total} chapters read`}
          />
          <p className="text-fg-muted mt-2 text-xs font-semibold tabular-nums">
            {progress.studied} of {progress.total} chapters read
          </p>
        </Card>
      </Reveal>

      {/* ------------------------------------------------------------ timeline */}
      <Reveal delay={2}>
        <section className="space-y-2.5">
          <SectionTitle
            action={
              <span className="text-2xs text-fg-subtle font-bold tabular-nums">
                {progress.total}
              </span>
            }
          >
            All chapters
          </SectionTitle>
          <Card padding="md">
            <ol className="relative">
              {topics.map((topic, index) => (
                <TimelineRow
                  key={topic.id}
                  topic={topic}
                  last={index === topics.length - 1}
                  onOpen={() => setOpenId(topic.id)}
                />
              ))}
            </ol>
          </Card>
        </section>
      </Reveal>

      {/* --------------------------------------------------------------- sheet */}
      <Sheet
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={open?.title ?? ''}
        description={open ? `Chapter ${open.position}` : undefined}
      >
        {open && (
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <BookCover
                title={title}
                materialId={materialId}
                coverVersion={coverVersion}
                size="md"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <Badge tone={open.studied ? 'success' : 'neutral'} size="sm">
                  {open.studied ? 'Studied' : 'Not studied yet'}
                </Badge>
                <p className="text-fg-muted text-xs font-semibold tabular-nums">
                  {topicPageCount(open)} {topicPageCount(open) === 1 ? 'page' : 'pages'}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <LinkButton
                href={`/materials/${materialId}/topics/${open.id}`}
                variant="primary"
                size="md"
                className="flex-1"
              >
                <BookOpen className="size-4" aria-hidden />
                Read
              </LinkButton>
              <Button
                type="button"
                variant={open.studied ? 'outline' : 'soft'}
                size="md"
                disabled={pending}
                onClick={() => void toggle(open)}
              >
                <Check className="size-4" aria-hidden />
                {open.studied ? 'Mark not studied' : 'Mark studied'}
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function TimelineRow({
  topic,
  last,
  onOpen,
}: {
  topic: ScreenTopic;
  last: boolean;
  onOpen: () => void;
}) {
  const pages = topicPageCount(topic);

  return (
    <li className="relative">
      {/* The thread between the numbers. Stops at the last one rather than trailing off. */}
      {!last && (
        <span className="bg-border absolute top-11 bottom-0 left-[1.4375rem] w-px" aria-hidden />
      )}
      <button
        type="button"
        onClick={onOpen}
        className="tap group hover:bg-bg-sunken relative flex w-full items-center gap-3.5 rounded-xl py-2.5 pr-2 pl-1 text-left transition-colors"
      >
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full text-xs font-extrabold tabular-nums',
            topic.studied
              ? 'bg-success-strong text-white'
              : 'border-border bg-bg-elevated text-fg-muted border',
          )}
          aria-hidden
        >
          {topic.studied ? <Check className="size-4" /> : topic.position}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn('block text-sm font-bold', topic.studied ? 'text-fg-muted' : 'text-fg')}
          >
            {topic.title}
          </span>
          <span className="text-fg-subtle mt-0.5 block text-xs font-semibold">
            Chapter {topic.position} · {pages} {pages === 1 ? 'page' : 'pages'}
            {topic.studied && ' · studied'}
          </span>
        </span>
        <ChevronRight
          className="text-fg-subtle group-hover:text-fg-muted size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
          aria-hidden
        />
      </button>
    </li>
  );
}

/**
 * Where to pick the book back up.
 *
 * The page line comes from the same `localStorage` entry the reader writes as it scrolls, so
 * the card and the reader can never disagree about where someone is. It is read through
 * `useSyncExternalStore` with a null server snapshot: the server has no idea what is in a
 * student's browser, and rendering a guess would be a hydration mismatch on every visit.
 */
function ContinueCard({
  materialId,
  bookTitle,
  coverVersion,
  topic,
}: {
  materialId: string;
  bookTitle: string;
  coverVersion: string | null;
  topic: ScreenTopic;
}) {
  const pages = topicPageCount(topic);
  const savedPage = useStoredPage(`textbook:${materialId}:${topic.id}:page`, pages);
  const percent = savedPage === null ? 0 : Math.round((savedPage / pages) * 100);

  return (
    <Link href={`/materials/${materialId}/topics/${topic.id}`} className="tap block">
      <Card variant="wash" tone="pulse" padding="md" interactive glow>
        <p className="eyebrow text-pulse-700 dark:text-pulse-300 mb-2.5">Continue reading</p>
        <div className="flex items-center gap-3.5">
          <BookCover
            title={bookTitle}
            materialId={materialId}
            coverVersion={coverVersion}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="text-fg truncate text-sm font-bold">{topic.title}</p>
            <p className="text-fg-muted mt-0.5 text-xs font-semibold tabular-nums">
              {savedPage === null
                ? `Chapter ${topic.position} · ${pages} ${pages === 1 ? 'page' : 'pages'}`
                : `Page ${savedPage} of ${pages} · ${percent}%`}
            </p>
            <ProgressBar value={percent} className="mt-2" height="xs" tone="pulse" />
          </div>
          <span
            className="bg-pulse-600 grid size-10 shrink-0 place-items-center rounded-full text-white shadow-md"
            aria-hidden
          >
            <ArrowRight className="size-4" />
          </span>
        </div>
      </Card>
    </Link>
  );
}

/** The reader's saved page for one chapter, or null until the browser has been asked. */
function useStoredPage(key: string, max: number): number | null {
  const subscribe = useCallback((onChange: () => void) => {
    // Another tab's reader moving is worth reflecting; this tab's is covered by navigation.
    window.addEventListener('storage', onChange);
    return () => window.removeEventListener('storage', onChange);
  }, []);

  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null; // private mode — the card simply shows the chapter length instead
    }
  }, [key]);

  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const page = Number(raw);
  if (!raw || !Number.isFinite(page) || page < 1) return null;
  return Math.min(page, max);
}
