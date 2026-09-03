'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, RefreshCw, Smartphone, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import {
  type DeviceLinkOffer,
  createDeviceLinkAction,
  deviceLinkStatusAction,
} from '@/server/actions/device-link';

/**
 * "Open this on your phone" — the floating prompt, and the QR behind it.
 *
 * Being signed in on two devices at once has always worked; what was missing was a way to
 * get there that did not involve typing a months-old password on a phone. So a student who
 * is already signed in here asks for a code, points a camera at it, and the phone lands on
 * the same account.
 *
 * Desktop only, and that is not a layout convenience. The whole proposition is "carry this
 * session to your phone", which is nonsense read *on* the phone — and on a small screen the
 * corner it would sit in belongs to the bottom nav.
 *
 * The prompt is dismissible and stays dismissed for the session. It is an offer, not a task,
 * and a student who has already paired their phone should not be asked again on every screen
 * for the rest of the day.
 */

/**
 * Whether the student has waved the prompt away, as an external store.
 *
 * `sessionStorage` is exactly the kind of thing `useSyncExternalStore` is for, and reaching
 * for it here rather than for a state-setting effect buys two things: the server snapshot is
 * "hidden", so a student who dismissed the prompt never sees it flash back on hydration, and
 * there is no render-then-correct pass to write a comment apologising for.
 *
 * It survives navigation within the tab, and deliberately not beyond it. This is an offer,
 * not a task — but it is one worth making again tomorrow.
 */
const DISMISS_KEY = 'dr:link-device:dismissed';

let dismissedSnapshot: boolean | null = null;
const dismissListeners = new Set<() => void>();

function subscribeDismissed(onChange: () => void) {
  dismissListeners.add(onChange);
  return () => {
    dismissListeners.delete(onChange);
  };
}

function getDismissed(): boolean {
  // Cached because a snapshot must be referentially stable between changes, and because a
  // private-mode browser that refuses storage would otherwise be asked on every render.
  if (dismissedSnapshot === null) {
    try {
      dismissedSnapshot = window.sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      // Private modes can refuse storage entirely. Showing the prompt is the harmless side
      // of that failure.
      dismissedSnapshot = false;
    }
  }
  return dismissedSnapshot;
}

/** Hidden while server-rendering: the prompt is a client-side offer, not part of the shell. */
function getDismissedOnServer(): boolean {
  return true;
}

function setDismissed() {
  dismissedSnapshot = true;
  try {
    window.sessionStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Nothing to do — it stays hidden for this page either way.
  }
  for (const listener of dismissListeners) listener();
}

export function LinkDeviceLauncher() {
  const [open, setOpen] = useState(false);
  const sheet = useDeviceLink();
  const dismissed = useSyncExternalStore(subscribeDismissed, getDismissed, getDismissedOnServer);

  return (
    <>
      {!dismissed && (
        <div className="animate-rise fixed right-5 bottom-5 z-40 hidden lg:flex">
          <div className="rounded-panel border-border bg-bg-elevated shadow-float flex items-center gap-1 border p-1">
            <button
              type="button"
              onClick={() => {
                // Minting happens here, in the gesture that asked for it, rather than in an
                // effect watching `open`. A code is a credential with a two-minute life; it
                // should be created by a student pressing a button and by nothing else.
                setOpen(true);
                void sheet.request();
              }}
              className="tap rounded-field text-fg hover:bg-bg-sunken flex items-center gap-2.5 px-3 py-2 text-sm font-semibold transition-colors"
            >
              <span className="bg-pulse-500/12 text-pulse-700 dark:text-pulse-300 grid size-8 place-items-center rounded-full">
                <Smartphone className="size-4.5" aria-hidden />
              </span>
              Open on your phone
            </button>
            <button
              type="button"
              onClick={() => setDismissed()}
              aria-label="Hide this for now"
              className="tap rounded-field text-fg-subtle hover:bg-bg-sunken hover:text-fg grid size-8 place-items-center transition-colors"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      )}

      <LinkDeviceSheet
        open={open}
        onClose={() => {
          setOpen(false);
          sheet.abandon();
        }}
        phase={sheet.phase}
        setPhase={sheet.setPhase}
        request={sheet.request}
      />
    </>
  );
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready'; offer: DeviceLinkOffer; secondsLeft: number }
  | { kind: 'expired' }
  | { kind: 'linked'; device: string | null }
  | { kind: 'error'; message: string };

/**
 * The code's lifecycle, held apart from the sheet that draws it.
 *
 * It lives up here in the launcher because minting is driven by the button press, not by the
 * sheet appearing: a two-minute credential should be created by a deliberate gesture, and
 * nothing else.
 */
function useDeviceLink() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  /*
   * Guards every async result against a sheet that has since been closed or re-opened.
   *
   * Without it, a slow mint from a previous opening can land after the student has asked for
   * a second code and overwrite the QR on screen with a dead one.
   */
  const generation = useRef(0);

  const request = useCallback(async () => {
    const mine = ++generation.current;
    setPhase({ kind: 'loading' });

    const result = await createDeviceLinkAction();
    if (generation.current !== mine) return;

    if (!result.ok) {
      setPhase({ kind: 'error', message: result.message });
      return;
    }

    setPhase({
      kind: 'ready',
      offer: result.data,
      secondsLeft: Math.max(0, Math.round((result.data.expiresAt - Date.now()) / 1000)),
    });
  }, []);

  /** Closing walks away from the code on screen; the next opening mints a fresh one. */
  const abandon = useCallback(() => {
    generation.current += 1;
  }, []);

  return { phase, setPhase, request, abandon };
}

