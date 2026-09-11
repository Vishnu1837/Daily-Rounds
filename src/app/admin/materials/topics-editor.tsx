'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormError, TextArea, TextInput } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { TEXTBOOK_READER_HEADER } from '@/lib/domain/textbooks';
import { type TopicDraft, validateTopicPlan } from '@/lib/domain/textbook-topics';
import { saveTextbookTopicsAction } from '@/server/actions/textbooks';

export type EditorTopic = {
  position: number;
  title: string;
  startPage: number;
  endPage: number;
  curriculumRef: string | null;
};

/**
 * The chapter list of a hosted textbook, as a thing an admin edits.
 *
 * The mapping for a real book is produced elsewhere — from the PDF's own outline, or its
 * printed contents page — and arrives here as JSON. So paste is the primary path and the
 * per-row fields are for the two or three boundaries that come out wrong; building this the
 * other way round would mean typing twenty-two chapters by hand every time.
 *
 * Nothing is written until the plan passes the same check the server will run. The errors
 * are shown all at once and in place, because the failure mode this is guarding against is
 * a generated list with one bad row in it, and "fix, save, discover the next one" twenty
 * times over is not a review.
 *
 * The book's own length is read from the PDF while the editor is open, so a chapter that
 * ends past the last page is caught here rather than by a student. Until it arrives the
 * editor says it is still checking, rather than implying a check it has not made.
 */
