import 'server-only';

import {
  type BookDigest,
  type NormalisedPlan,
  normaliseChapterPlan,
} from '@/lib/domain/chapter-plan';

import { geminiApiKey } from './settings';

/**
 * Asking Gemini where the chapters of an uploaded textbook begin.
 *
 * ## Why a digest and not the PDF
 *
 * The file is already in a private bucket and is already several hundred megabytes. Sending
 * it to a model would mean pulling all of it through a serverless function, paying for the
 * upload, and waiting on a file API — to answer a question that lives in about forty
 * kilobytes of text. The admin's browser has the book open anyway (it opens it to read the
 * page count), so it reads the first lines of each page there and sends that.
 *
 * ## Why start pages only
 *
 * The model is asked for a title and a *start* page per chapter, never a range. Ends are
 * arithmetic — the page before the next chapter — and arithmetic asked of a language model
 * comes back subtly wrong in a way that is tedious to review. `normaliseChapterPlan` does
 * the sums, so the worst a bad answer can be is a boundary in the wrong place, which is
 * exactly what the review step in front of publishing is for.
 *
 * Nothing here writes to the database and nothing here publishes. It returns a proposal.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Fast, cheap, and long-context enough for a sampled 900-page book. */
export const GEMINI_MODEL = 'gemini-2.5-flash';

/** A book is a long prompt and a long answer; the default fetch timeout is not the limit. */
const TIMEOUT_MS = 240_000;

export type ChapterProposal =
  { ok: true; plan: NormalisedPlan; model: string } | { ok: false; message: string };

export async function proposeChapters(
  bookTitle: string,
  digest: BookDigest,
): Promise<ChapterProposal> {
  const key = await geminiApiKey();
  if (!key) {
    return {
      ok: false,
      message: 'No Gemini API key is set. Add GEMINI_API_KEY to the deployment environment.',
    };
  }

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt(bookTitle, digest) }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          chapters: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                startPage: { type: 'INTEGER' },
              },
              required: ['title', 'startPage'],
            },
          },
          note: { type: 'STRING' },
        },
        required: ['chapters'],
      },
    },
  };

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.error('[daily-rounds] gemini request failed:', error);
    return { ok: false, message: 'Could not reach Gemini. Check the connection and try again.' };
  }

  if (!response.ok) {
    /*
     * The status is the only part of a failure worth repeating to an admin, and the two that
     * are actually actionable are named. The body can carry the key's own metadata, so it is
     * logged rather than surfaced.
     */
    const detail = await response.text().catch(() => '');
    console.error('[daily-rounds] gemini error', response.status, detail.slice(0, 500));
    if (response.status === 400 || response.status === 403) {
      return { ok: false, message: 'Gemini rejected the API key. Check it and save it again.' };
    }
    if (response.status === 429) {
      return { ok: false, message: 'Gemini is rate-limiting this key. Try again in a minute.' };
    }
    return { ok: false, message: `Gemini answered ${response.status}. Try again.` };
  }

  const payload = (await response.json().catch(() => null)) as GeminiResponse | null;
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('');
  if (!text) return { ok: false, message: 'Gemini returned an empty answer. Try again.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: 'Gemini did not return readable JSON. Try again.' };
  }

  const plan = normaliseChapterPlan(parsed, digest.numPages);
  if (plan.topics.length === 0) {
    return {
      ok: false,
      message: 'Gemini could not find chapters in this book. Enter them by hand.',
    };
  }

  // The model's own caveat, if it left one, reads first — the rest are this app's repairs.
  const note = (parsed as { note?: unknown }).note;
  const notes = [typeof note === 'string' ? note.trim() : '', ...plan.notes].filter(Boolean);

  return { ok: true, plan: { ...plan, notes }, model: GEMINI_MODEL };
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

/*
 * Chapter-sized: the book's own top-level divisions — "General anatomy", "Bones", "Joints" —
 * and nothing finer. The sections inside a chapter are how the author organised it, not how a
 * cohort navigates it, and a 178-row list of them buries the book. The method below finds the
 * printed-to-physical offset from the contents, then confirms each chapter's first page from
 * the running header every page carries.
 */
const SYSTEM_PROMPT = `You split medical textbooks into chapters for a study app.

You are given a book's page-by-page digest: the text at the top of each physical page (for the
first 40 pages, most of the page, so the contents listing is readable), and the PDF's own
bookmarks when it has any. You return the book's top-level chapters.

Method:
1. Read the contents pages. They give the book's top-level chapters (or parts), each with a
   PRINTED page number, and the sections within each.
2. Work out the offset between printed and physical pages by finding a title from the
   contents in the page digest (running headers at the top of a page usually repeat the
   chapter or section name). Check the offset in several places across the book — it is
   normally constant, but confirm it rather than assuming.
3. Walk the page digest. A chapter starts on the first physical page whose header shows it.

Rules:
- Page numbers are PHYSICAL PDF pages, counting the cover as page 1. Never return a printed
  page number.
- Return only the TOP level of the book's own division: one entry per chapter or part, e.g.
  "General anatomy", "Bones", "Joints", "Muscles". Never split a chapter into its sections,
  and never merge two real chapters into one.
- A chapter's review questions, figures and schemes belong to that chapter, not their own entry.
- Skip cover, title pages, contents, prefaces, acknowledgements, author lists, and the index.
- Titles are the chapter's own name, in English, without numbers, the word "Chapter", or a
  section name after it.
- Chapters must be in reading order and each must start on a LATER page than the one before.
- Aim for between 5 and 40 chapters. An anatomy atlas has about a dozen; it does not have 150.
- If the digest is too sparse to be sure (for example a scanned book with no text), still
  answer with your best division and say so in the note.`;

function userPrompt(bookTitle: string, digest: BookDigest): string {
  const outline =
    digest.outline.length > 0
      ? digest.outline
          .slice(0, 600)
          .map((entry) => `${'  '.repeat(Math.min(entry.depth, 3))}p${entry.page} · ${entry.title}`)
          .join('\n')
      : '(this PDF has no bookmarks)';

  const pages = digest.pages
    .map((page) => `p${page.page}: ${page.text.replace(/\s+/g, ' ').trim()}`)
    .join('\n');

  return `Book: ${bookTitle}
Physical pages: ${digest.numPages}

--- PDF bookmarks ---
${outline}

--- Page digest (first lines of each sampled page) ---
${pages}`;
}
