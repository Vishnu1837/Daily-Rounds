'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { FormError, Select, TextArea, TextInput } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import type { EventType } from '@/db/schema';
import {
  deleteAnnouncementAction,
  deleteEventAction,
  saveAnnouncementAction,
  saveEventAction,
} from '@/server/actions/admin';

type Event = {
  id: string;
  type: EventType;
  title: string;
  description: string | null;
  date: string;
  startTime: string;
  endTime: string;
  meetUrl: string | null;
};

type Announcement = { id: string; title: string; body: string; isPinned: boolean };

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'workshop', label: 'Workshop' },
  { value: 'guest_session', label: 'Guest session' },
  { value: 'weekly_review', label: 'Weekly review' },
  { value: 'assessment', label: 'Assessment' },
  { value: 'study_room', label: 'Study room' },
  { value: 'other', label: 'Other' },
];

export function EventsScreen({
  cohortId,
  defaultMeetUrl,
  events,
  announcements,
}: {
  cohortId: string;
  defaultMeetUrl: string | null;
  events: Event[];
  announcements: Announcement[];
}) {
  const [eventSheet, setEventSheet] = useState<{ open: boolean; event: Event | null }>({
    open: false,
    event: null,
  });
  const [announcementSheet, setAnnouncementSheet] = useState<{
    open: boolean;
    announcement: Announcement | null;
  }>({ open: false, announcement: null });

  return (
    <div className="space-y-4">
      <header className="px-1 pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">Events &amp; announcements</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Everything here appears on the student calendar and home screen.
        </p>
      </header>

      <Card>
        <CardHeader
          title="Announcements"
          description="Pinned announcements show at the top of every student's home screen."
          action={
            <Button
              size="sm"
              onClick={() => setAnnouncementSheet({ open: true, announcement: null })}
            >
              <Plus className="size-3.5" aria-hidden />
              New
            </Button>
          }
        />
        {announcements.length === 0 ? (
          <EmptyState
            emoji="📣"
            title="No announcements"
            description="Post one when something changes — a new meet time, a schedule shift, a nudge."
          />
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {announcements.map((a) => (
              <li key={a.id} className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-fg">{a.title}</p>
                    {a.isPinned && <Badge tone="pulse">Pinned</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-fg-muted">{a.body}</p>
                </div>
                <RowActions
                  onEdit={() => setAnnouncementSheet({ open: true, announcement: a })}
                  onDelete={async () => deleteAnnouncementAction(cohortId, a.id)}
                  label={a.title}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Events"
          description="Workshops, guest sessions, reviews and assessments."
          action={
            <Button size="sm" onClick={() => setEventSheet({ open: true, event: null })}>
              <Plus className="size-3.5" aria-hidden />
              New
            </Button>
          }
        />
        {events.length === 0 ? (
          <EmptyState
            emoji="📅"
            title="No events scheduled"
            description="Add a workshop or guest session and it will show up on every student's calendar."
          />
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-fg">{e.title}</p>
                    <Badge>{EVENT_TYPES.find((t) => t.value === e.type)?.label ?? e.type}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">
                    {e.date} · {e.startTime}–{e.endTime}
                  </p>
                  {e.description && (
                    <p className="mt-1 text-sm text-fg-muted">{e.description}</p>
                  )}
                </div>
                <RowActions
                  onEdit={() => setEventSheet({ open: true, event: e })}
                  onDelete={async () => deleteEventAction(cohortId, e.id)}
                  label={e.title}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Sheet
        open={eventSheet.open}
        onClose={() => setEventSheet({ open: false, event: null })}
        title={eventSheet.event ? 'Edit event' : 'New event'}
      >
        <EventForm
          cohortId={cohortId}
          defaultMeetUrl={defaultMeetUrl}
          event={eventSheet.event}
          onDone={() => setEventSheet({ open: false, event: null })}
        />
      </Sheet>

      <Sheet
        open={announcementSheet.open}
        onClose={() => setAnnouncementSheet({ open: false, announcement: null })}
        title={announcementSheet.announcement ? 'Edit announcement' : 'New announcement'}
      >
        <AnnouncementForm
          cohortId={cohortId}
          announcement={announcementSheet.announcement}
          onDone={() => setAnnouncementSheet({ open: false, announcement: null })}
        />
      </Sheet>
    </div>
  );
}

function RowActions({
  onEdit,
  onDelete,
  label,
}: {
  onEdit: () => void;
  onDelete: () => Promise<{ ok: boolean; message?: string }>;
  label: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex shrink-0 gap-1">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${label}`}
        className="tap grid size-8 place-items-center rounded-lg text-fg-subtle hover:bg-bg-sunken hover:text-fg"
      >
        <Pencil className="size-3.5" aria-hidden />
      </button>
      {confirming ? (
        <div className="flex items-center gap-1">
          <Button
            variant="danger"
            size="sm"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await onDelete();
                if (!result.ok) {
                  toast.error('Could not delete', result.message ?? 'Please try again.');
                  return;
                }
                toast.success('Deleted');
                setConfirming(false);
                router.refresh();
              })
            }
          >
            Confirm
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${label}`}
          className="tap grid size-8 place-items-center rounded-lg text-fg-subtle hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

function EventForm({
  cohortId,
  defaultMeetUrl,
  event,
  onDone,
}: {
  cohortId: string;
  defaultMeetUrl: string | null;
  event: Event | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <form
      className="space-y-4 pt-2"
      action={(formData) =>
        startTransition(async () => {
          setMessage(undefined);
          setErrors({});
          const result = await saveEventAction(event?.id ?? null, null, formData);
          if (!result.ok) {
            setMessage(result.message);
            setErrors(result.errors ?? {});
            return;
          }
          toast.success(event ? 'Event updated' : 'Event created');
          onDone();
          router.refresh();
        })
      }
    >
      <input type="hidden" name="cohortId" value={cohortId} />
      <FormError>{message}</FormError>
      <TextInput label="Title" name="title" defaultValue={event?.title ?? ''} required error={errors.title} />
      <Select label="Type" name="type" defaultValue={event?.type ?? 'workshop'}>
        {EVENT_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      <TextArea
        label="Description"
        name="description"
        defaultValue={event?.description ?? ''}
        error={errors.description}
      />
      <TextInput label="Date" name="date" type="date" defaultValue={event?.date ?? ''} required error={errors.date} />
      <div className="grid grid-cols-2 gap-3">
        <TextInput
          label="Start"
          name="startTime"
          type="time"
          defaultValue={event?.startTime ?? '19:00'}
          required
          error={errors.startTime}
        />
        <TextInput
          label="End"
          name="endTime"
          type="time"
          defaultValue={event?.endTime ?? '20:00'}
          required
          error={errors.endTime}
        />
      </div>
      <TextInput
        label="Meeting link (optional)"
        name="meetUrl"
        type="url"
        defaultValue={event?.meetUrl ?? defaultMeetUrl ?? ''}
        error={errors.meetUrl}
        placeholder="https://meet.google.com/..."
      />
      <Button type="submit" size="lg" fullWidth loading={pending}>
        {event ? 'Save event' : 'Create event'}
      </Button>
    </form>
  );
}

function AnnouncementForm({
  cohortId,
  announcement,
  onDone,
}: {
  cohortId: string;
  announcement: Announcement | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <form
      className="space-y-4 pt-2"
      action={(formData) =>
        startTransition(async () => {
          setMessage(undefined);
          setErrors({});
          const result = await saveAnnouncementAction(announcement?.id ?? null, null, formData);
          if (!result.ok) {
            setMessage(result.message);
            setErrors(result.errors ?? {});
            return;
          }
          toast.success(announcement ? 'Announcement updated' : 'Announcement posted');
          onDone();
          router.refresh();
        })
      }
    >
      <input type="hidden" name="cohortId" value={cohortId} />
      <FormError>{message}</FormError>
      <TextInput
        label="Title"
        name="title"
        defaultValue={announcement?.title ?? ''}
        required
        error={errors.title}
      />
      <TextArea
        label="Message"
        name="body"
        rows={5}
        defaultValue={announcement?.body ?? ''}
        required
        error={errors.body}
      />
      <label className="flex items-center gap-2.5 text-sm font-semibold text-fg">
        <input
          type="checkbox"
          name="isPinned"
          defaultChecked={announcement?.isPinned ?? false}
          className="size-5 rounded border-border-strong accent-[var(--color-pulse-600)]"
        />
        Pin to the top of every home screen
      </label>
      <Button type="submit" size="lg" fullWidth loading={pending}>
        {announcement ? 'Save announcement' : 'Post announcement'}
      </Button>
    </form>
  );
}
