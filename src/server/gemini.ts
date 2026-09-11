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
const TIMEOUT_MS = 120_000;

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

const SYSTEM_PROMPT = `You split medical textbooks into chapters for a study app.

You are given a book's page-by-page digest: the first lines of text on each physical page,
and the PDF's own bookmarks when it has any. You return the chapters a student would read
one at a time.

Rules:
- Page numbers are PHYSICAL PDF pages, counting the cover as page 1. Ignore the numbers
  printed on the paper — front matter puts them out of step, sometimes by 20 pages or more.
  When the digest shows a printed number, use it only to work out the offset.
- Return the page where each chapter's content BEGINS, not where it is listed in the
  contents.
- Chapters must be in reading order and each must start after the one before it.
- Prefer the book's own divisions: numbered chapters, or the top level of its bookmarks.
  Do not invent finer sections, and do not merge two real chapters into one.
- Front matter (cover, preface, contents) and back matter (index, appendices) are chapters
  only when a student would sit and read them. An index is not.
- Titles are the chapter's own name, without the word "Chapter" and without its number.
- Aim for between 5 and 60 chapters. A 900-page atlas has chapters; it does not have 400.
- If the digest is too sparse to be sure, still answer with your best division and say so in
  the note.`;

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
