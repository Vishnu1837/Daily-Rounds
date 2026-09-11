'use client';

import { type ReactNode, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { ArrowLeft, BookLock, Minus, Plus } from 'lucide-react';

import { useBookArrived } from '@/components/textbook/book-opening';
import { Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { cn } from '@/lib/cn';
import { TEXTBOOK_READER_HEADER } from '@/lib/domain/textbooks';

/**
 * Reads a hosted textbook inside the app, and only inside the app.
 *
 * There is no file here to save. PDF.js pulls byte ranges through
 * `/api/textbooks/[materialId]` — which re-checks membership on every one — and paints each
 * page onto a canvas. No text layer is built, so there is nothing to select and copy; the
 * context menu, Ctrl+S and Ctrl+P are all switched off while the reader is open.
 *
 * None of that can stop a determined student with a camera or a screenshot key, and it does
 * not pretend to. What it can do is make every copy say whose it was: the reader's name and
 * email are drawn into the page pixels themselves, not layered over them, so removing a
 * `<div>` in devtools does not remove the stamp.
 *
 * ## Cost
 *
 * A 200 MB atlas is never downloaded whole. `disableAutoFetch` stops PDF.js from filling in
 * the rest of the file in the background, and only the pages within a screen of the
 * viewport hold a canvas at all — so a thousand-page book costs the pages actually read.
 *
 * ## Reading one chapter
 *
 * Given a `range`, the reader lays out only those pages. It is the same document and the
 * same byte-range fetches — the file is never split — so chapter 12 costs chapter 12 and
 * nothing before it. Everything the reader counts and remembers becomes chapter-relative:
 * page 3 of 4, not page 138 of 900, because the second number is not one a student reading
 * a chapter has any use for.
 */

const ZOOMS = [0.6, 0.8, 1, 1.25, 1.5, 2, 2.5];
/** Pages never grow wider than this at 100%; a 1,400px-wide page is not easier to read. */
const MAX_PAGE_WIDTH = 880;
/** PDF.js fetches in chunks this size. Big enough that a scanned page is one or two trips. */
const RANGE_CHUNK = 512 * 1024;

type Status = 'loading' | 'ready' | 'denied' | 'error';

export function TextbookReader({
  materialId,
  title,
  watermark,
  backHref,
  range = null,
  resumeKey,
  footer,
}: {
  materialId: string;
  title: string;
  /** Who is reading — drawn into every page. */
  watermark: string;
  backHref: string;
  /** Inclusive, 1-based physical page bounds. Null reads the whole book. */
  range?: { startPage: number; endPage: number } | null;
  /** Distinguishes one chapter's resume point from another's. Defaults to the book's. */
  resumeKey?: string;
  /** Rendered under the last page — where a chapter offers "mark studied" and "next". */
  footer?: ReactNode;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [baseAspect, setBaseAspect] = useState(1.414);
  const [aspects, setAspects] = useState<Record<number, number>>({});
  const [zoomIndex, setZoomIndex] = useState(ZOOMS.indexOf(1));
  const [trackWidth, setTrackWidth] = useState(0);
  const [current, setCurrent] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  useBookArrived(materialId);

  const trackRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const storageKey = `textbook:${resumeKey ?? materialId}:page`;
  const rangeStart = range?.startPage ?? null;
  const rangeEnd = range?.endPage ?? null;

  /* ------------------------------------------------------------ open the book */
  useEffect(() => {
    let cancelled = false;
    let loadingTask: { destroy: () => Promise<void> } | null = null;

    (async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();

      const task = pdfjs.getDocument({
        url: `/api/textbooks/${materialId}`,
        httpHeaders: { [TEXTBOOK_READER_HEADER]: '1' },
        rangeChunkSize: RANGE_CHUNK,
        disableAutoFetch: true,
        disableStream: true,
        isEvalSupported: false,
      });
      // Unmounted while the library was still loading: nobody will call destroy for us.
      if (cancelled) {
        task.promise.catch(() => {}); // rejects with "Worker was destroyed" — expected
        void task.destroy();
        return;
      }
      loadingTask = task;

      try {
        const loaded = await task.promise;
        if (cancelled) return;
        const first = await loaded.getPage(Math.min(rangeStart ?? 1, loaded.numPages));
        const viewport = first.getViewport({ scale: 1 });
        if (cancelled) return;
        setBaseAspect(viewport.height / viewport.width);
        setDoc(loaded);
        setStatus('ready');
      } catch (error) {
        if (cancelled) return;
        const status = (error as { status?: number } | null)?.status;
        setStatus(status === 404 ? 'denied' : 'error');
      }
    })();

    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [materialId, rangeStart]);

  /* ----------------------------------------------------- measure the column */
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setTrackWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [status]);

  const zoom = ZOOMS[zoomIndex] ?? 1;
  const pageWidth = Math.floor(Math.min(trackWidth, MAX_PAGE_WIDTH) * zoom);

  /*
   * The physical pages laid out, in order. Everything below indexes into *this*, so a
   * chapter's third page is index 2 whether it is page 3 or page 341 of the file. The range
   * is clamped to the document because a chapter list is edited by hand and a book can be
   * re-uploaded shorter than the list that describes it — better a short last chapter than
   * a reader that throws.
   */
  const pages = useMemo(() => {
    if (!doc) return [];
    if (rangeStart === null || rangeEnd === null) {
      return Array.from({ length: doc.numPages }, (_, i) => i + 1);
    }
    const from = Math.max(1, Math.min(rangeStart, doc.numPages));
    const to = Math.max(from, Math.min(rangeEnd, doc.numPages));
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
    // Depends on the bounds, not the object: callers build `range` inline every render.
  }, [doc, rangeStart, rangeEnd]);

  /* ------------------------------------------- which pages deserve a canvas */
  const [visible, setVisible] = useState<Set<number>>(() => new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const index = Number((entry.target as HTMLElement).dataset.page);
            if (entry.isIntersecting) next.add(index);
            else next.delete(index);
          }
          return next;
        });
      },
      // A screen above and below: the next page is usually painted before it scrolls in.
      { rootMargin: '100% 0px' },
    );
    observerRef.current = observer;
    // Pages that mounted first (or survived a Strict Mode remount) are picked up here.
    for (const el of pageRefs.current) if (el) observer.observe(el);
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, []);

  const registerPage = useCallback((index: number, el: HTMLDivElement | null) => {
    const observer = observerRef.current;
    const old = pageRefs.current[index];
    if (old && old !== el) observer?.unobserve(old);
    pageRefs.current[index] = el;
    if (el) observer?.observe(el);
  }, []);

  const onAspect = useCallback((index: number, aspect: number) => {
    setAspects((prev) =>
      Math.abs((prev[index] ?? 0) - aspect) < 0.001 ? prev : { ...prev, [index]: aspect },
    );
  }, []);

  /* ------------------------------------------------------ where the reader is */
  useEffect(() => {
    if (pages.length === 0) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const line = window.innerHeight * 0.35;
        const refs = pageRefs.current;
        let lo = 0;
        let hi = pages.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          const rect = refs[mid]?.getBoundingClientRect();
          if (rect && rect.bottom < line) lo = mid + 1;
          else hi = mid;
        }
        const page = lo + 1;
        setCurrent(page);
        setPageInput(String(page));
        try {
          localStorage.setItem(storageKey, String(page));
        } catch {
          /* private mode — the reader simply opens at the start next time */
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [pages.length, storageKey]);

  const goTo = useCallback((page: number, behavior: ScrollBehavior = 'smooth') => {
    const el = pageRefs.current[page - 1];
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 128;
    window.scrollTo({ top, behavior });
  }, []);

  // Pick up where they left off, once the column has a width to lay pages out in.
  const resumed = useRef(false);
  useEffect(() => {
    if (pages.length === 0 || !pageWidth || resumed.current) return;
    resumed.current = true;
    let saved = 1;
    try {
      saved = Number(localStorage.getItem(storageKey)) || 1;
    } catch {
      /* no storage — start at the top */
    }
    if (saved > 1 && saved <= pages.length) requestAnimationFrame(() => goTo(saved, 'instant'));
  }, [pages.length, pageWidth, storageKey, goTo]);

  /* ------------------------------------------------ no saving, no printing */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && (key === 's' || key === 'p')) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* --------------------------------------------------------------- render */
  if (status === 'denied' || status === 'error') {
    return (
      <Card variant="outline">
        <EmptyState
          icon={<BookLock className="size-6" aria-hidden />}
          title={status === 'denied' ? 'This book is not available' : 'The book did not open'}
          description={
            status === 'denied'
              ? 'Textbooks are for active members of the cohort. If you think this is a mistake, message your cohort lead.'
              : 'Check your connection and try again in a moment.'
          }
          action={
            <Link
              href={backHref}
              className="text-pulse-700 dark:text-pulse-300 text-sm font-semibold"
            >
              Back to materials
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <div
      className="select-none"
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
    >
      {/* A printed book is a copied book. */}
      <style>{`@media print { body { display: none !important; } }`}</style>

      {/* ----------------------------------------------------------- toolbar */}
      <div className="border-border bg-bg-elevated/90 shadow-soft sticky top-[4.25rem] z-20 mb-4 flex items-center gap-2 rounded-2xl border p-2 backdrop-blur-xl">
        <Link
          href={backHref}
          aria-label="Back to materials"
          className="tap text-fg-muted hover:bg-bg-sunken hover:text-fg grid size-9 shrink-0 place-items-center rounded-xl"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <p className="text-fg min-w-0 flex-1 truncate text-sm font-bold">{title}</p>

        {pages.length > 0 && (
          <form
            className="text-fg-muted flex shrink-0 items-center gap-1.5 text-xs font-semibold tabular-nums"
            onSubmit={(event) => {
              event.preventDefault();
              const page = Math.min(Math.max(1, Number(pageInput) || current), pages.length);
              setPageInput(String(page));
              goTo(page);
            }}
          >
            <input
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ''))}
              onBlur={() => setPageInput(String(current))}
              inputMode="numeric"
              aria-label="Page number"
              className="border-border bg-bg-sunken text-fg w-12 rounded-lg border px-1.5 py-1 text-center"
            />
            <span>/ {pages.length}</span>
          </form>
        )}

        <div className="border-border ml-1 flex shrink-0 items-center rounded-xl border">
          <button
            type="button"
            onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
            disabled={zoomIndex === 0}
            aria-label="Zoom out"
            className="tap text-fg-muted hover:text-fg grid size-8 place-items-center disabled:opacity-40"
          >
            <Minus className="size-3.5" aria-hidden />
          </button>
          <span className="text-fg-muted hidden w-11 text-center text-xs font-semibold tabular-nums sm:inline">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoomIndex((i) => Math.min(ZOOMS.length - 1, i + 1))}
            disabled={zoomIndex === ZOOMS.length - 1}
            aria-label="Zoom in"
            className="tap text-fg-muted hover:text-fg grid size-8 place-items-center disabled:opacity-40"
          >
            <Plus className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- pages */}
      <div ref={trackRef} className="overflow-x-auto">
        {!doc || !pageWidth ? (
          <div className="mx-auto space-y-4" style={{ maxWidth: MAX_PAGE_WIDTH }}>
            <Skeleton className="aspect-[1/1.414] w-full" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4" style={{ minWidth: pageWidth }}>
            {pages.map((pageNumber, index) => (
              <PageSlot
                key={pageNumber}
                index={index}
                pageNumber={pageNumber}
                doc={doc}
                width={pageWidth}
                aspect={aspects[index] ?? baseAspect}
                active={visible.has(index)}
                watermark={watermark}
                register={registerPage}
                onAspect={onAspect}
              />
            ))}
          </div>
        )}
      </div>

      {footer && (
        <div className="mx-auto mt-6" style={{ maxWidth: MAX_PAGE_WIDTH }}>
          {footer}
        </div>
      )}
    </div>
  );
}