function LinkDeviceSheet({
  open,
  onClose,
  phase,
  setPhase,
  request,
}: {
  open: boolean;
  onClose: () => void;
} & Omit<ReturnType<typeof useDeviceLink>, 'abandon'>) {
  /*
   * The countdown, and the poll, on one timer.
   *
   * Keyed on the code's id and expiry rather than on the whole phase, so ticking the seconds
   * down does not tear the interval down and rebuild it every second.
   *
   * The remaining time is recomputed from the server's timestamp each tick rather than
   * decremented locally, so a laptop that slept for a minute wakes up showing the truth
   * instead of a QR it still believes in.
   */
  const offerId = phase.kind === 'ready' ? phase.offer.id : null;
  const offerExpiresAt = phase.kind === 'ready' ? phase.offer.expiresAt : 0;

  useEffect(() => {
    if (!open || !offerId) return;

    let cancelled = false;

    const tick = async () => {
      const secondsLeft = Math.max(0, Math.round((offerExpiresAt - Date.now()) / 1000));

      const result = await deviceLinkStatusAction(offerId);
      if (cancelled) return;

      if (result.ok && result.data.status === 'linked') {
        setPhase({ kind: 'linked', device: result.data.device });
        return;
      }

      if (secondsLeft === 0 || (result.ok && result.data.status === 'expired')) {
        setPhase({ kind: 'expired' });
        return;
      }

      setPhase((current) =>
        current.kind === 'ready' && current.offer.id === offerId
          ? { ...current, secondsLeft }
          : current,
      );
    };

    const timer = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, offerId, offerExpiresAt, setPhase]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="sm"
      title="Open on your phone"
      description="Scan this with your phone's camera. It signs the phone in to this same account — your computer stays signed in too."
    >
      <div className="pt-2 pb-1">
        {phase.kind === 'loading' && <QrFrame>{null}</QrFrame>}

        {phase.kind === 'ready' && (
          <>
            <QrFrame>
              {/*
                The SVG comes from this app's own encoder, drawn on the server from a token
                it minted a moment ago. There is no user-supplied markup anywhere in it.
              */}
              <div
                className="[&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: phase.offer.svg }}
              />
            </QrFrame>
            <p className="text-fg-muted mt-4 text-center text-sm">
              This code expires in{' '}
              <span className="text-fg font-semibold tabular-nums">
                {formatCountdown(phase.secondsLeft)}
              </span>{' '}
              and works once.
            </p>
            <p className="text-fg-subtle mt-1.5 text-center text-xs">
              Treat it like your password — anyone who scans it is signed in as you.
            </p>
          </>
        )}

        {phase.kind === 'expired' && (
          <Message
            tone="muted"
            title="That code has expired"
            body="Codes last two minutes so a stray screenshot cannot be used later."
            action={
              <Button size="sm" variant="outline" onClick={request}>
                <RefreshCw className="size-4" aria-hidden />
                Show a new code
              </Button>
            }
          />
        )}

        {phase.kind === 'linked' && (
          <Message
            tone="success"
            title={phase.device ? `Signed in on your ${phase.device}` : 'Signed in on your phone'}
            body="Both devices are signed in now. Nothing here has been signed out."
            action={
              <Button size="sm" variant="outline" onClick={onClose}>
                Done
              </Button>
            }
          />
        )}

        {phase.kind === 'error' && (
          <Message
            tone="danger"
            title="We could not create a code"
            body={phase.message}
            action={
              <Button size="sm" variant="outline" onClick={request}>
                <RefreshCw className="size-4" aria-hidden />
                Try again
              </Button>
            }
          />
        )}
      </div>
    </Sheet>
  );
}

/**
 * The square the QR lives in.
 *
 * Always white, in both themes, and that is a scanning requirement rather than a style
 * choice: the encoder draws black modules, and inverting them for dark mode produces a code
 * many phone cameras will not read.
 */
function QrFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-center">
      <div
        className={cn(
          'rounded-panel border-border grid size-56 place-items-center border bg-white p-2',
          !children && 'animate-pulse',
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Message({
  tone,
  title,
  body,
  action,
}: {
  tone: 'muted' | 'success' | 'danger';
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div className="py-6 text-center">
      <span
        className={cn(
          'mx-auto grid size-12 place-items-center rounded-full',
          tone === 'success' && 'bg-success/12 text-success',
          tone === 'danger' && 'bg-danger/10 text-danger',
          tone === 'muted' && 'bg-bg-sunken text-fg-subtle',
        )}
      >
        {tone === 'success' ? (
          <Check className="size-6" aria-hidden />
        ) : (
          <Smartphone className="size-6" aria-hidden />
        )}
      </span>
      <p className="text-fg mt-3.5 font-bold">{title}</p>
      <p className="text-fg-muted mx-auto mt-1.5 max-w-xs text-sm">{body}</p>
      <div className="mt-5">{action}</div>
    </div>
  );
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
