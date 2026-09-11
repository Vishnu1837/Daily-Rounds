'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Minimize2, X } from 'lucide-react';

import { Tree } from '@/components/grove/tree';
import { cn } from '@/lib/cn';
import { SPECIES_NAMES, growthStage } from '@/lib/domain/grove';
import { loadStudySeedAction } from '@/server/actions/grove';

import { dropRound, passRound, peekRound, useCarriedRound } from './handoff';
import { RoundPanel } from './round-panel';
import { LIVE_ROUND_FLAG, type StudySeed } from './seed';
import { type FocusRound, formatClock, useFocusRound } from './use-focus-round';

/** The route that owns a round outright. Everywhere else, the dock carries it. */
const STUDY_ROUTE = '/study';

const DOCK_POSITION_KEY = 'dr.grove.dock';
const BUBBLE = 64;
const EDGE = 16;
/** Pixels of travel before a press stops being a tap and becomes a drag. */
const DRAG_SLOP = 5;

/**
 * The grove, carried.
 *
 * A focus round used to be a place: you were on `/study` for twenty-five minutes, or you had
 * no round. That was a bad trade for a student whose next twenty-five minutes are meant to be
 * spent *reading* — the one thing the timer exists to protect is the one thing the timer's
 * screen stopped them doing. So a round can now be minimised, and this is where it goes: a
 * small draggable clock the student parks wherever it does not sit on top of what they are
 * reading, which opens back into the full grove over the page and closes again to exactly
 * where they were.
 *
 * The round itself is unchanged, and specifically the rule that kills it is unchanged. What
 * kills a tree is leaving — another tab, another app, the phone put down and picked up
 * somewhere else. Moving around this site was never *leaving*; it only looked like it,
 * because the round had nowhere to live except the page it started on. See
 * `./use-focus-round` for the away rule, which the dock does not relax by one second.
 *
 * Exactly one surface drives the round at a time. On `/study` the page drives it and the dock
 * renders nothing; anywhere else the dock drives it. Navigation is the handoff, and it is
 * made without a round trip by `./handoff` — the student walks off the study page carrying
 * the round with them rather than watching a spinner re-fetch what was on screen a moment ago.
 */
export function GroveDock() {
  const pathname = usePathname();
  const onStudyRoute = pathname === STUDY_ROUTE;
  const carried = useCarriedRound();
  const loading = useRef(false);

  /*
   * Picking a round up on a cold load.
   *
   * The usual way the dock gets a round is that the study page hands it over on the way out,
   * which costs nothing. This is the other way: the student closed the tab mid-round, or came
   * back to the site on a route that is not `/study`, and there is still something in the
   * ground. The flag is what keeps the common case — a student with no round at all — free of
   * a request on every page they open; the server is still the one that decides.
   */
  useEffect(() => {
    if (onStudyRoute || peekRound() || loading.current) return;

    let live = false;
    try {
      live = window.localStorage.getItem(LIVE_ROUND_FLAG) === '1';
    } catch {
      live = false;
    }
    if (!live) return;

    loading.current = true;
    void loadStudySeedAction()
      .then((result) => {
        // The study page may have handed a round over while this was in flight, and what it
        // handed over is newer than what came back.
        if (!result.ok || peekRound()) return;
        if (result.data.grove.live) {
          passRound(result.data);
          return;
        }
        // Nothing was growing after all — the round was settled by the sweep, or on another
        // device. Clear the hint so the next page load does not ask again.
        try {
          window.localStorage.removeItem(LIVE_ROUND_FLAG);
        } catch {
          /* storage disabled; the flag was only ever a hint */
        }
      })
      .finally(() => {
        loading.current = false;
      });
  }, [onStudyRoute, carried]);

  // On `/study` the page drives the round and draws it full size. Two timers settling one
  // tree is the one thing this arrangement must never allow.
  if (onStudyRoute || !carried) return null;

  return (
    <DockedRound
      // A new round starts from its own numbers rather than inheriting the last one's state.
      key={carried.grove.live?.id ?? 'none'}
      seed={carried}
    />
  );
}

function DockedRound({ seed }: { seed: StudySeed }) {
  const round = useFocusRound({ seed, enabled: true });
  const [expanded, setExpanded] = useState(false);

  /*
   * When the dock has nothing left to carry it goes away entirely rather than sitting there
   * as an empty clock. A break still counts as something to carry: it is the moment the block
   * is worth logging, and a student who has just grown a tree should not have to find their
   * way back to `/study` to be offered that.
   */
  const alive = round.tree !== null || round.view === 'break' || round.view === 'lost';
  useEffect(() => {
    if (!alive) dropRound();
  }, [alive]);

  // Nothing behind should scroll or take a keystroke while the grove is over it.
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [expanded]);

  if (!alive) return null;

  return expanded ? (
    <FullScreenGrove round={round} onCollapse={() => setExpanded(false)} />
  ) : (
    <MiniPlayer
      round={round}
      onExpand={() => setExpanded(true)}
      // A live round is given up, never dismissed. Letting the timer be swiped away would
      // make walking out on a round free, which is the one thing the grove sells.
      onDismiss={round.view === 'focus' ? null : dropRound}
    />
  );
}

