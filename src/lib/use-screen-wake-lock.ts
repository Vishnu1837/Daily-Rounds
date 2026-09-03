'use client';

import { useEffect } from 'react';

/**
 * Holds the screen awake for as long as `active` is true.
 *
 * The grove's whole mechanic is "sit here for twenty-five minutes", and a phone that locks
 * itself after thirty seconds turns that into "sit here holding your phone". So a focus round
 * asks the platform to keep the screen on, exactly as the app this borrows from does.
 *
 * The lock is a request, not a guarantee. Browsers drop it whenever the document is hidden
 * (and some never grant it at all), so it is re-acquired every time the page comes back —
 * and nothing downstream is allowed to depend on it having been granted. Keeping the screen
 * lit is a convenience; the round's survival rules are decided separately, in the study
 * screen, precisely so a browser without this API is not a browser where trees die.
 */
type WakeLockSentinelLike = { released: boolean; release(): Promise<void> };

export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const api = (
      navigator as Navigator & {
        wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
      }
    ).wakeLock;
    if (!api) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        sentinel = await api.request('screen');
        // The effect may have been torn down while the request was in flight.
        if (cancelled) void sentinel.release().catch(() => {});
      } catch {
        // Denied (no user gesture yet, battery saver, unsupported surface). The round is
        // unaffected — the student's screen just dims as it normally would.
      }
    };

    // Re-taken on return, because the browser releases the lock itself the moment the page
    // is hidden and does not hand it back when the page returns.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => {});
    };
  }, [active]);
}
