/**
 * Turning "what a model said the chapters are" into a chapter list this app will accept.
 *
 * A language model handed a table of contents returns something *shaped* like a chapter
 * list: titles in order, a page number against each, the odd hallucinated page 0, an end
 * page that runs past the back cover, two chapters claiming the same start. All of that is
 * ordinary, and none of it is a reason to make an admin retype twenty-two rows.
 *
 * So the model is asked for the one thing it is actually good at — where each chapter
 * *starts*, and what it is called — and the arithmetic is done here: sort, clamp, derive
 * each end from the next start, renumber. What comes out is a plan that passes
 * `validateTopicPlan` or is honestly rejected by it; what never happens is a generated
 * number reaching the database without this pass.
 *
 * Pure, and separate from the Gemini client, because the repair rules are the part worth
 * testing and they must not need a network or an API key to run.
 */

import { MAX_TOPIC_TITLE, MAX_TOPICS, type TopicDraft } from './textbook-topics';

/** One page as the browser summarised it for the model: the first lines of its text. */
export type PageDigest = {
  /** 1-based physical page index. */
  page: number;
  text: string;
};

/** One entry of the PDF's own bookmark tree, resolved to a physical page. */
export type OutlineEntry = {
  title: string;
  page: number;
  /** 0 for a top-level bookmark. Deeper entries are sections within a chapter. */
  depth: number;
};

/** Everything the browser found in the book, sent to the server to be reasoned about. */
export type BookDigest = {
  numPages: number;
  outline: OutlineEntry[];
  pages: PageDigest[];
};

/** A chapter as the model is asked to return it: a name and where it begins. */
export type ChapterStart = {
  title: string;
  startPage: number;
};

/**
 * A model's answer, repaired into a plan.
 *
 * `notes` is what was changed, in the admin's language rather than the parser's — it is
 * shown above the draft so the person reviewing knows which rows were touched by arithmetic
 * rather than by the model.
 */
export type PlannedTopic = TopicDraft & { curriculumRef: string | null };

export type NormalisedPlan = {
  topics: PlannedTopic[];
  notes: string[];
};

/**
 * Reads whatever the model returned and makes a chapter list out of it.
 *
 * Accepts a bare array, or an object with a `chapters` key, because both come back from a
 * model asked for JSON and arguing with it costs more than accepting both. Anything without
 * a usable title and start page is dropped rather than guessed at.
 */
export function normaliseChapterPlan(raw: unknown, numPages: number): NormalisedPlan {
  const notes: string[] = [];
  const items = extractArray(raw);
  if (items === null) return { topics: [], notes: ['The model did not return a chapter list.'] };

  const starts: ChapterStart[] = [];
  let dropped = 0;

  for (const item of items) {
    if (typeof item !== 'object' || item === null) {
      dropped += 1;
      continue;
    }
    const record = item as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const startPage = Math.round(Number(record.startPage ?? record.page));
    if (!title || !Number.isFinite(startPage)) {
      dropped += 1;
      continue;
    }
    starts.push({ title: title.slice(0, MAX_TOPIC_TITLE), startPage });
  }

  if (dropped > 0) {
    notes.push(`${dropped} ${dropped === 1 ? 'entry' : 'entries'} had no usable title or page.`);
  }

  return { topics: chaptersFromStarts(starts, numPages, notes), notes };
}

/**
 * The PDF's own bookmarks as a chapter list.
 *
 * The fallback when no API key is set, and the better answer whenever a publisher actually
 * shipped an outline — a bookmark tree is the author's own division of the book, which is
 * the thing being guessed at otherwise. Only top-level entries become chapters: the nested
 * ones are sections, and a 400-row list of every heading is not a reading plan.
 */
export function chaptersFromOutline(outline: OutlineEntry[], numPages: number): PlannedTopic[] {
  const tops = outline.filter((entry) => entry.depth === 0 && entry.title.trim());
  const usable = tops.length >= 2 ? tops : outline.filter((entry) => entry.title.trim());
  return chaptersFromStarts(
    usable.map((entry) => ({ title: entry.title.trim(), startPage: entry.page })),
    numPages,
    [],
  );
}

