'use client';

import { useSyncExternalStore } from 'react';

import type { StudySeed } from './seed';

/**
 * The one round, handed between the two things that can be drawing it.
 *
 * A focus round is owned by whichever surface is on screen: the study page while the student
 * is on `/study`, and the dock — the floating timer that follows them around the rest of the
 * site — everywhere else. Navigation is the handoff, and this module is what crosses it.
 *
 * It is a store outside React on purpose. The two surfaces are in different parts of the
 * tree (one is a route, the other is in the shell) and they hand over during a commit, as one
 * unmounts and the other appears. A context would have had to be a parent of both, which
 * means the layout, which means the layout reading the database on every page in the product
 * to answer a question about the handful of minutes a day a round is actually running.
 *
 * The seed is what crosses: enough for the receiving side to carry on drawing the same round
 * from the same numbers, with no round trip in the moment the student walks away from the
 * timer. The *round itself* still belongs to the server, which is the only thing that decides
 * whether a tree lived.
 */

let carried: StudySeed | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Hands the round on. Whoever is carrying it next re-renders with it. */
export function passRound(seed: StudySeed): void {
  carried = seed;
  emit();
}

/** The round is over, or has gone back to a page that owns it outright. */
export function dropRound(): void {
  if (carried === null) return;
  carried = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): StudySeed | null {
  return carried;
}

/**
 * What is being carried *right now*, rather than as of the last render.
 *
 * The handoff happens during a commit — the study page's cleanup runs after the dock has
 * already rendered for the new route — so an effect that trusted its rendered value would
 * conclude there was no round a moment after one was handed to it, and pay for a round trip
 * to be told what it is already holding.
 */
export function peekRound(): StudySeed | null {
  return carried;
}

/** Nothing is ever being carried on the server: a round is a thing happening in a browser. */
function serverSnapshot(): StudySeed | null {
  return null;
}

export function useCarriedRound(): StudySeed | null {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/* ------------------------------------------------------------- settle lock */

/**
 * Which rounds are already being settled.
 *
 * In the frame where the study page is unmounting and the dock is taking over, both are
 * briefly alive and both can see a countdown that has just hit zero. The server is idempotent
 * about being told twice — it hands back the tree it already grew — but the grove would still
 * draw two trees for one round, which is worse than the round trip it saves.
 */
const settling = new Set<string>();

/** True if this caller won the right to settle `treeId`. */
export function claimSettle(treeId: string): boolean {
  if (settling.has(treeId)) return false;
  settling.add(treeId);
  return true;
}

export function releaseSettle(treeId: string): void {
  settling.delete(treeId);
}

/**
 * Rounds that are finished with, one way or the other.
 *
 * The router keeps the page you just left mounted and hidden so that going back to it is
 * instant, which means the study screen can still be holding a round that the dock has since
 * grown or buried. Coming back to that screen must not restart a countdown for a tree that no
 * longer exists — it would sit there counting down and then ask the server to grow something
 * it has already settled. This is how the two surfaces agree that a round is over without
 * either of them asking the server again.
 */
const settled = new Set<string>();

export function markSettled(treeId: string): void {
  settled.add(treeId);
}

export function wasSettled(treeId: string): boolean {
  return settled.has(treeId);
}
