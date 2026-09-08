'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, MessageSquareHeart, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TextArea } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import {
  FEEDBACK_ACCEPT,
  FEEDBACK_ATTACHMENT_MAX_BYTES,
  FEEDBACK_IMAGE_MAX_EDGE,
  FEEDBACK_MAX_ATTACHMENTS,
  FEEDBACK_PROMPT,
  FEEDBACK_TEXT_MAX,
  formatBytes,
  isFeedbackImageType,
} from '@/lib/domain/feedback';
import { haptic } from '@/lib/haptics';
import { dismissFeedbackPromptAction, submitFeedbackAction } from '@/server/actions/feedback';

/**
 * Re-encodes a picked image down to something worth storing.
 *
 * This is the difference between the feature being cheap and being a liability. A modern
 * phone screenshot is a 6-megapixel PNG at two to four megabytes; three of those on a report
 * is ten megabytes in a Postgres column for evidence a person glances at once. Drawing it
 * through a canvas at `FEEDBACK_IMAGE_MAX_EDGE` and re-encoding as WebP typically lands the
 * same screenshot around 200–400 KB, with the on-screen text still perfectly legible — which
 * is the only thing a bug screenshot has to preserve.
 *
 * Every failure path returns the original file rather than throwing. An older browser with
 * no `createImageBitmap`, a HEIC the decoder will not open, a canvas that refuses to encode
 * WebP — none of those are reasons a student cannot report a bug. The server's own size cap
 * is what stops an unshrunk image being stored, and it produces a message they can act on.
 */
async function shrinkImage(file: File): Promise<File> {
  if (typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, FEEDBACK_IMAGE_MAX_EDGE / longest);

    // Already small and already light: re-encoding would only lose detail for nothing.
    if (scale === 1 && file.size <= 400 * 1024) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.85),
    );

    // `toBlob` silently falls back to PNG when a format is unsupported, which for a
    // screenshot is usually *larger* than what we started with. Keep whichever is smaller.
    if (!blob || !isFeedbackImageType(blob.type) || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') || 'screenshot';
    return new File([blob], `${name}.webp`, { type: blob.type });
  } finally {
    bitmap.close();
  }
}

type Picked = {
  /** Stable across re-renders so React keys and the revoke below agree about which is which. */
  key: string;
  file: File;
  previewUrl: string;
};

/**
 * The feedback form itself.
 *
 * One component behind two doors — the popup that arrives unasked, and the notification bell
 * a student opens later. They differ only in `onDismiss`: the popup has a "Not now" that
 * records the interruption is over, the bell has nothing to record because opening it was
 * already deliberate.
 */