/**
 * Start pages into ranges.
 *
 * The rules, in the order they fire: clamp every start into the book, sort by page (a model
 * that lists the appendix before chapter nine is reordered, not rejected), drop a repeat of
 * a page already claimed, end each chapter on the page before the next one starts, and end
 * the last one on the last page of the book.
 *
 * A chapter whose next sibling starts on the same page would end before it began, so the
 * repeat is dropped instead: two chapters truly sharing a start page are indistinguishable
 * here, and keeping the first one named is better than inventing a boundary.
 */
function chaptersFromStarts(
  starts: ChapterStart[],
  numPages: number,
  notes: string[],
): PlannedTopic[] {
  const last = Math.max(1, Math.floor(numPages) || 1);

  let clamped = 0;
  const inRange = starts.map((chapter) => {
    const page = Math.min(Math.max(chapter.startPage, 1), last);
    if (page !== chapter.startPage) clamped += 1;
    return { ...chapter, startPage: page };
  });
  if (clamped > 0) {
    notes.push(
      `${clamped} ${clamped === 1 ? 'chapter was' : 'chapters were'} moved inside the ${last} pages this book has.`,
    );
  }

  // Stable by page: equal pages keep the order the model listed them in.
  const sorted = [...inRange].sort((a, b) => a.startPage - b.startPage);

  const unique: ChapterStart[] = [];
  for (const chapter of sorted) {
    if (unique.some((kept) => kept.startPage === chapter.startPage)) continue;
    unique.push(chapter);
  }
  const duplicates = sorted.length - unique.length;
  if (duplicates > 0) {
    notes.push(
      `${duplicates} ${duplicates === 1 ? 'chapter' : 'chapters'} started on a page already taken and ${duplicates === 1 ? 'was' : 'were'} dropped.`,
    );
  }

  const capped = unique.slice(0, MAX_TOPICS);
  if (unique.length > capped.length) {
    notes.push(`Only the first ${MAX_TOPICS} chapters were kept.`);
  }

  return capped.map((chapter, index) => {
    const next = capped[index + 1];
    return {
      position: index + 1,
      title: chapter.title.slice(0, MAX_TOPIC_TITLE),
      startPage: chapter.startPage,
      endPage: next ? Math.max(chapter.startPage, next.startPage - 1) : last,
      curriculumRef: null,
    };
  });
}

function extractArray(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object' && raw !== null) {
    const record = raw as Record<string, unknown>;
    for (const key of ['chapters', 'topics', 'items']) {
      const value = record[key];
      if (Array.isArray(value)) return value;
    }
  }
  return null;
}

/**
 * How much of the book to send.
 *
 * The digest is first lines, not full pages: a chapter opening announces itself in its first
 * few lines and the rest is prose the model does not need to see to find a boundary. Even
 * so, a 900-page atlas at 240 characters a page is a large prompt, so pages are sampled
 * down to a budget — front matter, where the contents page lives, is kept whole.
 */
export const DIGEST_CHARS_PER_PAGE = 240;
export const DIGEST_MAX_PAGES = 700;
export const DIGEST_FRONT_MATTER_PAGES = 40;

/** Which physical pages the browser should read, for a book of this length. */
export function digestPageNumbers(numPages: number): number[] {
  const total = Math.max(1, Math.floor(numPages) || 1);
  if (total <= DIGEST_MAX_PAGES) return Array.from({ length: total }, (_, i) => i + 1);

  const front = Math.min(DIGEST_FRONT_MATTER_PAGES, total);
  const pages = Array.from({ length: front }, (_, i) => i + 1);
  const remaining = DIGEST_MAX_PAGES - front;
  const step = (total - front) / remaining;
  for (let i = 0; i < remaining; i += 1) {
    const page = Math.min(total, front + Math.round(i * step) + 1);
    if (page !== pages[pages.length - 1]) pages.push(page);
  }
  return pages;
}
