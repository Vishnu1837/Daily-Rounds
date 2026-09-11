'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Minimize2 } from 'lucide-react';

import { passRound } from '@/components/grove/handoff';
import { RoundPanel } from '@/components/grove/round-panel';
import type { StudySeed } from '@/components/grove/seed';
import { useFocusRound } from '@/components/grove/use-focus-round';
import { STUDENT_HOME } from '@/lib/routes';
import { SITE } from '@/lib/site';

/**
 * The study screen: a Pomodoro round that plants a tree.
 *
 * Almost nothing happens here any more. The round is a machine (`useFocusRound`) and a
 * drawing (`RoundPanel`), because it is no longer tied to this page: a student can minimise
 * it and carry it around the rest of the site in the dock, and both surfaces have to be the
 * same round rather than two implementations that agree most of the time.
 *
 * What is left is this route's half of the bargain — the way in, the way out, and the handoff
 * that happens when the student leaves. See `@/components/grove/dock`.
 */
export function StudySessionScreen({ seed }: { seed: StudySeed }) {
  const router = useRouter();

  // This page drives the round for as long as the student is on it. The dock stands down
  // while that is true, so there is never a second timer settling the same tree.
  const round = useFocusRound({ seed, enabled: true });

  /*
   * Leaving this page with a round still in the ground hands it to the dock.
   *
   * Deliberately on unmount rather than on the minimise button, because the button is not
   * the only way out: a student who taps a nav item, follows the link to their grove, or
   * opens a textbook from here has done exactly the same thing, and should get exactly the
   * same result — the timer in the corner, not a lost round or a spinner while the dock
   * re-asks the server for what was on screen a moment ago.
   */
  const snapshot = useRef(round.snapshot);
  useEffect(() => {
    snapshot.current = round.snapshot;
  }, [round.snapshot]);
  useEffect(() => {
    return () => {
      const seedOut = snapshot.current();
      if (seedOut.grove.live) passRound(seedOut);
    };
  }, []);

  const running = round.tree !== null;

  return (
    <RoundPanel
      round={round}
      header={
        <div className="flex items-center justify-between gap-3">
          <Link
            href={STUDENT_HOME}
            className="tap text-fg-muted hover:text-fg inline-flex items-center gap-1.5 rounded-lg px-1 py-2 text-sm font-semibold transition-colors"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to today
          </Link>

          {/*
            The way out of a running round that is not giving up on it.
            It navigates rather than just collapsing something, because the point of
            minimising is to go and do the reading — staying on the timer's own page with the
            timer hidden would be the one outcome nobody wants. The round leaves with them.
          */}
          {running && (
            <button
              type="button"
              onClick={() => router.push(STUDENT_HOME)}
              className="tap text-fg-muted hover:text-fg hover:bg-bg-sunken inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors"
            >
              <Minimize2 className="size-4" aria-hidden />
              Minimise and keep studying
            </button>
          )}
        </div>
      }
      footer={
        running ? (
          <p className="text-fg-subtle px-1 text-center text-xs leading-relaxed">
            Minimising keeps the round growing. The timer follows you around {SITE.name} as a small
            clock you can drag anywhere — tap it to come back here.
          </p>
        ) : null
      }
    />
  );
}
