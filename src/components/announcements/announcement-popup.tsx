'use client';

import { useState, useTransition } from 'react';
import { Megaphone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { acknowledgeAnnouncementAction } from '@/server/actions/study';

export type PopupAnnouncementView = {
  id: string;
  title: string;
  body: string;
};

/**
 * The announcement a student sees on entering the portal.
 *
 * Shows one at a time and advances through the queue, rather than stacking modals. "Got it"
 * acknowledges on the server so the notice does not follow them to another device; the
 * announcement itself stays in the normal announcements list either way, so dismissing
 * never loses information.
 *
 * Dismissing optimistically closes the modal without waiting for the write. An
 * acknowledgement that fails is worth retrying silently next visit, and is never worth
 * making someone sit and watch a spinner to get to their dashboard.
 */
export function AnnouncementPopup({ announcements }: { announcements: PopupAnnouncementView[] }) {
  const [index, setIndex] = useState(0);
  const [, startTransition] = useTransition();

  const current = announcements[index];
  if (!current) return null;

  function dismiss() {
    const id = current!.id;
    setIndex((i) => i + 1);
    startTransition(async () => {
      await acknowledgeAnnouncementAction(id);
    });
  }

  const remaining = announcements.length - index - 1;

  return (
    <Sheet open onClose={dismiss} title={current.title}>
      <div className="space-y-5 p-5">
        <span className="bg-pulse-500/12 text-pulse-600 dark:text-pulse-300 grid size-10 place-items-center rounded-xl">
          <Megaphone className="size-5" aria-hidden />
        </span>

        {/* Announcements are plain text written by a cohort lead; paragraphs are blank lines. */}
        <div className="space-y-3">
          {current.body.split(/\n{2,}/).map((paragraph, i) => (
            <p key={i} className="text-fg-muted text-sm leading-relaxed whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button size="lg" fullWidth onClick={dismiss}>
            {remaining > 0 ? `Got it — ${remaining} more` : 'Got it'}
          </Button>
        </div>

        <p className="text-fg-subtle text-xs">
          You can read this again any time under announcements.
        </p>
      </div>
    </Sheet>
  );
}
