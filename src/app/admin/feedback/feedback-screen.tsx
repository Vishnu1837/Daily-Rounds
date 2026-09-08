'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  Check,
  HardDrive,
  ImageOff,
  MessageSquareText,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/feedback';
import { Segmented } from '@/components/ui/segmented';
import { TextInput } from '@/components/ui/form';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import {
  type FeedbackReport,
  attachmentBytes,
  formatBytes,
  matchesFeedbackQuery,
} from '@/lib/domain/feedback';
import {
  clearFeedbackAttachmentsAction,
  clearResolvedFeedbackImagesAction,
  deleteFeedbackAction,
  feedbackStorageAction,
  setFeedbackResolvedAction,
} from '@/server/actions/feedback';

type Filter = 'open' | 'resolved' | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'open', label: 'To read' },
  { value: 'resolved', label: 'Done' },
  { value: 'all', label: 'All' },
];

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
 * What students have told us, and what to do about each one.
 *
 * The screen is built around a single admission: nobody reads a feedback inbox twice. So the
 * default filter is "to read" rather than "all", every row carries the two decisions that
 * empty it — done, or delete — and the list a cohort lead sees when they open this is
 * exactly the list of things nobody has looked at yet.
 *
 * Storage is the other half of the brief, and it is deliberately not automatic. Screenshots
 * are deleted when a person decides they are finished with them: per report, or in one pass
 * across everything already marked done. Nothing here expires on a timer, because a bug
 * report whose evidence disappeared on a schedule is a bug report nobody can act on.
 */