export function FeedbackSurveySheet({
  open,
  onClose,
  /**
   * Called when the sheet is closed *without* an answer. The popup passes the action that
   * writes the dismissal; the bell passes nothing, because closing a panel you opened
   * yourself is not a statement about anything.
   */
  onDismiss,
}: {
  open: boolean;
  onClose: () => void;
  onDismiss?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [issues, setIssues] = useState('');
  const [suggestions, setSuggestions] = useState('');
  const [picked, setPicked] = useState<Picked[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [sending, startSending] = useTransition();

  /*
   * Object URLs are a manual allocation. Without this the previews leak for as long as the
   * tab is open — which, on a habit app people leave in a background tab all evening, is a
   * long time.
   *
   * The list is read through a ref rather than being a dependency: an effect that depended
   * on `picked` would run its cleanup on every add and revoke the previews of the images
   * that are staying, which shows up as thumbnails going blank as you attach the next one.
   * Removing one image revokes that one URL where it happens, in `removeAt`.
   */
  const pickedRef = useRef(picked);
  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);
  useEffect(
    () => () => {
      for (const item of pickedRef.current) URL.revokeObjectURL(item.previewUrl);
    },
    [],
  );

  const addFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError(null);

      const room = FEEDBACK_MAX_ATTACHMENTS - picked.length;
      if (room <= 0) {
        setError(`You can attach up to ${FEEDBACK_MAX_ATTACHMENTS} screenshots.`);
        return;
      }

      setPreparing(true);
      try {
        const accepted: Picked[] = [];
        for (const file of Array.from(files).slice(0, room)) {
          if (!file.type.startsWith('image/')) {
            setError('Screenshots only — pick a PNG, JPEG or WebP image.');
            continue;
          }
          const shrunk = await shrinkImage(file);
          if (shrunk.size > FEEDBACK_ATTACHMENT_MAX_BYTES) {
            setError(
              `“${file.name}” is ${formatBytes(shrunk.size)}, which is more than we can store. Try cropping it first.`,
            );
            continue;
          }
          accepted.push({
            key: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
            file: shrunk,
            previewUrl: URL.createObjectURL(shrunk),
          });
        }

        if (files.length > room) {
          setError(`Only the first ${room} were added — ${FEEDBACK_MAX_ATTACHMENTS} is the limit.`);
        }
        if (accepted.length > 0) setPicked((current) => [...current, ...accepted]);
      } finally {
        setPreparing(false);
        // Let the same file be picked again after it is removed; without this the input
        // holds the old value and the change event never fires a second time.
        if (fileInput.current) fileInput.current.value = '';
      }
    },
    [picked.length],
  );

  function removeAt(key: string) {
    setPicked((current) => {
      const going = current.find((item) => item.key === key);
      if (going) URL.revokeObjectURL(going.previewUrl);
      return current.filter((item) => item.key !== key);
    });
  }

  function close() {
    onDismiss?.();
    onClose();
  }

  function submit() {
    const trimmedIssues = issues.trim();
    const trimmedSuggestions = suggestions.trim();

    // Checked here as well as on the server so the student is told before the round trip.
    if (!trimmedIssues && !trimmedSuggestions) {
      setError('Tell us about an issue or share a suggestion — either one is enough.');
      return;
    }

    setError(null);
    const form = new FormData();
    form.set('promptKey', FEEDBACK_PROMPT.key);
    form.set('issues', trimmedIssues);
    form.set('suggestions', trimmedSuggestions);
    for (const item of picked) form.append('screenshots', item.file);

    startSending(async () => {
      const result = await submitFeedbackAction(form);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      haptic('commit');
      toast.success('Thank you — this is with the team', 'We read every one of these.');
      onClose();
      // The bell reads its unread state on the server, so the panel and the dot only agree
      // with the database once this lands.
      router.refresh();
    });
  }

  const busy = sending || preparing;

  return (
    <Sheet
      open={open}
      onClose={close}
      title={FEEDBACK_PROMPT.title}
      description={FEEDBACK_PROMPT.summary}
      size="md"
      dismissible={!sending}
      footer={
        <div className="flex items-center gap-3">
          <Button size="lg" fullWidth loading={sending} onClick={submit}>
            Send to the team
          </Button>
          {onDismiss && (
            <Button
              size="lg"
              variant="ghost"
              onClick={close}
              disabled={sending}
              // The primary button is `fullWidth`, so without these the flex row squeezes
              // this one until "Not now" breaks across two lines.
              className="shrink-0 whitespace-nowrap"
            >
              Not now
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5 pt-1">
        <div className="rounded-panel border-border bg-bg-sunken border p-4">
          <span className="bg-pulse-500/12 text-pulse-600 dark:text-pulse-300 mb-3 grid size-10 place-items-center rounded-xl">
            <MessageSquareHeart className="size-5" aria-hidden />
          </span>
          {FEEDBACK_PROMPT.body.map((paragraph) => (
            <p key={paragraph} className="text-fg-muted mt-2 text-sm leading-relaxed first:mt-0">
              {paragraph}
            </p>
          ))}
          <p className="text-fg mt-3 text-sm font-semibold">— {FEEDBACK_PROMPT.signature}</p>
        </div>

        <TextArea
          label={FEEDBACK_PROMPT.issuesLabel}
          placeholder={FEEDBACK_PROMPT.issuesPlaceholder}
          rows={5}
          maxLength={FEEDBACK_TEXT_MAX}
          value={issues}
          onChange={(e) => setIssues(e.target.value)}
          disabled={sending}
        />

        <TextArea
          label={FEEDBACK_PROMPT.suggestionsLabel}
          placeholder={FEEDBACK_PROMPT.suggestionsPlaceholder}
          rows={4}
          maxLength={FEEDBACK_TEXT_MAX}
          value={suggestions}
          onChange={(e) => setSuggestions(e.target.value)}
          disabled={sending}
        />

        {/* ------------------------------------------------------ screenshots */}
        <div className="space-y-2">
          <p className="text-fg text-sm font-semibold">
            Screenshots{' '}
            <span className="text-fg-subtle font-medium">
              — optional, up to {FEEDBACK_MAX_ATTACHMENTS}
            </span>
          </p>

          {picked.length > 0 && (
            <ul className="flex flex-wrap gap-2.5">
              {picked.map((item) => (
                <li key={item.key} className="relative">
                  {/*
                    A local object URL, so this never touches the network and never needs an
                    optimiser. `next/image` would want dimensions we do not have yet.
                  */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.previewUrl}
                    alt={item.file.name}
                    className="rounded-field border-border size-20 border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeAt(item.key)}
                    aria-label={`Remove ${item.file.name}`}
                    disabled={sending}
                    className="bg-bg-elevated border-border text-fg-muted hover:text-danger absolute -top-2 -right-2 grid size-6 place-items-center rounded-full border shadow-sm transition-colors"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                  <span className="text-2xs text-fg-subtle mt-1 block text-center tabular-nums">
                    {formatBytes(item.file.size)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {picked.length < FEEDBACK_MAX_ATTACHMENTS && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className={cn(
                'rounded-field border-border-strong text-fg-muted hover:border-pulse-500 hover:text-fg flex w-full items-center justify-center gap-2',
                'border border-dashed py-3.5 text-sm font-semibold transition-colors disabled:opacity-50',
              )}
            >
              <ImagePlus className="size-4" aria-hidden />
              {preparing ? 'Preparing…' : 'Add a screenshot'}
            </button>
          )}

          <input
            ref={fileInput}
            type="file"
            accept={FEEDBACK_ACCEPT}
            multiple
            className="sr-only"
            onChange={(e) => void addFiles(e.target.files)}
          />

          <p className="text-fg-subtle text-xs">
            Images are shrunk on your phone before they are sent, so this works on slow data.
          </p>
        </div>

        {error && (
          <p className="text-danger text-sm font-medium" role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/**
 * The one-time popup.
 *
 * It opens itself on mount and, whichever way it is closed, records the dismissal — so this
 * interrupts a student exactly once. What happens next is the notification bell's job: the
 * request stays there until it is answered, which is what makes interrupting once enough.
 *
 * The dismissal is fired without waiting for it. A student who closes this and immediately
 * navigates away should not be held on a spinner for a write whose worst failure is being
 * asked once more tomorrow.
 */
export function FeedbackPromptPopup() {
  const [open, setOpen] = useState(true);
  const [, startDismiss] = useTransition();

  return (
    <FeedbackSurveySheet
      open={open}
      onClose={() => setOpen(false)}
      onDismiss={() =>
        startDismiss(async () => {
          await dismissFeedbackPromptAction(FEEDBACK_PROMPT.key);
        })
      }
    />
  );
}
