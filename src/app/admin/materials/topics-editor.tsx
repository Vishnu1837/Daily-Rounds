'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Eye, EyeOff, Plus, RefreshCw, Sparkles, Trash2, Wand2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormError, TextArea, TextInput } from '@/components/ui/form';
import { ProgressBar } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toast';
import { type TopicDraft, validateTopicPlan } from '@/lib/domain/textbook-topics';
import {
  discardChapterDraftAction,
  generateChapterDraftAction,
  saveChapterDraftAction,
} from '@/server/actions/chapter-drafts';
import { saveTextbookTopicsAction } from '@/server/actions/textbooks';

import { buildBookDigest, openTextbook } from './book-digest';

export type EditorTopic = {
  position: number;
  title: string;
  startPage: number;
  endPage: number;
  curriculumRef: string | null;
};

/** An unpublished proposal, as the admin page hands it over. */
export type EditorDraft = {
  topics: EditorTopic[];
  notes: string[];
  model: string | null;
  /** `gemini`, `outline` (the PDF's bookmarks) or `manual`. */
  source: string;
};

type PdfDocument = Awaited<Awaited<ReturnType<typeof openTextbook>>['promise']>;

type Generation =
  | { phase: 'idle' }
  | { phase: 'reading'; done: number; total: number }
  | { phase: 'thinking' }
  | { phase: 'failed'; message: string };

/**
 * The chapter list of a hosted textbook, from proposal to publish.
 *
 * Two lists meet here and the screen never lets them be confused. The **published** list is
 * what students read today. The **draft** is what Gemini (or the PDF's own bookmarks)
 * proposed, and it stays invisible to students until an admin has looked at it and pressed
 * publish. Editing a published list with no draft open edits it directly — the list stays
 * editable for the life of the book.
 *
 * Generation reads the book in this tab — bookmarks and the opening lines of each page —
 * and sends that summary, not the PDF, to the server, which asks Gemini where each chapter
 * starts. See `book-digest.ts` and `src/server/gemini.ts`.
 *
 * The preview button beside each row renders that chapter's first page, because the thing
 * a reviewer is actually checking is "does chapter 7 really start here", and the only
 * honest answer is to look at the page.
 */