export function FeedbackScreen({ reports }: { reports: FeedbackReport[] }) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('open');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sweeping, startSweep] = useTransition();
  const [storage, setStorage] = useState<{ totalBytes: number; reclaimableBytes: number } | null>(
    null,
  );

  /*
   * Server state mirrored locally so resolving repaints on the same frame as the click.
   * `router.refresh()` alone left the row looking untouched for the length of the round trip,
   * which on a triage screen reads as the click having missed — and gets clicked again.
   */
  const [rows, setRows] = useState(reports);

  const counts = useMemo(
    () => ({
      open: rows.filter((r) => !r.resolvedAt).length,
      resolved: rows.filter((r) => r.resolvedAt).length,
      all: rows.length,
      images: rows.reduce((sum, r) => sum + r.attachments.length, 0),
    }),
    [rows],
  );

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        if (filter === 'open' && row.resolvedAt) return false;
        if (filter === 'resolved' && !row.resolvedAt) return false;
        return matchesFeedbackQuery(row, query);
      }),
    [rows, filter, query],
  );

  const patch = (id: string, changes: Partial<FeedbackReport>) =>
    setRows((current) => current.map((r) => (r.id === id ? { ...r, ...changes } : r)));

  function toggleResolved(report: FeedbackReport) {
    const next = report.resolvedAt ? null : new Date().toISOString();
    const previous = report.resolvedAt;
    patch(report.id, { resolvedAt: next });

    void setFeedbackResolvedAction(report.id, next !== null).then((result) => {
      if (result.ok) return;
      patch(report.id, { resolvedAt: previous });
      toast.error('Could not update that report', result.message);
    });
  }

  function removeImages(report: FeedbackReport) {
    const weight = formatBytes(attachmentBytes(report));
    if (
      !window.confirm(
        `Delete the ${report.attachments.length} screenshot${report.attachments.length === 1 ? '' : 's'} on this report and free ${weight}? What the student wrote is kept.`,
      )
    ) {
      return;
    }

    const snapshot = report.attachments;
    setBusyId(report.id);
    patch(report.id, { attachments: [] });

    void clearFeedbackAttachmentsAction(report.id)
      .then((result) => {
        if (result.ok) {
          toast.success('Screenshots deleted', `${formatBytes(result.data.freedBytes)} freed.`);
          setStorage(null);
          return;
        }
        patch(report.id, { attachments: snapshot });
        toast.error('Could not remove those screenshots', result.message);
      })
      .finally(() => setBusyId(null));
  }

  function remove(report: FeedbackReport) {
    const who = report.studentName ?? 'this student';
    if (
      !window.confirm(`Delete ${who}'s report and its screenshots for good? This cannot be undone.`)
    ) {
      return;
    }

    const snapshot = rows;
    setBusyId(report.id);
    setRows((current) => current.filter((r) => r.id !== report.id));

    void deleteFeedbackAction(report.id)
      .then((result) => {
        if (result.ok) {
          toast.success('Report deleted');
          setStorage(null);
          return;
        }
        setRows(snapshot);
        toast.error('Could not delete that report', result.message);
      })
      .finally(() => setBusyId(null));
  }

  function checkStorage() {
    startSweep(async () => {
      const result = await feedbackStorageAction();
      if (!result.ok) {
        toast.error('Could not read the storage figures', result.message);
        return;
      }
      setStorage(result.data);
    });
  }

  function freeResolvedImages() {
    if (
      !window.confirm(
        'Delete the screenshots on every report already marked done? What each student wrote is kept.',
      )
    ) {
      return;
    }

    startSweep(async () => {
      const result = await clearResolvedFeedbackImagesAction();
      if (!result.ok) {
        toast.error('Nothing to free', result.message);
        return;
      }
      setRows((current) => current.map((r) => (r.resolvedAt ? { ...r, attachments: [] } : r)));
      setStorage(null);
      toast.success(
        `${result.data.count} screenshot${result.data.count === 1 ? '' : 's'} deleted`,
        `${formatBytes(result.data.freedBytes)} freed.`,
      );
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cohort admin"
        title="User feedback"
        description="Bugs, glitches and suggestions students have sent from inside the app."
        actions={
          /*
           * Two steps rather than one button that frees storage on the first click. The
           * figure has to be on screen before "delete every screenshot on a resolved report"
           * is a decision anyone can make — and once it is on screen, whether there is
           * anything worth freeing answers itself.
           */
          storage && storage.reclaimableBytes > 0 ? (
            <Button variant="secondary" size="sm" loading={sweeping} onClick={freeResolvedImages}>
              <ImageOff className="size-4" aria-hidden />
              Free {formatBytes(storage.reclaimableBytes)}
            </Button>
          ) : (
            <Button variant="secondary" size="sm" loading={sweeping} onClick={checkStorage}>
              <HardDrive className="size-4" aria-hidden />
              {storage ? 'Re-check storage' : 'Check image storage'}
            </Button>
          )
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="To read" value={counts.open} />
          <StatTile label="Done" value={counts.resolved} />
          <StatTile label="Reports" value={counts.all} />
          <StatTile label="Screenshots" value={counts.images} />
        </div>

        {storage && (
          <p className="text-fg-muted mt-4 text-sm">
            Screenshots are using{' '}
            <strong className="text-fg">{formatBytes(storage.totalBytes)}</strong>.{' '}
            {storage.reclaimableBytes > 0 ? (
              <>
                {formatBytes(storage.reclaimableBytes)} of that is on reports already marked done
                and can be freed without losing anything anyone wrote.
              </>
            ) : (
              <>Nothing is on a resolved report yet, so there is nothing safe to free.</>
            )}
          </p>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-52 flex-1">
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a name, an email, or anything they wrote"
            leading={<Search className="size-4" aria-hidden />}
            aria-label="Search feedback"
          />
        </div>
        <Segmented
          ariaLabel="Filter feedback"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({
            value: f.value,
            label: f.label,
            count: counts[f.value],
          }))}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<MessageSquareText className="size-6" aria-hidden />}
          title={query ? 'Nothing matches that' : 'Nothing waiting'}
          description={
            query
              ? 'Try a shorter search, or switch the filter to All.'
              : filter === 'open'
                ? 'Every report has been dealt with. New ones land here as students send them.'
                : 'Reports appear here as students send them from inside the app.'
          }
        />
      ) : (
        <ul className="space-y-4">
          {visible.map((report) => (
            <li
              key={report.id}
              className={cn(
                'rounded-card border-border bg-bg-elevated shadow-soft border p-5',
                report.resolvedAt && 'opacity-75',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-fg text-sm font-bold">
                    {report.studentName ?? 'A student who has since left'}
                    {report.studentName && !report.isActiveMember && (
                      <span className="text-fg-subtle ml-2 text-xs font-medium">
                        no longer active
                      </span>
                    )}
                  </p>
                  <p className="text-fg-subtle text-xs">
                    {[report.studentEmail, report.cohortName, submittedAt(report.createdAt)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {report.resolvedAt && (
                  <Badge tone="success" icon={<Check className="size-3" aria-hidden />}>
                    {report.resolvedByName ? `Done by ${report.resolvedByName}` : 'Done'}
                  </Badge>
                )}
              </div>

              {report.issues && (
                <section className="mt-4">
                  <p className="eyebrow">Issue reported</p>
                  <p className="text-fg mt-1 text-sm leading-relaxed whitespace-pre-line">
                    {report.issues}
                  </p>
                </section>
              )}

              {report.suggestions && (
                <section className="mt-4">
                  <p className="eyebrow">Suggestion</p>
                  <p className="text-fg mt-1 text-sm leading-relaxed whitespace-pre-line">
                    {report.suggestions}
                  </p>
                </section>
              )}

              {report.attachments.length > 0 && (
                <section className="mt-4">
                  <p className="eyebrow">Screenshots · {formatBytes(attachmentBytes(report))}</p>
                  <ul className="mt-2 flex flex-wrap gap-2.5">
                    {report.attachments.map((file) => (
                      <li key={file.id}>
                        {/*
                          Opens full size in a new tab rather than in a lightbox. A cohort
                          lead reading a bug report wants to zoom into a corner of a phone
                          screenshot, and the browser's own image viewer does that better
                          than anything worth building here.
                        */}
                        <a
                          href={`/admin/feedback/attachments/${file.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-field border-border hover:border-pulse-500 block overflow-hidden border transition-colors"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/admin/feedback/attachments/${file.id}`}
                            alt={`Screenshot, ${formatBytes(file.byteSize)}`}
                            loading="lazy"
                            className="size-24 object-cover"
                          />
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="border-border mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
                <Button
                  size="sm"
                  variant={report.resolvedAt ? 'ghost' : 'secondary'}
                  onClick={() => toggleResolved(report)}
                  disabled={busyId === report.id}
                >
                  {report.resolvedAt ? (
                    <>
                      <RotateCcw className="size-4" aria-hidden />
                      Reopen
                    </>
                  ) : (
                    <>
                      <Check className="size-4" aria-hidden />
                      Mark done
                    </>
                  )}
                </Button>

                {report.attachments.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeImages(report)}
                    disabled={busyId === report.id}
                  >
                    <ImageOff className="size-4" aria-hidden />
                    Delete screenshots
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger ml-auto"
                  onClick={() => remove(report)}
                  disabled={busyId === report.id}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
