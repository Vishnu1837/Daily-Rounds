'use client';

import {
  type BookDigest,
  type OutlineEntry,
  digestCharsFor,
  digestPageNumbers,
} from '@/lib/domain/chapter-plan';
import { TEXTBOOK_READER_HEADER } from '@/lib/domain/textbooks';

/**
 * Reading an uploaded textbook in the admin's browser, just enough to find its chapters.
 *
 * The book is already streaming into this tab for the chapter editor's page count, so the
 * digest is built here from the same document: the PDF's own bookmarks, resolved to physical
 * pages, and the first couple of hundred characters of each sampled page. That is what a
 * chapter boundary looks like from the outside — "CHAPTER 7 · Axilla" at the top of a page —
 * and it is a few dozen kilobytes to send, not a few hundred megabytes.
 *
 * A scanned book with no text layer produces empty pages; the digest says so honestly and
 * the bookmarks (or the admin) have to carry it.
 */

type PdfDocument = Awaited<ReturnType<(typeof import('pdfjs-dist'))['getDocument']>['promise']>;

/** How many pages are read at once. Enough to overlap range requests, few enough to be polite. */
const CONCURRENCY = 6;

export async function openTextbook(materialId: string) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  return pdfjs.getDocument({
    url: `/api/textbooks/${materialId}`,
    httpHeaders: { [TEXTBOOK_READER_HEADER]: '1' },
    rangeChunkSize: 64 * 1024,
    disableAutoFetch: true,
    disableStream: true,
    isEvalSupported: false,
  });
}

export async function buildBookDigest(
  doc: PdfDocument,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<BookDigest> {
  const outline = await readOutline(doc).catch(() => [] as OutlineEntry[]);

  const wanted = digestPageNumbers(doc.numPages);
  const texts = new Map<number, string>();
  let done = 0;
  let cursor = 0;
  onProgress(0, wanted.length);

  async function worker() {
    while (cursor < wanted.length) {
      if (signal?.aborted) return;
      const pageNumber = wanted[cursor++]!;
      texts.set(pageNumber, await readPageOpening(doc, pageNumber).catch(() => ''));
      done += 1;
      onProgress(done, wanted.length);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');

  return {
    numPages: doc.numPages,
    outline,
    pages: wanted.map((page) => ({ page, text: texts.get(page) ?? '' })),
  };
}

/**
 * The first few lines of a page's text layer, which is where a chapter announces itself —
 * or, in the front matter, most of the page, which is where the contents are listed.
 */
async function readPageOpening(doc: PdfDocument, pageNumber: number): Promise<string> {
  const limit = digestCharsFor(pageNumber);
  const page = await doc.getPage(pageNumber);
  try {
    const content = await page.getTextContent();
    let text = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      text += item.str + (item.hasEOL ? '\n' : ' ');
      if (text.length >= limit) break;
    }
    return text.replace(/\s+/g, ' ').trim().slice(0, limit);
  } finally {
    page.cleanup();
  }
}

/**
 * The bookmark tree, flattened, with each entry pointing at a 1-based physical page.
 *
 * A destination is either a name to look up or an explicit array whose first element is a
 * page reference (or, in some writers, a bare page index). Anything that does not resolve is
 * dropped — a bookmark to nowhere tells the model nothing.
 */
async function readOutline(doc: PdfDocument): Promise<OutlineEntry[]> {
  const tree = await doc.getOutline();
  if (!tree) return [];

  const entries: OutlineEntry[] = [];

  type Node = { title: string; dest: unknown; items: Node[] };
  async function walk(nodes: Node[], depth: number) {
    for (const node of nodes) {
      if (entries.length >= 2000) return;
      const page = await resolveDestination(doc, node.dest).catch(() => null);
      const title = node.title?.trim();
      if (page !== null && title) entries.push({ title: title.slice(0, 300), page, depth });
      if (node.items?.length && depth < 6) await walk(node.items, depth + 1);
    }
  }
  await walk(tree as Node[], 0);
  return entries;
}

async function resolveDestination(doc: PdfDocument, dest: unknown): Promise<number | null> {
  const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
  if (!Array.isArray(explicit) || explicit.length === 0) return null;
  const target = explicit[0];
  if (typeof target === 'number') return target + 1;
  if (target && typeof target === 'object') {
    return (await doc.getPageIndex(target as Parameters<PdfDocument['getPageIndex']>[0])) + 1;
  }
  return null;
}