/* ------------------------------------------------------------ the overlay */

/**
 * The grove, full screen, over whatever the student was reading.
 *
 * Deliberately opaque rather than a translucent sheet. The round's own screen goes dark to
 * say "you are meant to be doing something else"; letting a half-read chapter show through
 * that would undo the one thing the darkness is for. Closing it puts the student back exactly
 * where they were, because nothing navigated to get here.
 */
function FullScreenGrove({ round, onCollapse }: { round: FocusRound; onCollapse: () => void }) {
  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Your focus round"
        className="bg-bg fixed inset-0 z-[55] overflow-y-auto overscroll-contain"
      >
        <div className="animate-rise mx-auto w-full max-w-2xl px-4 pt-4 pb-24 sm:pt-6">
          <RoundPanel
            round={round}
            header={
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow">Your round, on top of everything else</p>
                <button
                  type="button"
                  onClick={onCollapse}
                  className="tap text-fg-muted hover:text-fg hover:bg-bg-sunken inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors"
                >
                  <Minimize2 className="size-4" aria-hidden />
                  Minimise
                </button>
              </div>
            }
            footer={
              <p className="text-fg-subtle px-1 text-center text-xs leading-relaxed">
                Minimising puts you back where you were. The round keeps growing either way.
              </p>
            }
          />
        </div>
      </div>
    </Portal>
  );
}

/* --------------------------------------------------------- the mini player */

type Point = { x: number; y: number };

function clampToViewport(p: Point): Point {
  const width = window.innerWidth;
  const height = window.innerHeight;
  // A page that has not been laid out yet reports nothing useful, and clamping against a
  // viewport that does not exist is how the bubble ends up pinned to the top-left corner
  // over the logo. No viewport, no clamp — the next resize or drag will settle it.
  if (width < BUBBLE * 2 || height < BUBBLE * 2) return p;
  const maxX = Math.max(EDGE, width - BUBBLE - EDGE);
  const maxY = Math.max(EDGE, height - BUBBLE - EDGE);
  return {
    x: Math.min(Math.max(EDGE, p.x), maxX),
    y: Math.min(Math.max(EDGE, p.y), maxY),
  };
}

/**
 * Where the bubble sits when the student has never moved it.
 *
 * Bottom right, and high enough to clear the mobile navigation bar — the one piece of
 * furniture guaranteed to be underneath it on a phone. Expressed in CSS rather than in
 * measured pixels on purpose: a corner is a corner however big the window is, and the page
 * cannot be measured on the render where the bubble first appears.
 */
const DEFAULT_ANCHOR = { right: EDGE, bottom: 104 } as const;

