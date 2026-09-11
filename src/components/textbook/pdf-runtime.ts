'use client';

import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';

import { TEXTBOOK_READER_HEADER } from '@/lib/domain/textbooks';

/**
 * Getting a hosted textbook open, in as few round trips as it can be done in.
 *
 * Opening a book used to be a queue of things that each had to finish before the next could
 * start: hydrate, download the PDF.js bundle, stand up its worker, download the worker,
 * *then* let PDF.js ask the server what the file is, *then* let it read the cross-reference
 * table, and only then lay out a page. On a phone on hospital wifi that queue is the loading
 * screen. This module exists to collapse it.
 *
 * Three things happen here that did not before.
 *
 * **The bundle is fetched before it is needed.** `warmPdfjs` starts the import as soon as a
 * student shows intent — a finger down on a cover, a chapter list on screen — so the ~1.4 MB
 * of library and worker is arriving while the shelf animation plays and the server renders
 * the page. By the time the reader mounts it is usually already there.
 *
 * **The server is never asked what it already told us.** PDF.js's own network layer opens a
 * book by issuing a plain, range-less GET, reading the response headers, and then throwing
 * the response away — a wasted whole-object read of a 200 MB atlas, and a round trip every
 * later request has to queue behind. Feeding it a `PDFDataRangeTransport` instead means it
 * never makes that request: it starts from bytes we already hold, and everything after is a
 * range. The first chunk is fetched here, in parallel with the bundle download, and the
 * file's true length is read off that chunk's `Content-Range` rather than trusted from a
 * database column that an admin's re-upload could have left stale.
 *
 * **A book stays open between chapters.** Finishing chapter 4 and tapping chapter 5 used to
 * throw the document away and rebuild it from nothing. The document is the expensive part —
 * it is the cross-reference table, the page tree, and every chunk already read — and none of
 * it changed. So it is kept, reference-counted, for a minute after the last reader lets go.
 *
 * What is deliberately unchanged: every byte still arrives through
 * `/api/textbooks/[materialId]`, one authorised range at a time. Nothing here caches bytes
 * anywhere a later visitor could find them, and a student removed from a cohort mid-chapter
 * still stops getting pages on the next range they scroll into.
 */

/** PDF.js fetches in chunks this size. Big enough that a scanned page is one or two trips. */
export const RANGE_CHUNK = 512 * 1024;

/** How long an unwatched document is kept open, in case the student comes back to the book. */
const IDLE_TTL_MS = 60_000;

/** Books held open at once. Two covers "back to the shelf and into another book", and no more. */
const MAX_OPEN = 2;

type Pdfjs = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<Pdfjs> | null = null;

/**
 * The PDF.js module, loaded once per tab.
 *
 * The worker URL is resolved as soon as the module lands rather than at `getDocument` time,
 * so the browser starts pulling the worker file while the main bundle is still being parsed
 * instead of after it.
 */
export function loadPdfjs(): Promise<Pdfjs> {
  pdfjsPromise ??= import('pdfjs-dist').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
    return pdfjs;
  });
  return pdfjsPromise;
}

/**
 * Start loading PDF.js because a student looks likely to read something.
 *
 * Safe to call from anywhere, as often as you like: it is the same promise every time and
 * nothing awaits it. A student who never opens a book has paid for a background download
 * they did not use, which is why this is called on intent — a tap, a chapter list on screen —
 * and not from the shell on every page of the app.
 */
export function warmPdfjs(): void {
  void loadPdfjs().catch(() => {
    // A failed warm is not something anyone can act on; the reader will try again and report.
  });
}

/** An error carrying the HTTP status that caused it, so the reader can tell 404 from 500. */
class TextbookFetchError extends Error {
  constructor(readonly status: number) {
    super(`Textbook request failed: ${status}`);
    this.name = 'TextbookFetchError';
  }
}

async function fetchRange(
  materialId: string,
  begin: number,
  endExclusive: number,
  signal: AbortSignal,
): Promise<{ bytes: Uint8Array; total: number | null }> {
  const response = await fetch(`/api/textbooks/${materialId}`, {
    signal,
    headers: {
      [TEXTBOOK_READER_HEADER]: '1',
      Range: `bytes=${begin}-${endExclusive - 1}`,
    },
  });
  if (response.status !== 200 && response.status !== 206) {
    throw new TextbookFetchError(response.status);
  }

  /*
   * `bytes 0-524287/104857600` — the only statement of the file's real length worth
   * trusting, because it comes from the store holding the bytes rather than from a row
   * describing them. A book smaller than one chunk answers 206 for the whole of itself, so
   * the 200 fallback is only ever reached by a store that ignored the range entirely.
   */
  const match = /\/(\d+)\s*$/.exec(response.headers.get('Content-Range') ?? '');
  const declared = response.headers.get('Content-Length');
  const raw = match
    ? Number(match[1])
    : response.status === 200 && declared
      ? Number(declared)
      : NaN;

  const buffer = await response.arrayBuffer();
  return { bytes: new Uint8Array(buffer), total: Number.isFinite(raw) ? raw : null };
}

/* ------------------------------------------------------------------- transport */

