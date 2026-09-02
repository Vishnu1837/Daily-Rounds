'use client';

import { useMemo, useState, useTransition } from 'react';
import { Download, Inbox, Search, Trash2 } from 'lucide-react';

import { StatusPill } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { Select, TextArea, TextInput } from '@/components/ui/form';
import { PageHeader } from '@/components/ui/page-header';
import { Sheet } from '@/components/ui/sheet';
import { StatTile } from '@/components/ui/stat';
import { useToast } from '@/components/ui/toast';
import type { WaitlistStatus } from '@/db/schema';
import { cn } from '@/lib/cn';
import {
  WAITLIST_STATUSES,
  WAITLIST_STATUS_LABELS,
  WAITLIST_STATUS_TONES,
  type WaitlistRow,
  matchesWaitlistQuery,
  waitlistCsvFilename,
} from '@/lib/domain/waitlist';
import {
  deleteWaitlistEntryAction,
  exportWaitlistCsvAction,
  setWaitlistNoteAction,
  setWaitlistStatusAction,
} from '@/server/actions/waitlist';

const YEAR_LABELS: Record<number, string> = {
  1: 'First year',
  2: 'Second year',
  3: 'Third year',
  4: 'Fourth year',
  5: 'Internship',
};

function submittedAt(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Everyone who asked to be told about the next cohort.
 *
 * The list is the whole feature: an admin opens this to answer "who came in overnight,
 * which of them have I already spoken to, and can I get the lot into a spreadsheet". So the
 * three controls — search, status filter, export — sit above the rows rather than behind a
 * menu, and the status control is on the row itself, because marking someone contacted is
 * the single action that happens most.
 */
export function WaitlistScreen({ entries, today }: { entries: WaitlistRow[]; today: string }) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<WaitlistStatus | 'all'>('all');
  const [open, setOpen] = useState<WaitlistRow | null>(null);
  const [exporting, startExport] = useTransition();

  /*
   * Server state is mirrored locally so a status change repaints on the same frame as the
   * click. `router.refresh()` alone left the select showing the old value for as long as
   * the round trip took, which reads as the click having missed.
   */
  const [rows, setRows] = useState(entries);

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: rows.length };
    for (const s of WAITLIST_STATUSES) out[s] = 0;
    for (const row of rows) out[row.status] = (out[row.status] ?? 0) + 1;
    return out;
  }, [rows]);

  const visible = useMemo(
    () =>
      rows.filter(
        (row) => (status === 'all' || row.status === status) && matchesWaitlistQuery(row, query),
      ),
    [rows, query, status],
  );

  const patch = (id: string, changes: Partial<WaitlistRow>) =>
    setRows((current) => current.map((r) => (r.id === id ? { ...r, ...changes } : r)));

  const changeStatus = (row: WaitlistRow, next: WaitlistStatus) => {
    const previous = row.status;
    patch(row.id, { status: next });
    void setWaitlistStatusAction(row.id, next).then((result) => {
      if (result.ok) return;
      patch(row.id, { status: previous });
      toast.error('Could not update that entry', result.message);
    });
  };

  const remove = (row: WaitlistRow) => {
    if (!window.confirm(`Delete ${row.fullName}'s waitlist entry? This cannot be undone.`)) return;
    const snapshot = rows;
    setRows((current) => current.filter((r) => r.id !== row.id));
    setOpen(null);
    void deleteWaitlistEntryAction(row.id).then((result) => {
      if (result.ok) {
        toast.success('Entry deleted');
        return;
      }
      setRows(snapshot);
      toast.error('Could not delete that entry', result.message);
    });
  };

  const exportCsv = () =>
    startExport(async () => {
      const result = await exportWaitlistCsvAction();
      if (!result.ok) {
        toast.error('Could not export the waitlist', result.message);
        return;
      }
      // The BOM is what makes Excel read the file as UTF-8 rather than as the local
      // codepage, which is the difference between "Anjali" and "AnjalÃ­" in the admin's
      // spreadsheet.
      const blob = new Blob([`﻿${result.data.csv}`], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = waitlistCsvFilename(today);
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Waitlist exported', `${result.data.count} entries`);
    });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Next cohort"
        title="Waitlist"
        description="Everyone who filled in the form on the public site. Visible to admins only."
        actions={
          <Button size="md" variant="outline" onClick={exportCsv} loading={exporting}>
            <Download className="size-4" aria-hidden />
            Export CSV
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total enquiries" value={counts.all ?? 0} tone="pulse" emphasis />
        <StatTile label="New" value={counts.new ?? 0} tone="flame" />
        <StatTile label="Contacted" value={counts.contacted ?? 0} tone="iris" />
        <StatTile label="Joined" value={counts.enrolled ?? 0} tone="success" />
      </div>

      <div className="flex flex-wrap gap-2">
        <TextInput
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, number, email, college or challenge"
          aria-label="Search the waitlist"
          leading={<Search className="size-4" aria-hidden />}
          className="min-w-[14rem] flex-1"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as WaitlistStatus | 'all')}
          aria-label="Filter by status"
          className="w-auto"
        >
          <option value="all">All statuses ({counts.all ?? 0})</option>
          {WAITLIST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {WAITLIST_STATUS_LABELS[s]} ({counts[s] ?? 0})
            </option>
          ))}
        </Select>
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox className="size-6" aria-hidden />}
            title={rows.length === 0 ? 'No enquiries yet' : 'Nothing matched'}
            description={
              rows.length === 0
                ? 'Submissions from the “Join the waitlist” form on the public site land here.'
                : 'Try a different search, or clear the status filter.'
            }
          />
        </Card>
      ) : (
        <Card className="divide-border divide-y p-0">
          {visible.map((row) => (
            <div key={row.id} className="flex flex-wrap items-start gap-3 p-4">
              <button
                type="button"
                onClick={() => setOpen(row)}
                className="tap min-w-0 flex-1 text-left"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-fg text-sm font-bold">{row.fullName}</span>
                  <StatusPill
                    tone={WAITLIST_STATUS_TONES[row.status]}
                    label={WAITLIST_STATUS_LABELS[row.status]}
                  />
                </span>
                <span className="text-fg-muted mt-1 block truncate text-sm">
                  {row.whatsapp}
                  {row.email ? ` · ${row.email}` : ''}
                </span>
                <span className="text-fg-subtle mt-0.5 block truncate text-xs">
                  {[
                    row.mbbsYear ? (YEAR_LABELS[row.mbbsYear] ?? `Year ${row.mbbsYear}`) : null,
                    row.university,
                    submittedAt(row.createdAt),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>

              <div className="flex shrink-0 items-center gap-2">
                <Select
                  value={row.status}
                  onChange={(e) => changeStatus(row, e.target.value as WaitlistStatus)}
                  aria-label={`Status for ${row.fullName}`}
                  className="w-auto py-2 text-sm"
                >
                  {WAITLIST_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {WAITLIST_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${row.fullName}`}
                  onClick={() => remove(row)}
                >
                  <Trash2 className="text-danger size-4" aria-hidden />
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <p className="text-fg-subtle px-1 text-xs leading-relaxed">
        Waitlist contact details are never rendered on a student-facing screen, and every action on
        this page re-checks that you are an admin on the server.
      </p>

      <EntrySheet
        row={open}
        onClose={() => setOpen(null)}
        onStatus={changeStatus}
        onDelete={remove}
        onNoteSaved={(id, note) => patch(id, { note })}
      />
    </div>
  );
}

/** The whole enquiry, including the free-text answer the list has no room for. */
function EntrySheet({
  row,
  onClose,
  onStatus,
  onDelete,
  onNoteSaved,
}: {
  row: WaitlistRow | null;
  onClose: () => void;
  onStatus: (row: WaitlistRow, status: WaitlistStatus) => void;
  onDelete: (row: WaitlistRow) => void;
  onNoteSaved: (id: string, note: string | null) => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  if (!row) return null;

  const saveNote = (formData: FormData) =>
    startTransition(async () => {
      const note = String(formData.get('note') ?? '');
      const result = await setWaitlistNoteAction(row.id, note);
      if (!result.ok) {
        toast.error('Could not save that note', result.message);
        return;
      }
      onNoteSaved(row.id, note.trim() || null);
      toast.success('Note saved');
    });

  return (
    <Sheet open onClose={onClose} title={row.fullName} description={submittedAt(row.createdAt)}>
      <div className="space-y-4">
        <dl className="divide-border divide-y text-sm">
          <Detail label="WhatsApp" value={row.whatsapp} />
          <Detail label="Email" value={row.email} />
          <Detail
            label="Year of study"
            value={row.mbbsYear ? (YEAR_LABELS[row.mbbsYear] ?? `Year ${row.mbbsYear}`) : null}
          />
          <Detail label="College" value={row.university} />
          <Detail label="Biggest challenge" value={row.challenge} />
          <Detail label="Submitted" value={submittedAt(row.createdAt)} />
        </dl>

        <Select
          label="Status"
          value={row.status}
          onChange={(e) => onStatus(row, e.target.value as WaitlistStatus)}
        >
          {WAITLIST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {WAITLIST_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>

        <form action={saveNote} className="space-y-3">
          <TextArea
            label="Admin note"
            name="note"
            defaultValue={row.note ?? ''}
            placeholder="Called on the 4th, wants the March cohort…"
            hint="Only ever shown here."
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={pending}>
              Save note
            </Button>
            <Button type="button" size="sm" variant="danger" onClick={() => onDelete(row)}>
              <Trash2 className="size-4" aria-hidden />
              Delete entry
            </Button>
          </div>
        </form>
      </div>
    </Sheet>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-4 py-2.5">
      <dt className="text-fg-subtle w-36 shrink-0">{label}</dt>
      <dd
        className={cn(
          'min-w-0 flex-1 break-words',
          value ? 'text-fg font-medium' : 'text-fg-subtle',
        )}
      >
        {value ?? '—'}
      </dd>
    </div>
  );
}
