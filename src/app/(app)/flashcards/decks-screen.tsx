'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clock, Flame, Layers, Sparkles } from 'lucide-react';

import Folder from '@/components/flashcards/folder';
import { SubjectCarousel, type SubjectCard } from '@/components/flashcards/subject-carousel';
import { EmptyState } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import { cn } from '@/lib/cn';
import { deckProgress, estimatedMinutes } from '@/lib/domain/flashcards';
import { haptic } from '@/lib/haptics';
import { SUBJECTS, type SubjectEntry } from '@/lib/subjects';
import type { DeckSummary } from '@/server/queries/flashcards';

/**
 * Accent token → a hex the `<Folder />` can tint itself with. The subject's own accent, so
 * every folder in a section is the same colour — a drawer of same-coloured folders.
 */
const ACCENT_HEX: Record<string, string> = {
  rose: '#F43F5E',
  orange: '#F97316',
  amber: '#F59E0B',
  lime: '#65A30D',
  emerald: '#10B981',
  teal: '#14B8A6',
  cyan: '#06B6D4',
  sky: '#0EA5E9',
  blue: '#3B82F6',
  indigo: '#6366F1',
  violet: '#8B5CF6',
  fuchsia: '#D946EF',
  slate: '#64748B',
};

const FALLBACK_HEX = '#6366F1';

/** Accent + course order for a subject slug, from the catalogue. */
const SUBJECT_META = new Map<string, SubjectEntry>(SUBJECTS.map((s) => [s.slug, s]));

/** The bucket a deck with no subject falls into. */
const UNFILED_SLUG = '__unfiled__';

type SubjectGroup = {
  card: SubjectCard;
  decks: DeckSummary[];
};

/**
 * Fold the flat deck list into one group per subject, in course order.
 *
 * Decks arrive already filtered to this student's roadmap and pre-sorted (started, then
 * untouched, then finished) by `getDecks`; that order is preserved inside each group, so a
 * subject's shelf still leads with whatever the student had in progress.
 */
function groupBySubject(decks: DeckSummary[]): SubjectGroup[] {
  const groups = new Map<string, SubjectGroup>();
  const studyStreak = decks[0]?.studyStreak ?? 0;

  for (const deck of decks) {
    const slug = deck.subjectSlug ?? UNFILED_SLUG;
    let group = groups.get(slug);
    if (!group) {
      const meta = deck.subjectSlug ? SUBJECT_META.get(deck.subjectSlug) : undefined;
      group = {
        card: {
          slug,
          name: deck.subjectName ?? 'Other topics',
          accent: meta?.accent ?? 'slate',
          number: meta?.number ?? null,
          deckCount: 0,
          cardCount: 0,
          dueCount: 0,
          studyStreak,
        },
        decks: [],
      };
      groups.set(slug, group);
    }
    group.decks.push(deck);
    group.card.deckCount += 1;
    group.card.cardCount += deck.cardCount;
    group.card.dueCount += deck.due;
  }

  return [...groups.values()].sort((a, b) => {
    // Course order; the unfiled bucket always sinks to the end.
    const rank = (n: number | null) => n ?? 999;
    return rank(a.card.number) - rank(b.card.number) || a.card.name.localeCompare(b.card.name);
  });
}

/**
 * Flashcards opens onto subjects, not the whole deck catalogue.
 *
 * The first screen is a carousel of gradient subject cards; choosing one unfolds that
 * subject's decks — the same deck shelf as before, now scoped. It is one client component
 * with a `selected` slug rather than a route change: "a section opens" is exactly what an
 * in-place swap reads as, and Back on the deck shelf returns to the subjects without a
 * navigation.
 */