/**
 * Feeds PDF.js the bytes it asks for, and nothing else.
 *
 * Every read is a fresh `fetch` carrying the reader header, so the route re-checks
 * membership on each one exactly as it did when PDF.js owned the networking.
 *
 * A failed read has nowhere to go in PDF.js's transport contract: `onDataRange` is the only
 * way back, and never calling it leaves the document waiting forever. So a failure is
 * recorded and the loading task destroyed, which rejects whatever was waiting with an error
 * the reader can read a status off.
 */
type Transport = InstanceType<Pdfjs['PDFDataRangeTransport']> & {
  failure: TextbookFetchError | null;
  task: PDFDocumentLoadingTask | null;
};

function makeTransport(
  pdfjs: Pdfjs,
  materialId: string,
  length: number,
  head: Uint8Array,
  controller: AbortController,
): Transport {
  class TextbookTransport extends pdfjs.PDFDataRangeTransport {
    failure: TextbookFetchError | null = null;
    /** Set once the loading task exists; destroying it is how a failure reaches the reader. */
    task: PDFDocumentLoadingTask | null = null;

    override requestDataRange(begin: number, end: number): void {
      void (async () => {
        try {
          const { bytes } = await fetchRange(materialId, begin, end, controller.signal);
          this.onDataRange(begin, bytes);
        } catch (error) {
          if (controller.signal.aborted) return;
          this.failure = error instanceof TextbookFetchError ? error : new TextbookFetchError(0);
          void this.task?.destroy();
        }
      })();
    }

    override abort(): void {
      controller.abort();
    }
  }

  /*
   * `progressiveDone` tells PDF.js the head passed here is all the sequential data there
   * will ever be, so it goes straight to ranges instead of waiting on a stream that is
   * never coming. The head is not wasted: anything PDF.js wants inside the first chunk —
   * the `%PDF` header and the first objects — is answered without a request at all.
   */
  return new TextbookTransport(length, head, true) as Transport;
}

/* --------------------------------------------------------------- document cache */

type Entry = {
  promise: Promise<PDFDocumentProxy>;
  destroy: () => void;
  refs: number;
  idle: ReturnType<typeof setTimeout> | null;
};

const entries = new Map<string, Entry>();

/** Drops the least recently opened unheld documents once more than `MAX_OPEN` are around. */
function evictIdle() {
  for (const [id, entry] of entries) {
    if (entries.size <= MAX_OPEN) return;
    if (entry.refs > 0) continue;
    if (entry.idle) clearTimeout(entry.idle);
    entries.delete(id);
    entry.destroy();
  }
}

function open(materialId: string): Entry {
  const controller = new AbortController();
  let cleanup = () => controller.abort();

  const promise = (async () => {
    /*
     * The head and the library are fetched at the same time rather than one after the
     * other. The head is the round trip that used to sit behind the whole bundle download;
     * overlapping them is most of what makes a book open quickly on a slow connection.
     */
    const [pdfjs, head] = await Promise.all([
      loadPdfjs(),
      fetchRange(materialId, 0, RANGE_CHUNK, controller.signal),
    ]);

    const transport = makeTransport(
      pdfjs,
      materialId,
      head.total ?? head.bytes.byteLength,
      head.bytes,
      controller,
    );
    const task = pdfjs.getDocument({
      range: transport,
      rangeChunkSize: RANGE_CHUNK,
      disableAutoFetch: true,
      disableStream: true,
      isEvalSupported: false,
    });
    transport.task = task;
    cleanup = () => {
      controller.abort();
      void task.destroy();
    };

    try {
      return await task.promise;
    } catch (error) {
      // A destroyed task rejects with "Worker was destroyed"; the transport knows why.
      throw transport.failure ?? error;
    }
  })();

  const entry: Entry = { promise, destroy: () => cleanup(), refs: 0, idle: null };

  // A book that failed to open is not worth keeping: the next attempt should really retry.
  promise.catch(() => {
    if (entries.get(materialId) === entry) entries.delete(materialId);
  });

  return entry;
}

/**
 * The open document for a book, opening it if nobody has it open already.
 *
 * Every caller must `releaseTextbook` when it is done — the reader does it on unmount — or
 * the document is held for the life of the tab.
 */
export function acquireTextbook(materialId: string): Promise<PDFDocumentProxy> {
  let entry = entries.get(materialId);
  if (!entry) {
    entry = open(materialId);
    entries.set(materialId, entry);
  }
  if (entry.idle) {
    clearTimeout(entry.idle);
    entry.idle = null;
  }
  entry.refs += 1;
  evictIdle();
  return entry.promise;
}

export function releaseTextbook(materialId: string): void {
  const entry = entries.get(materialId);
  if (!entry || entry.refs === 0) return;
  entry.refs -= 1;
  if (entry.refs > 0 || entry.idle) return;
  entry.idle = setTimeout(() => {
    if (entries.get(materialId) !== entry || entry.refs > 0) return;
    entries.delete(materialId);
    entry.destroy();
  }, IDLE_TTL_MS);
}

/** The HTTP status behind a failed open, when there was one. */
export function statusOf(error: unknown): number | undefined {
  if (error instanceof TextbookFetchError) return error.status;
  return (error as { status?: number } | null)?.status;
}
