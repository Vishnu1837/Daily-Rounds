'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

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
 * Whether the visitor has asked for reduced motion.
 *
 * This exists because `useReducedMotion` was the *only* thing several components imported
 * from framer-motion, and importing it pulled the whole animation runtime — a six-figure
 * byte count — into chunks that were otherwise plain CSS transitions. A media query does
 * not need an animation library.
 *
 * The server snapshot is `false` so the markup matches the no-preference default; the
 * subscription corrects it on the client before paint if the visitor has set the
 * preference. Components here always render the *real* value and animate only a transform,
 * so a one-frame correction can never show a wrong number.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
