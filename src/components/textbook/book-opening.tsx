'use client';

import { type MouseEvent, useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion, useAnimate } from 'framer-motion';

import { BookCover } from '@/components/textbook/book-cover';

/**
 * Opening a book from the shelf.
 *
 * The cover a student tapped lifts off the shelf, grows until it nearly fills the screen,
 * swings open on its spine, and the whole thing fades away onto the book's own page. It
 * reads as "I opened this book" rather than "a link loaded", which is the entire point.
 *
 * The animation has to outlive the page that starts it — the shelf unmounts the moment the
 * route changes — so the overlay lives in the shell and the shelf only hands it a book and
 * the rectangle the cover was sitting in. The hand-off is a tiny module store rather than a
 * context so the shell's layout stays a synchronous server component.
 *
 * Navigation is not gated on the animation. The route is pushed as soon as the backdrop is
 * opaque, so the server works while the cover is still turning; the fade then waits for
 * the book page to say it has mounted (`useBookArrived`), with a timeout so a slow or
 * failed load never leaves a student staring at a closed-off screen.
 *
 * With `prefers-reduced-motion`, or a modified click (new tab, new window), none of this
 * runs and the link behaves as a plain link.
 */

type OpeningBook = {
  id: string;
  title: string;
  coverVersion: string | null;
  href: string;
  /** Where the cover sat on the shelf, in viewport pixels. */
  from: { left: number; top: number; width: number; height: number };
};

type State = { book: OpeningBook; arrived: boolean } | null;

let state: State = null;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getState = () => state;
const getServerState = () => null;

/** The book currently being opened, if any — the shelf hides its cover while it is lifted. */
export function useOpeningBookId(): string | null {
  return useSyncExternalStore(subscribe, getState, getServerState)?.book.id ?? null;
}

/**
 * Called by a book's page once it has mounted, so the overlay knows there is something
 * underneath to fade onto. A no-op for every load that did not come off the shelf.
 */
export function useBookArrived(materialId: string) {
  useEffect(() => {
    if (state && state.book.id === materialId && !state.arrived) {
      set({ ...state, arrived: true });
    }
  }, [materialId]);
}

/**
 * The shelf's click handler. Returns early — letting the link navigate normally — for any
 * click the animation should not hijack.
 */
export function openBookFromShelf(
  event: MouseEvent<HTMLAnchorElement>,
  book: Omit<OpeningBook, 'from'>,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    state !== null ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return;
  }

  const cover = event.currentTarget.querySelector<HTMLElement>('[data-book-cover]');
  if (!cover) return;

  event.preventDefault();
  const rect = cover.getBoundingClientRect();
  set({
    book: {
      ...book,
      from: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    },
    arrived: false,
  });
}

/* ------------------------------------------------------------------ overlay */

/** How long to hold the open book waiting for the page before fading regardless. */
const ARRIVAL_TIMEOUT = 6000;

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

/** Mounted once, in the shell. Renders nothing unless a book is being opened. */
export function BookOpeningOverlay() {
  const current = useSyncExternalStore(subscribe, getState, getServerState);
  if (!current) return null;
  // Keyed by book so a fresh opening always starts its timeline from the beginning.
  return createPortal(
    <OpeningScene key={current.book.id} book={current.book} arrived={current.arrived} />,
    document.body,
  );
}

