'use client';

import { useEffect, useRef, useTransition } from 'react';
import { Eye } from 'lucide-react';

import { stopStudentViewAction } from '@/server/actions/student-view';

/**
 * Persistent bar shown on every student screen while an admin is "viewing as" a student.
 *
 * It is the only always-visible reminder that the account on screen is not the admin's own,
 * and it carries the way out. Rendered by `ViewingAsBanner` in `src/app/(app)/shell.tsx`,
 * which decides whether a view-as session is active.
 */
export function ViewingAsBanner({
  studentName,
  adminName,
}: {
  studentName: string;
  adminName: string;
}) {
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  /*
   * Publishes the bar's height to the document as `--viewing-as-height`.
   *
   * The bar sits above everything and pushes the whole app down the page, so anything sized
   * against the height of the window — the flashcard, whose ceiling is what keeps its grade
   * buttons above the fold — is working from a viewport it does not entirely have. It has to
   * subtract this, and it cannot be told the number in advance: the bar is conditional, and
   * its sentence wraps to one line on a desktop and three on a phone, so its height is a
   * layout outcome rather than a constant.
   *
   * Observed rather than measured once because that wrapping changes with the width of the
   * window and with the length of the two names in it. Cleared on unmount — the bar's whole
   * purpose is to be dismissed, and a stale reservation would cost every later card the
   * height of a bar that is no longer there.
   */
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const root = document.documentElement;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      root.style.setProperty('--viewing-as-height', `${Math.round(height)}px`);
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
      root.style.removeProperty('--viewing-as-height');
    };
  }, []);

  return (
    <div ref={ref} className="bg-flame-600 text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 text-sm lg:px-8">
        <Eye className="size-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 font-medium">
          Viewing the app as <strong className="font-bold">{studentName}</strong>
          <span className="text-white/75"> · signed in as {adminName}</span>
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => void stopStudentViewAction())}
          className="tap rounded-field shrink-0 bg-white/15 px-3 py-1 font-semibold whitespace-nowrap transition-colors hover:bg-white/25 disabled:opacity-60"
        >
          {pending ? 'Exiting…' : 'Exit student view'}
        </button>
      </div>
    </div>
  );
}
