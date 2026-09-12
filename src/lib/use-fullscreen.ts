'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Full screen, as much of it as browsers actually agree on.
 *
 * Written for the assessment runtime, where full screen is not a presentation nicety but
 * part of the rules: the paper is only shown while the document owns the screen, and every
 * drop out of it is counted. That puts two demands on this hook that a cosmetic one would
 * not have.
 *
 * The first is honesty about *whether* we are in full screen. `document.fullscreenElement`
 * is the only thing consulted — never a flag we set when we asked — because the exit can
 * come from anywhere: Escape, the window controls, an OS gesture, another element taking
 * the lock. Anything we tracked ourselves would drift out of step with the browser exactly
 * when it mattered.
 *
 * The second is Safari, which has never shipped the unprefixed API on desktop and does not
 * ship it at all on iPhone. The prefixed calls are used where they exist, and where nothing
 * exists `enter()` simply fails — the caller is expected to have something to say about
 * that rather than to assume it worked.
 */

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

/** Whether this browser offers the API at all. False on an iPhone, whatever the version. */
export function fullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const target = document.documentElement as FullscreenElement;
  return Boolean(target.requestFullscreen || target.webkitRequestFullscreen);
}

function currentlyFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as FullscreenDocument;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

/** Asks for full screen. Resolves to whether the browser granted it. */
export async function requestFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const target = document.documentElement as FullscreenElement;
  try {
    if (target.requestFullscreen) await target.requestFullscreen({ navigationUI: 'hide' });
    else if (target.webkitRequestFullscreen) await target.webkitRequestFullscreen();
    else return false;
  } catch {
    // Denied — no user gesture behind the call, or a browser that refuses it here.
    return false;
  }
  return currentlyFullscreen();
}

/** Leaves full screen if we are in it. Never throws. */
export async function leaveFullscreen(): Promise<void> {
  if (typeof document === 'undefined' || !currentlyFullscreen()) return;
  const doc = document as FullscreenDocument;
  try {
    if (doc.exitFullscreen) await doc.exitFullscreen();
    else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
  } catch {
    // Already out, or the browser would rather we were not. Either way there is nothing
    // useful to do about it.
  }
}

export type FullscreenStatus = {
  /** True only while the document owns the screen, read from the browser on every change. */
  active: boolean;
  /** False where the API does not exist, so callers can say so instead of looping. */
  supported: boolean;
  /** Must be called from a user gesture. Resolves to whether we ended up in full screen. */
  enter: () => Promise<boolean>;
};

function subscribe(onChange: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  document.addEventListener('fullscreenchange', onChange);
  document.addEventListener('webkitfullscreenchange', onChange);
  return () => {
    document.removeEventListener('fullscreenchange', onChange);
    document.removeEventListener('webkitfullscreenchange', onChange);
  };
}

/** Nothing to subscribe to: whether the API exists cannot change under a running page. */
function subscribeNever(): () => void {
  return () => {};
}

/**
 * Tracks full screen and hands back a way in.
 *
 * Subscribed to the browser rather than mirrored into state, the same shape as
 * `usePrefersReducedMotion`: the truth is `document.fullscreenElement`, and a copy of it in
 * a `useState` would be one render behind on exactly the transition being counted.
 *
 * Both server snapshots are chosen so the first frame errs towards the gate — supported and
 * not active — because the one thing this must never do is render a paper for a frame on a
 * screen that has not been claimed.
 */
export function useFullscreen(): FullscreenStatus {
  const active = useSyncExternalStore(subscribe, currentlyFullscreen, () => false);
  const supported = useSyncExternalStore(subscribeNever, fullscreenSupported, () => true);

  const enter = useCallback(() => requestFullscreen(), []);

  return { active, supported, enter };
}