function readPosition(): Point | null {
  try {
    const raw = window.localStorage.getItem(DOCK_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Point>;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
    return clampToViewport({ x: parsed.x, y: parsed.y });
  } catch {
    return null;
  }
}

/**
 * The round, shrunk to a clock you can put anywhere.
 *
 * Drag and tap are the same gesture until they are not, so both are read off one pointer
 * stream: a press that travels less than a few pixels is a tap and opens the grove, and
 * anything further is a move. Doing it that way rather than with a separate drag handle is
 * what makes the whole thing feel like one object rather than a button glued to a grip.
 */
function MiniPlayer({
  round,
  onExpand,
  onDismiss,
}: {
  round: FocusRound;
  onExpand: () => void;
  /** Only offered once the round is over — a live round is given up, never dismissed. */
  onDismiss: (() => void) | null;
}) {
  /*
   * Where the student last put it, or nowhere at all.
   *
   * `null` is not "unknown" — it means the bubble is still in its default corner and is being
   * positioned by CSS. Only a drag turns it into pixels, which is what keeps the default
   * correct on a window this component has never measured.
   */
  const [position, setPosition] = useState<Point | null>(() =>
    typeof window === 'undefined' ? null : readPosition(),
  );
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{
    dx: number;
    dy: number;
    startX: number;
    startY: number;
    moved: boolean;
    /** Where the bubble was last put. Read back on release rather than from state, which
     *  has not necessarily re-rendered by the time the pointer comes up. */
    at: Point | null;
  } | null>(null);
  const wasDrag = useRef(false);

  // A rotated phone, or a resized window, must not leave the bubble off the edge of the world.
  useEffect(() => {
    const onResize = () => setPosition((p) => (p ? clampToViewport(p) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    // Measured off the element rather than off state, so a bubble still sitting in its CSS
    // default corner picks up the drag from exactly where it is drawn.
    const rect = event.currentTarget.getBoundingClientRect();
    /*
     * Note what has happened, but do not capture the pointer yet.
     *
     * Capturing on press retargets the `click` that follows to whatever holds the capture,
     * which is how a tap on this bubble ends up going nowhere — the button never hears it.
     * Capture is what a *drag* needs, so it is taken at the moment a press becomes a drag
     * and not before. A tap is then an ordinary click on an ordinary button.
     */
    gesture.current = {
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      at: null,
    };
    setDragging(true);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    // A few pixels of slop, so a tap on a touchscreen — which always wanders a little — is
    // still read as a tap rather than as a drag that happens to end where it started.
    if (!g.moved && Math.hypot(event.clientX - g.startX, event.clientY - g.startY) > DRAG_SLOP) {
      g.moved = true;
      // From here the gesture belongs to the bubble, wherever the finger wanders.
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (!g.moved) return;
    const next = clampToViewport({ x: event.clientX - g.dx, y: event.clientY - g.dy });
    g.at = next;
    setPosition(next);
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (!g) return;
    // The click that follows this pointer-up belongs to the drag, not to the student
    // asking for the grove. Remembering that here is the only way to tell them apart —
    // by the time `click` fires the gesture is over and its history is gone.
    wasDrag.current = g.moved;
    if (!g.moved) return;

    if (g.at) {
      try {
        window.localStorage.setItem(DOCK_POSITION_KEY, JSON.stringify(g.at));
      } catch {
        /* storage disabled; the bubble simply starts in the corner next time */
      }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const focusing = round.view === 'focus';
  const label = focusing
    ? formatClock(round.roundRemaining)
    : round.view === 'break'
      ? formatClock(round.breakRemaining)
      : 'Grove';

  return (
    <Portal>
      <div
        className="fixed z-[55] touch-none select-none"
        style={
          position
            ? { left: position.x, top: position.y, width: BUBBLE }
            : { ...DEFAULT_ANCHOR, width: BUBBLE }
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button
          type="button"
          onClick={() => {
            if (wasDrag.current) {
              wasDrag.current = false;
              return;
            }
            onExpand();
          }}
          aria-label={
            focusing
              ? `Focus round running, ${Math.ceil(round.roundRemaining / 60)} minutes left. Open the grove.`
              : 'Open the grove'
          }
          className={cn(
            'ring-border/70 bg-bg-elevated relative grid size-16 place-items-center rounded-full shadow-lg ring-1 transition-transform',
            dragging ? 'scale-105 cursor-grabbing' : 'cursor-grab active:scale-95',
          )}
        >
          {/*
            The progress ring is the whole reason this is a circle and not a pill: it says how
            far through the round you are without the student having to read a number, which
            is the only thing they need from it while they are reading something else.
          */}
          <svg viewBox="0 0 64 64" className="absolute inset-0 size-16 -rotate-90" aria-hidden>
            <circle
              cx="32"
              cy="32"
              r="29"
              fill="none"
              strokeWidth="4"
              className="stroke-bg-inset"
            />
            <circle
              cx="32"
              cy="32"
              r="29"
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              stroke={
                round.view === 'break' ? 'var(--color-aqua-500)' : 'var(--color-success-strong)'
              }
              strokeDasharray={2 * Math.PI * 29}
              strokeDashoffset={2 * Math.PI * 29 * (1 - (focusing ? round.roundProgress : 1))}
              className="ease-out-soft transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
            />
          </svg>

          <span className="flex flex-col items-center leading-none">
            <Tree
              species={round.lost ? round.lost.species : round.species}
              status={round.lost ? 'withered' : undefined}
              stage={focusing ? growthStage(round.roundProgress) : undefined}
              size={22}
              title={`${SPECIES_NAMES[round.species]}`}
            />
            <span className="text-fg mt-0.5 text-[0.625rem] font-bold tabular-nums">{label}</span>
          </span>
        </button>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss the grove timer"
            className="bg-bg-elevated text-fg-muted hover:text-fg ring-border absolute -top-1 -right-1 grid size-5 place-items-center rounded-full shadow ring-1"
          >
            <X className="size-3" aria-hidden />
          </button>
        )}
      </div>
    </Portal>
  );
}

/* ------------------------------------------------------------------ portal */

/** Renders into `body`, so nothing the dock floats over can clip or stack above it. */
function Portal({ children }: { children: React.ReactNode }) {
  // The dock is only ever reached with a round in hand, and a round is only ever carried in a
  // browser — so there is nothing to guard against here beyond the render that has no DOM.
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
