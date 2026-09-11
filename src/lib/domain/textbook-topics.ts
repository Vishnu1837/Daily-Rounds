/**
 * The rules a chapter list has to obey, and the small sums the book page shows.
 *
 * Kept pure and away from the database because the same rules are needed in three places:
 * the admin editor, which must say *why* a pasted plan is wrong before anything is written;
 * the server action, which cannot trust that the editor ran; and the tests, which would
 * otherwise need a database to ask whether page 0 is allowed.
 */

/** A topic as it arrives from the editor or a mapping file, before it has an id. */
export type TopicDraft = {
  position: number;
  title: string;
  /** Inclusive, 1-based, physical PDF page index. */
  startPage: number;
  /** Inclusive, and never before `startPage`. */
  endPage: number;
  curriculumRef?: string | null;
};

export const MAX_TOPICS = 400;
export const MAX_TOPIC_TITLE = 200;

/**
 * Everything wrong with a chapter list, in the order a person would fix it.
 *
 * Returns every problem rather than the first, because an admin pasting a generated mapping
 * wants the list of lines to correct, not twenty-two rounds of save-and-see.
 *
 * `numPages` is the real page count of the uploaded PDF when the editor knows it — it opens
 * the book to find out — and null before it does. A plan cannot be checked against a book
 * that has not loaded, so the range check is simply skipped rather than guessed at.
 */
export function validateTopicPlan(topics: TopicDraft[], numPages: number | null): string[] {
  const errors: string[] = [];

  if (topics.length === 0) return ['Add at least one topic, or delete the list to remove all.'];
  if (topics.length > MAX_TOPICS) {
    errors.push(`A book can have at most ${MAX_TOPICS} topics; this list has ${topics.length}.`);
  }

  topics.forEach((topic, index) => {
    const where = `Topic ${index + 1}`;
    const title = topic.title.trim();

    if (!title) errors.push(`${where} has no title.`);
    else if (title.length > MAX_TOPIC_TITLE) {
      errors.push(
        `${where} (“${title.slice(0, 30)}…”) has a title longer than ${MAX_TOPIC_TITLE} characters.`,
      );
    }

    if (!Number.isInteger(topic.startPage) || !Number.isInteger(topic.endPage)) {
      errors.push(`${where} has a page that is not a whole number.`);
      return;
    }
    if (topic.startPage < 1)
      errors.push(`${where} starts at page ${topic.startPage}; pages start at 1.`);
    if (topic.endPage < topic.startPage) {
      errors.push(
        `${where} ends at page ${topic.endPage}, before it starts at ${topic.startPage}.`,
      );
    }
    if (numPages !== null && topic.endPage > numPages) {
      errors.push(`${where} ends at page ${topic.endPage}; the book has ${numPages} pages.`);
    }
  });

  // Positions are what the timeline counts by, so they must be 1..n with nothing missing.
  const positions = topics.map((t) => t.position);
  const expected = topics.map((_, i) => i + 1);
  if (positions.join(',') !== expected.join(',')) {
    errors.push(`Positions must run 1 to ${topics.length} in order, with no gaps or repeats.`);
  }

  /*
   * Chapters must move forward. They may *share* a page — a chapter ending halfway down
   * page 40 leaves the rest of page 40 to the next one — but a chapter that starts before
   * the previous one started is a mapping error, not a book.
   */
  for (let i = 1; i < topics.length; i += 1) {
    const prev = topics[i - 1]!;
    const here = topics[i]!;
    if (here.startPage < prev.startPage) {
      errors.push(
        `Topic ${i + 1} starts at page ${here.startPage}, before topic ${i} at page ${prev.startPage}.`,
      );
    } else if (here.startPage < prev.endPage) {
      errors.push(
        `Topic ${i + 1} starts at page ${here.startPage}, inside topic ${i} which runs to ${prev.endPage}. Overlapping by more than the shared boundary page is usually a mistake.`,
      );
    }
  }

  return errors;
}

/** How many pages a student will scroll through in this topic. */
export function topicPageCount(topic: { startPage: number; endPage: number }): number {
  return topic.endPage - topic.startPage + 1;
}

export type TopicProgress = {
  studied: number;
  total: number;
  /** 0–100, rounded. 0 when the book has no topics, never NaN. */
  percent: number;
};

export function summariseTopicProgress(
  topics: { id: string }[],
  studiedIds: ReadonlySet<string>,
): TopicProgress {
  const total = topics.length;
  const studied = topics.reduce((n, t) => n + (studiedIds.has(t.id) ? 1 : 0), 0);
  return { studied, total, percent: total === 0 ? 0 : Math.round((studied / total) * 100) };
}

/**
 * Which topic the "Continue reading" card should offer.
 *
 * The first unstudied topic in reading order — not the most recently opened one. A student
 * who dips into chapter 19 to look something up has not abandoned chapter 3, and a card
 * that follows their last tap would quietly move the finish line every time they browsed.
 * When every topic is read there is nothing to continue, and the card gives way to a
 * finished state.
 */
export function nextUnstudiedTopic<T extends { id: string }>(
  topics: T[],
  studiedIds: ReadonlySet<string>,
): T | null {
  return topics.find((t) => !studiedIds.has(t.id)) ?? null;
}
