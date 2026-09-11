'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(pointer: coarse)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

/**
 * Whether the primary pointer is a finger rather than a mouse.
 *
 * Used to decide what a gesture is allowed to cost. A mouse has a wheel, so taking an axis
 * away from the page costs it nothing; a thumb has only the surface it is touching, and on
 * a phone that surface is usually the whole of whatever is on screen. So a gesture that
 * would otherwise claim both axes gives the vertical one back here.
 *
 * The server snapshot is `false` — the mouse default — and the subscription corrects it on
 * the client before paint. Nothing readable depends on the value, only what a drag may do,
 * and no drag can have started before the correction lands.
 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