export function TopicsEditor({
  materialId,
  cohortId,
  bookTitle,
  topics: initial,
  onDone,
}: {
  materialId: string;
  cohortId: string;
  bookTitle: string;
  topics: EditorTopic[];
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [rows, setRows] = useState<EditorTopic[]>(initial);
  const [paste, setPaste] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const numPages = useBookLength(materialId);

  const problems = useMemo(
    () => (rows.length === 0 ? [] : validateTopicPlan(rows as TopicDraft[], numPages)),
    [rows, numPages],
  );

  function renumber(next: EditorTopic[]): EditorTopic[] {
    return next.map((row, index) => ({ ...row, position: index + 1 }));
  }

  function applyPaste() {
    setPasteError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(paste);
    } catch {
      setPasteError('That is not valid JSON.');
      return;
    }
    if (!Array.isArray(parsed)) {
      setPasteError('Expected a JSON array of topics.');
      return;
    }

    const next: EditorTopic[] = [];
    for (const [index, item] of parsed.entries()) {
      const t = item as Record<string, unknown>;
      const title = typeof t.title === 'string' ? t.title.trim() : '';
      const startPage = Number(t.startPage);
      const endPage = Number(t.endPage);
      if (!title || !Number.isFinite(startPage) || !Number.isFinite(endPage)) {
        setPasteError(
          `Item ${index + 1} needs a title, a startPage and an endPage. Got: ${JSON.stringify(item).slice(0, 80)}`,
        );
        return;
      }
      next.push({
        position: index + 1,
        title,
        startPage: Math.round(startPage),
        endPage: Math.round(endPage),
        curriculumRef: typeof t.curriculumRef === 'string' ? t.curriculumRef.trim() || null : null,
      });
    }

    setRows(next);
    setPaste('');
  }

  function save() {
    setSaveError(null);
    startTransition(async () => {
      const result = await saveTextbookTopicsAction({
        materialId,
        cohortId,
        topics: rows,
        numPages,
      });
      if (!result.ok) {
        setSaveError(result.errors?.topics ?? result.message);
        return;
      }
      toast.success(
        result.data.saved === 0 ? 'Chapters removed' : `${result.data.saved} chapters saved`,
        result.data.saved === 0 ? 'The book now opens whole.' : bookTitle,
      );
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-fg-muted text-sm">
        Page numbers are <strong className="text-fg">physical pages of the PDF</strong>, counting
        the cover as 1 — not the numbers printed on the paper.
        {numPages === null
          ? ' Checking how long the book is…'
          : ` This book has ${numPages} pages.`}
      </p>

      {/* ------------------------------------------------------------- paste */}
      <Card variant="wash" padding="md">
        <TextArea
          label="Paste a chapter list"
          hint='A JSON array of { "title", "startPage", "endPage" }. Replaces everything below.'
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={4}
          placeholder='[{"position": 1, "title": "Introduction", "startPage": 1, "endPage": 4}]'
          spellCheck={false}
        />
        {pasteError && <FormError>{pasteError}</FormError>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!paste.trim()}
            onClick={applyPaste}
          >
            Replace list with this
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setRows(renumber([...rows, blankRow(rows)]))}
          >
            <Plus className="size-3.5" aria-hidden />
            Add a chapter
          </Button>
        </div>
      </Card>

      {/* ----------------------------------------------------------- problems */}
      {problems.length > 0 && (
        <Card variant="wash" tone="danger" padding="md">
          <p className="text-danger-strong dark:text-danger flex items-center gap-2 text-sm font-bold">
            <AlertTriangle className="size-4" aria-hidden />
            {problems.length} {problems.length === 1 ? 'problem' : 'problems'} to fix
          </p>
          <ul className="text-fg-muted mt-2 list-disc space-y-1 pl-5 text-xs">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* --------------------------------------------------------------- rows */}
      {rows.length === 0 ? (
        <p className="text-fg-muted px-1 text-sm">
          No chapters. Students will open this book whole, as they do today.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, index) => (
            <li key={index} className="border-border rounded-xl border p-3">
              <div className="flex items-start gap-2">
                <span className="text-fg-subtle mt-2.5 w-5 shrink-0 text-xs font-extrabold tabular-nums">
                  {row.position}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <TextInput
                    value={row.title}
                    aria-label={`Title of chapter ${row.position}`}
                    onChange={(e) =>
                      setRows(
                        rows.map((r, i) => (i === index ? { ...r, title: e.target.value } : r)),
                      )
                    }
                  />
                  <div className="flex items-center gap-2">
                    <TextInput
                      value={String(row.startPage)}
                      inputMode="numeric"
                      aria-label={`First page of chapter ${row.position}`}
                      className="w-24"
                      onChange={(e) =>
                        setRows(
                          rows.map((r, i) =>
                            i === index ? { ...r, startPage: toPage(e.target.value) } : r,
                          ),
                        )
                      }
                    />
                    <span className="text-fg-subtle text-xs font-semibold">to</span>
                    <TextInput
                      value={String(row.endPage)}
                      inputMode="numeric"
                      aria-label={`Last page of chapter ${row.position}`}
                      className="w-24"
                      onChange={(e) =>
                        setRows(
                          rows.map((r, i) =>
                            i === index ? { ...r, endPage: toPage(e.target.value) } : r,
                          ),
                        )
                      }
                    />
                    <span className="text-fg-subtle text-xs tabular-nums">
                      {Math.max(0, row.endPage - row.startPage + 1)} pages
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Remove chapter ${row.position}`}
                  onClick={() => setRows(renumber(rows.filter((_, i) => i !== index)))}
                  className="tap text-fg-subtle hover:bg-danger/10 hover:text-danger mt-1 grid size-8 shrink-0 place-items-center rounded-lg"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {saveError && <FormError>{saveError}</FormError>}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="primary"
          size="md"
          loading={pending}
          disabled={problems.length > 0}
          onClick={save}
          className="flex-1"
        >
          {rows.length === 0 ? 'Remove all chapters' : `Save ${rows.length} chapters`}
        </Button>
        <Button type="button" variant="ghost" size="md" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function blankRow(rows: EditorTopic[]): EditorTopic {
  const last = rows[rows.length - 1];
  const start = last ? last.endPage + 1 : 1;
  return {
    position: rows.length + 1,
    title: '',
    startPage: start,
    endPage: start,
    curriculumRef: null,
  };
}

/** Keeps a half-typed page box usable: an empty field reads as 0 and fails validation loudly. */
function toPage(value: string): number {
  const digits = value.replace(/\D/g, '');
  return digits === '' ? 0 : Number(digits);
}

/**
 * How many pages the book actually has.
 *
 * Read from the PDF rather than stored, because it is the file that knows: a book replaced
 * with a corrected scan changes length without anything in the database noticing. This
 * opens the document the same way the reader does — one signed, membership-checked request
 * for the trailer, not the whole file — and is the difference between validating a chapter
 * list for shape and validating it against the book it describes.
 */
function useBookLength(materialId: string): number | null {
  const [numPages, setNumPages] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;

    (async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();

      const loading = pdfjs.getDocument({
        url: `/api/textbooks/${materialId}`,
        httpHeaders: { [TEXTBOOK_READER_HEADER]: '1' },
        rangeChunkSize: 64 * 1024,
        disableAutoFetch: true,
        disableStream: true,
        isEvalSupported: false,
      });
      if (cancelled) {
        loading.promise.catch(() => {});
        void loading.destroy();
        return;
      }
      task = loading;

      try {
        const doc = await loading.promise;
        if (!cancelled) setNumPages(doc.numPages);
      } catch {
        // The editor says "checking…" forever rather than claiming a length it does not have.
      }
    })();

    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [materialId]);

  return numPages;
}