function OpeningScene({ book, arrived }: { book: OpeningBook; arrived: boolean }) {
  const router = useRouter();
  const [scope, animate] = useAnimate();
  const [opened, setOpened] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  /*
   * The target: as large as a 3:4 book can be while leaving a margin on every side. The
   * book box is laid out at that size and scaled *down* to the shelf rectangle to start,
   * so the cover is rasterised at the size it ends up rather than blown up from a thumbnail.
   */
  const [geometry] = useState(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(vw * 0.86, vh * 0.86 * 0.75);
    const height = width / 0.75;
    const left = (vw - width) / 2;
    const top = (vh - height) / 2;
    const scale = book.from.width / width;
    return {
      width,
      height,
      left,
      top,
      /** Inverse of `scale`: how much the shelf-sized cover art is blown up to fill the box. */
      zoom: width / book.from.width,
      start: {
        x: book.from.left + book.from.width / 2 - (left + width / 2),
        y: book.from.top + book.from.height / 2 - (top + height / 2),
        scale,
      },
    };
  });

  // Lift, then turn the cover.
  useEffect(() => {
    let cancelled = false;
    // Pushed once the backdrop has covered the shelf, so the swap underneath is never seen.
    const navigate = setTimeout(() => router.push(book.href), 380);
    const run = async () => {
      animate('[data-backdrop]', { opacity: 1 }, { duration: 0.4, ease: 'easeOut' });
      await animate(
        '[data-book]',
        { x: 0, y: 0, scale: 1, rotateX: [0, 8, 0] },
        { duration: 0.75, ease: EASE_OUT },
      );
      if (cancelled) return;

      await Promise.all([
        animate(
          '[data-cover]',
          { rotateY: -178 },
          { duration: 1.05, ease: EASE_IN_OUT, delay: 0.08 },
        ),
        animate(
          '[data-cover-shade]',
          { opacity: [0, 0.55, 0.9] },
          { duration: 1.05, ease: EASE_IN_OUT, delay: 0.08 },
        ),
        animate(
          '[data-hinge-shadow]',
          { opacity: [0.7, 0] },
          { duration: 1.05, ease: 'easeOut', delay: 0.08 },
        ),
      ]);
      if (!cancelled) setOpened(true);
    };
    void run();
    return () => {
      cancelled = true;
      clearTimeout(navigate);
    };
  }, [animate, book.href, router]);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), ARRIVAL_TIMEOUT);
    return () => clearTimeout(timer);
  }, []);

  // Fade onto the page once the cover is open *and* the page is there to be revealed.
  useEffect(() => {
    if (!opened || !(arrived || timedOut)) return;
    let cancelled = false;
    const run = async () => {
      await Promise.all([
        animate(scope.current, { opacity: 0 }, { duration: 0.55, ease: 'easeInOut' }),
        animate('[data-book]', { scale: 1.08 }, { duration: 0.55, ease: 'easeIn' }),
      ]);
      if (!cancelled) set(null);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [animate, arrived, opened, scope, timedOut]);

  const radius = 12 * geometry.zoom;

  return (
    <div ref={scope} className="fixed inset-0 z-[100]" aria-hidden>
      <motion.div
        data-backdrop
        initial={{ opacity: 0 }}
        className="bg-bg absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(60% 55% at 50% 50%, color-mix(in oklch, var(--color-pulse-500) 16%, transparent), transparent 75%)',
        }}
      />

      <div className="absolute inset-0" style={{ perspective: geometry.height * 2.4 }}>
        <motion.div
          data-book
          initial={geometry.start}
          className="absolute"
          style={{
            left: geometry.left,
            top: geometry.top,
            width: geometry.width,
            height: geometry.height,
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Ground shadow, so the book reads as an object lifted off the page. */}
          <div
            className="absolute inset-x-[6%] -bottom-[4%] h-[8%] rounded-[50%] bg-black/40 blur-2xl"
            style={{ transform: 'translateZ(-1px)' }}
          />

          {/* The first page, which the cover opens onto. */}
          <div
            className="bg-bg-elevated border-border absolute inset-0 overflow-hidden border"
            style={{ borderRadius: radius }}
          >
            <PageEdges />
            <div
              data-hinge-shadow
              className="absolute inset-y-0 left-0 w-1/4 bg-linear-to-r from-black/45 to-transparent"
              style={{ opacity: 0.7 }}
            />
            <div className="absolute inset-0 flex flex-col justify-center px-[12%]">
              <p
                className="eyebrow mb-3"
                style={{ fontSize: `${Math.min(15, Math.max(11, geometry.width * 0.026))}px` }}
              >
                Textbook
              </p>
              <p
                className="text-fg font-extrabold tracking-tight text-balance"
                style={{ fontSize: `${Math.min(56, geometry.width * 0.085)}px`, lineHeight: 1.08 }}
              >
                {book.title}
              </p>
              <span className="bg-pulse-500 mt-5 block h-1 w-12 rounded-full" />
            </div>
          </div>

          {/* The cover: a two-sided leaf hinged on the spine. */}
          <motion.div
            data-cover
            initial={{ rotateY: 0 }}
            className="absolute inset-0"
            style={{ transformOrigin: 'left center', transformStyle: 'preserve-3d' }}
          >
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ backfaceVisibility: 'hidden', borderRadius: radius }}
            >
              <div
                style={{
                  width: book.from.width,
                  transform: `scale(${geometry.zoom})`,
                  transformOrigin: 'top left',
                }}
              >
                <BookCover
                  title={book.title}
                  materialId={book.id}
                  coverVersion={book.coverVersion}
                  size="shelf"
                  className="shadow-none"
                />
              </div>
              <div data-cover-shade className="absolute inset-0 bg-black opacity-0" />
            </div>

            {/* Inside of the cover, seen once it has swung past the spine. */}
            <div
              className="bg-bg-sunken border-border absolute inset-0 border"
              style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
                borderRadius: radius,
              }}
            />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

/** A few hairlines down the fore-edge, so the page block has some thickness to it. */
function PageEdges() {
  return (
    <div className="absolute inset-y-[1.5%] right-0 flex w-[2.2%] gap-[18%]" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <span key={i} className="bg-border h-full flex-1" />
      ))}
    </div>
  );
}