/**
 * One page: a sized placeholder always, a canvas only while it is near the viewport.
 *
 * Memoised because the parent re-renders on every page turn, and a thousand pages each
 * re-rendering to decide they have nothing to do is the kind of cost that makes scrolling
 * stutter on a mid-range phone.
 */
const PageSlot = memo(function PageSlot({
  index,
  pageNumber,
  doc,
  width,
  aspect,
  active,
  watermark,
  register,
  onAspect,
}: {
  /** Position in this reader's own list — 0 is the first page shown, not page 1. */
  index: number;
  /** The physical page in the file, which is what PDF.js is asked for. */
  pageNumber: number;
  doc: PDFDocumentProxy;
  width: number;
  aspect: number;
  active: boolean;
  watermark: string;
  register: (index: number, el: HTMLDivElement | null) => void;
  onAspect: (index: number, aspect: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The width the canvas was last fully painted at. Derived against the live props below, so
  // leaving the viewport or zooming reads as unpainted without a state update to say so.
  const [paintedAt, setPaintedAt] = useState<number | null>(null);
  const painted = active && paintedAt === width;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!active) {
      // Give the memory back. A 2x canvas of a full page is several megabytes of pixels.
      canvas.width = 0;
      canvas.height = 0;
      return;
    }

    let cancelled = false;
    let task: RenderTask | null = null;

    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const unscaled = page.getViewport({ scale: 1 });
      onAspect(index, unscaled.height / unscaled.width);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (width / unscaled.width) * dpr });
      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvas, canvasContext: context, viewport });
      try {
        await task.promise;
      } catch {
        return; // cancelled by a scroll or a zoom — the next pass paints it
      }
      if (cancelled) return;
      stampWatermark(context, canvas.width, canvas.height, watermark);
      setPaintedAt(width);
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [active, doc, index, pageNumber, width, watermark, onAspect]);

  return (
    <div
      ref={(el) => register(index, el)}
      data-page={index}
      className="relative shrink-0 overflow-hidden rounded-md bg-white shadow-md"
      style={{ width, height: Math.round(width * aspect) }}
    >
      <canvas
        ref={canvasRef}
        className={cn(
          'block size-full transition-opacity duration-200',
          painted ? 'opacity-100' : 'opacity-0',
        )}
        aria-label={`Page ${index + 1}`}
      />
      {!painted && (
        <span className="absolute inset-0 grid place-items-center text-xs font-semibold text-neutral-400">
          {index + 1}
        </span>
      )}
    </div>
  );
});

/**
 * Tiles the reader's identity across a painted page, then signs the corner.
 *
 * Faint enough to read through, dense enough that no crop of a readable size escapes it.
 */
function stampWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, text: string) {
  const size = Math.max(11, Math.round(w / 38));

  ctx.save();
  ctx.font = `600 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.fillStyle = 'rgba(100, 100, 130, 0.13)';
  ctx.textBaseline = 'middle';
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  const stepX = ctx.measureText(text).width + size * 5;
  const stepY = size * 7;
  const reach = Math.hypot(w, h) / 2;
  let row = 0;
  for (let y = -reach; y < reach; y += stepY, row += 1) {
    for (let x = -reach - (row % 2) * (stepX / 2); x < reach; x += stepX) {
      ctx.fillText(text, x, y);
    }
  }
  ctx.restore();

  ctx.save();
  ctx.font = `500 ${Math.round(size * 0.75)}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.fillStyle = 'rgba(80, 80, 100, 0.5)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`Licensed to ${text}`, w - size, h - size * 0.6);
  ctx.restore();
}
