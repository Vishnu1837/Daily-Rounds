'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, ChevronRight, Megaphone, MessageSquareHeart } from 'lucide-react';

import { FeedbackSurveySheet } from '@/components/feedback/feedback-survey';
import { Sheet } from '@/components/ui/sheet';
import { EmptyState } from '@/components/ui/feedback';
import { cn } from '@/lib/cn';
import { FEEDBACK_PROMPT, type NotificationInbox } from '@/lib/domain/feedback';
import { acknowledgeAnnouncementAction } from '@/server/actions/study';

/** "3 Sept" for anything this year, "3 Sept 2025" once it is not. */
function when(iso: string): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/**
 * The bell in the header, and the panel behind it.
 *
 * Two kinds of thing share this list and they are deliberately not equal. The feedback
 * request sits at the top with a colour and a chevron, because it is a *task* — it is unread
 * until it is answered, and answering it is the only thing that removes it. Announcements sit
 * below as plain rows, because there is nothing to do about them; opening the panel is the
 * whole interaction, and it marks them read.
 *
 * That distinction is the point of the feature. A student who closes the popup has not
 * declined to help — they were mid-something. The bell is what makes closing it safe.
 */
export function NotificationBell({ inbox }: { inbox: NotificationInbox }) {
  const router = useRouter();
  const [panelOpen, setPanelOpen] = useState(false);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [, startAcknowledge] = useTransition();

  const unreadAnnouncements = inbox.announcements.filter((a) => a.unread);
  const showFeedback = !inbox.prompt.answered;
  const count = inbox.unreadCount;

  function openPanel() {
    setPanelOpen(true);

    /*
     * Opening the panel is the acknowledgement for announcements — they are notices, and a
     * separate "mark as read" on each one would be a second click for no decision. Fired
     * without awaiting: the list is already on screen, and a failed write only means the dot
     * is still there next time.
     *
     * The feedback request is untouched by this on purpose. It clears when it is *answered*,
     * not when it is seen, which is exactly what makes it different from a notice.
     */
    if (unreadAnnouncements.length === 0) return;
    startAcknowledge(async () => {
      await Promise.all(unreadAnnouncements.map((a) => acknowledgeAnnouncementAction(a.id)));
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        className="tap rounded-field text-fg-muted hover:bg-bg-sunken hover:text-fg relative grid size-9.5 place-items-center transition-colors"
      >
        <Bell className="size-[18px]" aria-hidden />
        {count > 0 && (
          /*
           * A count, not a dot. "You have something waiting" and "you have four things
           * waiting" call for different amounts of curiosity, and the number is the only
           * thing that tells them apart before the panel opens.
           */
          <span
            className="bg-flame-500 text-2xs ring-bg-elevated absolute -top-0.5 -right-0.5 grid min-w-4.5 place-items-center rounded-full px-1 font-bold text-white tabular-nums ring-2"
            aria-hidden
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      <Sheet
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title="Notifications"
        description={
          showFeedback
            ? 'One thing needs your answer.'
            : inbox.announcements.length > 0
              ? 'Everything your cohort lead has posted.'
              : undefined
        }
      >
        <div className="space-y-3 pt-1">
          {showFeedback && (
            <button
              type="button"
              onClick={() => {
                setPanelOpen(false);
                setSurveyOpen(true);
              }}
              className={cn(
                'rounded-panel border-pulse-500/30 bg-pulse-500/8 hover:bg-pulse-500/14 flex w-full items-start gap-3 border p-4 text-left transition-colors',
              )}
            >
              <span className="bg-pulse-500/15 text-pulse-600 dark:text-pulse-300 grid size-9 shrink-0 place-items-center rounded-xl">
                <MessageSquareHeart className="size-4.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-fg block text-sm font-bold">{FEEDBACK_PROMPT.title}</span>
                <span className="text-fg-muted mt-0.5 block text-sm leading-relaxed">
                  {FEEDBACK_PROMPT.summary}
                </span>
                <span className="text-pulse-700 dark:text-pulse-300 mt-2 block text-xs font-bold">
                  Tap to answer
                </span>
              </span>
              <ChevronRight className="text-fg-subtle mt-1 size-4 shrink-0" aria-hidden />
            </button>
          )}

          {inbox.announcements.map((announcement) => (
            <article
              key={announcement.id}
              className="rounded-panel border-border bg-bg-sunken border p-4"
            >
              <div className="flex items-start gap-3">
                <span className="bg-iris-500/12 text-iris-600 dark:text-iris-300 grid size-9 shrink-0 place-items-center rounded-xl">
                  <Megaphone className="size-4.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-fg truncate text-sm font-bold">{announcement.title}</h3>
                    <span className="text-fg-subtle text-2xs shrink-0 tabular-nums">
                      {when(announcement.createdAt)}
                    </span>
                  </div>
                  {/* Plain text written by a cohort lead; paragraphs are blank lines. */}
                  {announcement.body.split(/\n{2,}/).map((paragraph, i) => (
                    <p
                      key={i}
                      className="text-fg-muted mt-1.5 text-sm leading-relaxed whitespace-pre-line"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            </article>
          ))}

          {!showFeedback && inbox.announcements.length === 0 && (
            <EmptyState
              icon={<Bell className="size-6" aria-hidden />}
              title="Nothing waiting"
              description="Announcements from your cohort lead land here, and stay so you can read them again."
            />
          )}
        </div>
      </Sheet>

      <FeedbackSurveySheet open={surveyOpen} onClose={() => setSurveyOpen(false)} />
    </>
  );
}

/**
 * The bell before the inbox has streamed in.
 *
 * The same footprint as the real button rather than a shimmer: this sits in a sticky header
 * next to the avatar, and anything that changes width when the data lands shoves the rest of
 * the row sideways on every page load.
 */
export function NotificationBellSkeleton() {
  return <span className="bg-bg-sunken block size-9.5 animate-pulse rounded-xl" aria-hidden />;
}