export function DecksScreen({ decks }: { decks: DeckSummary[] }) {
  const studyStreak = decks[0]?.studyStreak ?? 0;
  const dueTotal = decks.reduce((sum, deck) => sum + deck.due, 0);

  const groups = useMemo(() => groupBySubject(decks), [decks]);
  const [selected, setSelected] = useState<string | null>(null);
  const activeGroup = groups.find((g) => g.card.slug === selected) ?? null;

  if (decks.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow="Library"
          title="Flashcards"
          description="Short decks of recall, filed against the topics on your roadmap."
        />
        <div className="surface shadow-soft">
          <EmptyState
            icon={<Layers className="size-7" />}
            tone="iris"
            title="No decks for your topics yet"
            description="Decks appear here as your cohort files them against the topics on your roadmap. Your knowledge checks are in Materials in the meantime."
          />
        </div>
      </div>
    );
  }

  if (activeGroup) {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => {
            haptic('tap');
            setSelected(null);
          }}
          className="tap text-fg-muted hover:text-fg -mb-1 inline-flex items-center gap-1.5 px-1 text-sm font-bold transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All subjects
        </button>

        <PageHeader
          eyebrow={`${activeGroup.card.deckCount} ${activeGroup.card.deckCount === 1 ? 'deck' : 'decks'}`}
          title={activeGroup.card.name}
          description="Answer it in your head, then turn the card over. The ones you forget come back sooner."
        >
          {activeGroup.card.dueCount > 0 && (
            <span className="rounded-pill bg-pulse-500/12 text-pulse-700 dark:text-pulse-300 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold">
              <Sparkles className="size-3.5" aria-hidden />
              {activeGroup.card.dueCount} due today
            </span>
          )}
        </PageHeader>

        <ul className="grid grid-cols-2 gap-x-4 gap-y-7 pt-4 sm:grid-cols-3 lg:grid-cols-4">
          {activeGroup.decks.map((deck, i) => (
            <Reveal key={deck.id} delay={i} as="li">
              <DeckFolder
                deck={deck}
                colorHex={ACCENT_HEX[activeGroup.card.accent] ?? FALLBACK_HEX}
              />
            </Reveal>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Library"
        title="Flashcards"
        description="Pick a subject to open its decks. The ones you forget come back sooner."
      >
        <div className="flex flex-wrap items-center gap-2">
          {dueTotal > 0 && (
            <span className="rounded-pill bg-pulse-500/12 text-pulse-700 dark:text-pulse-300 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold">
              <Sparkles className="size-3.5" aria-hidden />
              {dueTotal} due today
            </span>
          )}
          {studyStreak >= 2 && (
            <span className="rounded-pill bg-flame-500/14 text-flame-700 dark:text-flame-300 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold tabular-nums">
              <Flame className="size-3.5" aria-hidden />
              {studyStreak} day run
            </span>
          )}
        </div>
      </PageHeader>

      <SubjectCarousel subjects={groups.map((g) => g.card)} onOpen={(slug) => setSelected(slug)} />
    </div>
  );
}

/**
 * One deck on a subject's shelf, drawn as a `<Folder />` (React Bits).
 *
 * The deck browser is a drawer of folders now, all tinted with the subject's accent. A
 * folder peeks its papers on hover — a glance at what is inside — and a click navigates
 * straight into the session; it never toggles open, because "open" here means "study this".
 * The title and counts live under the folder so the shelf is still readable at rest, and the
 * folder's own `aria-label` carries the same state for a screen reader.
 */
function DeckFolder({ deck, colorHex }: { deck: DeckSummary; colorHex: string }) {
  const router = useRouter();

  const progress = deckProgress(deck.mix);
  const started = progress.done > 0;
  const minutes = deck.estimatedMinutes || estimatedMinutes(deck.cardCount);

  function open() {
    haptic('commit');
    router.push(`/flashcards/${deck.id}`);
  }

  const label =
    `${deck.title}. ${deck.cardCount} cards, about ${minutes} minutes. ` +
    (started ? `${progress.done} of ${progress.total} seen. ` : 'Not started. ') +
    (deck.due > 0 ? `${deck.due} due. ` : '') +
    'Press to open.';

  return (
    <div
      className="flex flex-col items-center pt-8"
      onPointerEnter={() => router.prefetch(`/flashcards/${deck.id}`)}
    >
      <Folder
        color={colorHex}
        size={1.1}
        onActivate={open}
        ariaLabel={label}
        items={[
          <span key="a" className="text-[9px] font-bold text-slate-500">
            {deck.due > 0 ? `${deck.due} due` : started ? 'In progress' : 'New deck'}
          </span>,
          <MiniMeter key="b" deck={deck} />,
          <span key="c" className="text-[9px] font-bold text-slate-700">
            {started ? 'Continue →' : 'Start →'}
          </span>,
        ]}
      />

      <p className="text-fg mt-3 line-clamp-2 text-center text-sm font-bold text-balance">
        {deck.title}
      </p>
      <p className="text-2xs text-fg-muted mt-1 flex items-center gap-1.5 font-semibold tabular-nums">
        <span>{deck.cardCount} cards</span>
        <span className="bg-border size-1 rounded-full" aria-hidden />
        <span className="inline-flex items-center gap-0.5">
          <Clock className="size-3" aria-hidden />~{minutes} min
        </span>
      </p>
      <p className="text-2xs text-fg-subtle mt-0.5 font-semibold tabular-nums">
        {started ? `${progress.done}/${progress.total} seen` : 'Not started'}
        {deck.mix.mastered > 0 && (
          <span className="text-success-strong dark:text-success">
            {' '}
            · {deck.mix.mastered} mastered
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * The mastery meter, shrunk to sit on a folder's paper.
 *
 * Same three bands and colours as the deck shelf used before — mastered green, learning
 * indigo, difficult amber — just at paper scale. An untouched deck is a flat track.
 */
function MiniMeter({ deck }: { deck: DeckSummary }) {
  const segments = [
    { key: 'mastered', value: deck.mix.mastered, className: 'bg-emerald-500' },
    { key: 'learning', value: deck.mix.learning, className: 'bg-indigo-500' },
    { key: 'difficult', value: deck.mix.difficult, className: 'bg-amber-500' },
  ].filter((segment) => segment.value > 0);

  const total = deck.cardCount || 1;

  return (
    <span className="flex h-1 w-10 overflow-hidden rounded-full bg-slate-200" aria-hidden>
      {segments.map((segment) => (
        <span
          key={segment.key}
          className={cn('h-full', segment.className)}
          style={{ width: `${(segment.value / total) * 100}%` }}
        />
      ))}
    </span>
  );
}