export function TopicsEditor({
  materialId,
  cohortId,
  bookTitle,
  topics: published,
  draft: initialDraft,
  geminiConfigured,
  autoGenerate = false,
  onDone,
}: {
  materialId: string;
  cohortId: string;
  bookTitle: string;
  topics: EditorTopic[];
  draft: EditorDraft | null;
  geminiConfigured: boolean;
  /** Start generating as soon as the book opens — used straight after an upload. */
  autoGenerate?: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [draft, setDraft] = useState<EditorDraft | null>(initialDraft);
  const [rows, setRows] = useState<EditorTopic[]>(initialDraft?.topics ?? published);
  const [paste, setPaste] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [generation, setGeneration] = useState<Generation>({ phase: 'idle' });
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const { doc, numPages, failed: bookFailed } = useTextbook(materialId);
  const reviewing = draft !== null;
  const generating = generation.phase === 'reading' || generation.phase === 'thinking';

  const problems = useMemo(
    () => (rows.length === 0 ? [] : validateTopicPlan(rows as TopicDraft[], numPages)),
    [rows, numPages],
  );

  const generate = useCallback(async () => {
    if (!doc) return;
    setSaveError(null);
    setPreviewIndex(null);
    try {
      const digest = await buildBookDigest(doc, (done, total) =>
        setGeneration({ phase: 'reading', done, total }),
      );
      setGeneration({ phase: 'thinking' });
      const result = await generateChapterDraftAction({ materialId, cohortId, digest });
      if (!result.ok) {
        setGeneration({ phase: 'failed', message: result.message });
        return;
      }
      setDraft(result.data);
      setRows(result.data.topics);
      setGeneration({ phase: 'idle' });
      router.refresh();
    } catch {
      setGeneration({ phase: 'failed', message: 'Could not read the book. Try again.' });
    }
  }, [doc, materialId, cohortId, router]);

  // Straight after an upload: propose chapters without making the admin ask.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoGenerate || autoStarted.current || !doc || initialDraft) return;
    autoStarted.current = true;
    void generate();
  }, [autoGenerate, doc, initialDraft, generate]);

  function renumber(next: EditorTopic[]): EditorTopic[] {
    return next.map((row, index) => ({ ...row, position: index + 1 }));
  }

  function update(index: number, patch: Partial<EditorTopic>) {
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  /** Every chapter ends the page before the next one starts; the last ends with the book. */
  function closeGaps() {
    const sorted = [...rows].sort((a, b) => a.startPage - b.startPage);
    setRows(
      renumber(
        sorted.map((row, index) => {
          const next = sorted[index + 1];
          const end = next
            ? Math.max(row.startPage, next.startPage - 1)
            : (numPages ?? row.endPage);
          return { ...row, endPage: end };
        }),
      ),
    );
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

  function publish() {
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
        result.data.saved === 0
          ? 'Chapters removed'
          : reviewing
            ? `${result.data.saved} chapters published`
            : `${result.data.saved} chapters saved`,
        result.data.saved === 0 ? 'The book now opens whole.' : bookTitle,
      );
      router.refresh();
      onDone();
    });
  }

  function keepDraft() {
    setSaveError(null);
    startTransition(async () => {
      const result = await saveChapterDraftAction({
        materialId,
        cohortId,
        topics: rows,
        notes: draft?.notes ?? [],
      });
      if (!result.ok) {
        setSaveError(result.message);
        return;
      }
      toast.success('Draft saved', 'Students still see the published chapters.');
      router.refresh();
      onDone();
    });
  }

  function discard() {
    setSaveError(null);
    startTransition(async () => {
      const result = await discardChapterDraftAction({ materialId, cohortId });
      if (!result.ok) {
        setSaveError(result.message);
        return;
      }
      setDraft(null);
      setRows(published);
      setPreviewIndex(null);
      toast.success('Draft discarded');
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-fg-muted text-sm">
        Page numbers are <strong className="text-fg">physical pages of the PDF</strong>, counting
        the cover as 1 — not the numbers printed on the paper.
        {bookFailed
          ? ' The book could not be opened here, so page ranges are only checked for shape.'
          : numPages === null
            ? ' Opening the book…'
            : ` This book has ${numPages} pages.`}
      </p>

      {/* ------------------------------------------------------------ generate */}
      <Card variant="wash" tone="iris" padding="md">
        <div className="flex items-start gap-3">
          <span className="bg-iris-500/15 text-iris-700 dark:text-iris-300 grid size-9 shrink-0 place-items-center rounded-xl">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-fg text-sm font-bold">Detect chapters automatically</p>
            <p className="text-fg-muted text-xs">
              {geminiConfigured
                ? 'Gemini reads the bookmarks and the first lines of each page and proposes a chapter list. Nothing is shown to students until you publish it.'
                : 'Gemini is off (no GEMINI_API_KEY is set), so this uses the PDF’s own bookmarks, if it has any.'}
            </p>

            {generation.phase === 'reading' && (
              <div className="space-y-1.5">
                <ProgressBar
                  value={Math.round((generation.done / Math.max(1, generation.total)) * 100)}
                  label="Reading the book"
                  height="xs"
                  tone="iris"
                />
                <p className="text-fg-muted text-xs tabular-nums">
                  Reading pages… {generation.done} of {generation.total}
                </p>
              </div>
            )}
            {generation.phase === 'thinking' && (
              <p className="text-fg-muted animate-pulse text-xs font-semibold">
                {geminiConfigured
                  ? 'Gemini is working out where each chapter starts — this can take up to a minute…'
                  : 'Building chapters from the bookmarks…'}
              </p>
            )}
            {generation.phase === 'failed' && <FormError>{generation.message}</FormError>}

            <Button
              type="button"
              variant={rows.length === 0 ? 'primary' : 'outline'}
              size="sm"
              loading={generating}
              disabled={!doc || generating || pending}
              onClick={() => void generate()}
            >
              {rows.length === 0 ? (
                <Wand2 className="size-3.5" aria-hidden />
              ) : (
                <RefreshCw className="size-3.5" aria-hidden />
              )}
              {rows.length === 0
                ? 'Detect chapters'
                : reviewing
                  ? 'Regenerate draft'
                  : 'Generate a new draft'}
            </Button>
          </div>
        </div>
      </Card>

      {/* --------------------------------------------------------- review note */}
      {reviewing && (
        <Card variant="wash" tone="warning" padding="md">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-fg text-sm font-bold">Draft — review before publishing</p>
            <Badge tone="iris" size="sm">
              {draft.source === 'gemini'
                ? `Gemini${draft.model ? ` · ${draft.model}` : ''}`
                : draft.source === 'outline'
                  ? 'From PDF bookmarks'
                  : 'Edited draft'}
            </Badge>
          </div>
          <p className="text-fg-muted mt-1.5 text-xs">
            Students{' '}
            {published.length > 0
              ? `still see the ${published.length} published chapters`
              : 'still open this book whole'}
            . Check a few start pages with the{' '}
            <Eye className="inline size-3" aria-label="preview" /> button, fix anything that is off,
            then publish.
          </p>
          {draft.notes.length > 0 && (
            <ul className="text-fg-muted mt-2 list-disc space-y-1 pl-5 text-xs">
              {draft.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

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
          <Button type="button" variant="outline" size="xs" className="mt-3" onClick={closeGaps}>
            Recalculate end pages from start pages
          </Button>
        </Card>
      )}

      {/* --------------------------------------------------------------- rows */}
      {rows.length === 0 ? (
        <p className="text-fg-muted px-1 text-sm">
          No chapters. Students will open this book whole.
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
                    onChange={(e) => update(index, { title: e.target.value })}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <TextInput
                      value={String(row.startPage)}
                      inputMode="numeric"
                      aria-label={`First page of chapter ${row.position}`}
                      className="w-24"
                      onChange={(e) => update(index, { startPage: toPage(e.target.value) })}
                    />
                    <span className="text-fg-subtle text-xs font-semibold">to</span>
                    <TextInput
                      value={String(row.endPage)}
                      inputMode="numeric"
                      aria-label={`Last page of chapter ${row.position}`}
                      className="w-24"
                      onChange={(e) => update(index, { endPage: toPage(e.target.value) })}
                    />
                    <span className="text-fg-subtle text-xs tabular-nums">
                      {Math.max(0, row.endPage - row.startPage + 1)} pages
                    </span>
                  </div>
                  {previewIndex === index && doc && (
                    <PagePreview doc={doc} page={row.startPage} numPages={numPages} />
                  )}
                </div>
                <div className="mt-1 flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    aria-label={
                      previewIndex === index
                        ? `Hide the first page of chapter ${row.position}`
                        : `Show the first page of chapter ${row.position}`
                    }
                    aria-pressed={previewIndex === index}
                    disabled={!doc}
                    onClick={() => setPreviewIndex(previewIndex === index ? null : index)}
                    className="tap text-fg-subtle hover:bg-bg-sunken hover:text-fg grid size-8 place-items-center rounded-lg disabled:opacity-40"
                  >
                    {previewIndex === index ? (
                      <EyeOff className="size-3.5" aria-hidden />
                    ) : (
                      <Eye className="size-3.5" aria-hidden />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove chapter ${row.position}`}
                    onClick={() => {
                      setPreviewIndex(null);
                      setRows(renumber(rows.filter((_, i) => i !== index)));
                    }}
                    className="tap text-fg-subtle hover:bg-danger/10 hover:text-danger grid size-8 place-items-center rounded-lg"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
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

      {/* ------------------------------------------------------------- paste */}
      <details className="group">
        <summary className="text-fg-muted hover:text-fg cursor-pointer text-xs font-semibold select-none">
          Paste a chapter list as JSON instead
        </summary>
        <Card variant="wash" padding="md" className="mt-2">
          <TextArea
            label="Chapter list JSON"
            hint='An array of { "title", "startPage", "endPage" }. Replaces everything above.'
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={4}
            placeholder='[{"title": "Introduction", "startPage": 1, "endPage": 4}]'
            spellCheck={false}
          />
          {pasteError && <FormError>{pasteError}</FormError>}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={!paste.trim()}
            onClick={applyPaste}
          >
            Replace list with this
          </Button>
        </Card>
      </details>

      {saveError && <FormError>{saveError}</FormError>}

      {/* ------------------------------------------------------------ actions */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="primary"
          size="md"
          loading={pending}
          disabled={problems.length > 0 || generating}
          onClick={publish}
          className="flex-1"
        >
          {rows.length === 0
            ? 'Remove all chapters'
            : reviewing
              ? `Publish ${rows.length} chapters`
              : `Save ${rows.length} chapters`}
        </Button>
        {reviewing ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="md"
              disabled={pending || generating}
              onClick={keepDraft}
            >
              Save draft
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="md"
              disabled={pending || generating}
              onClick={discard}
            >
              Discard draft
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" size="md" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * One page of the book, drawn small, so a reviewer can see whether a chapter really starts
 * where the draft says it does.
 */
function PagePreview({
  doc,
  page,
  numPages,
}: {
  doc: PdfDocument;
  page: number;
  numPages: number | null;
}) {
  if (page < 1 || (numPages !== null && page > numPages)) {
    return <p className="text-danger text-xs font-semibold">Page {page} is not in this book.</p>;
  }
  // Keyed by page so a new page starts from "loading" rather than showing the last one.
  return <PageCanvas key={page} doc={doc} page={page} />;
}

function PageCanvas({ doc, page }: { doc: PdfDocument; page: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let cancelled = false;
    let render: { cancel: () => void; promise: Promise<void> } | null = null;

    (async () => {
      try {
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = (360 / base.width) * Math.min(window.devicePixelRatio || 1, 2);
        const viewport = pdfPage.getViewport({ scale });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        render = pdfPage.render({ canvas, viewport });
        await render.promise;
        if (!cancelled) setState('ready');
      } catch {
        if (!cancelled) setState('failed');
      }
    })();

    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [doc, page]);

  return (
    <div className="bg-bg-sunken border-border overflow-hidden rounded-lg border">
      <p className="text-fg-subtle border-border border-b px-2.5 py-1.5 text-[11px] font-bold tabular-nums">
        Page {page}
        {state === 'loading' && ' · loading…'}
        {state === 'failed' && ' · could not draw this page'}
      </p>
      <canvas ref={canvasRef} className="block h-auto w-full max-w-[360px] bg-white" />
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
 * The book itself, opened once while the editor is up.
 *
 * Read from the PDF rather than stored, because it is the file that knows its own length: a
 * book replaced with a corrected scan changes length without the database noticing. The
 * same document serves the page count, the chapter digest and the page previews — one
 * signed, membership-checked range-request session, not three.
 */
function useTextbook(materialId: string) {
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let task: Awaited<ReturnType<typeof openTextbook>> | null = null;

    (async () => {
      const loading = await openTextbook(materialId);
      if (cancelled) {
        loading.promise.catch(() => {});
        void loading.destroy();
        return;
      }
      task = loading;
      try {
        const opened = await loading.promise;
        if (!cancelled) setDoc(opened);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      setDoc(null);
      void task?.destroy();
    };
  }, [materialId]);

  return { doc, numPages: doc?.numPages ?? null, failed };
}
