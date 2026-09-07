'use client';

import { useTransition } from 'react';
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

  return (
    <div className="bg-flame-600 text-white">
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
