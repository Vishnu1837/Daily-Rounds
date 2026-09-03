'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Copy,
  Plus,
  Trash2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, SectionTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { FormError, Select, TextArea, TextInput } from '@/components/ui/form';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { IMPORT_FORMAT_EXAMPLE, IMPORT_PROMPT, type ParsedQuestion } from '@/lib/assessments/parse';
import {
  deleteAssessmentAction,
  previewImportAction,
  saveAssessmentAction,
  saveQuestionsAction,
  setAssessmentStatusAction,
} from '@/server/actions/assessments';
import type { AdminAssessmentDetail, AdminAttemptRow } from '@/server/queries/assessments';

/** A question as the builder holds it while being edited. */
type Draft = {
  key: string;
  type: 'mcq' | 'image_mcq' | 'short_answer' | 'long_answer';
  prompt: string;
  imageUrl: string;
  options: string[];
  correctIndex: number | null;
  referenceAnswer: string;
  explanation: string;
  timeLimitSeconds: number | null;
  points: number;
  /** Carried over from the import preview so flagged questions stay flagged until fixed. */
  importIssues: { level: 'error' | 'warning'; message: string }[];
};

let keySeed = 0;
const nextKey = () => `q${++keySeed}`;

function emptyDraft(): Draft {
  return {
    key: nextKey(),
    type: 'mcq',
    prompt: '',
    imageUrl: '',
    options: ['', '', '', ''],
    correctIndex: null,
    referenceAnswer: '',
    explanation: '',
    timeLimitSeconds: null,
    points: 1,
    importIssues: [],
  };
}

function fromSaved(q: AdminAssessmentDetail['questions'][number]): Draft {
  return {
    key: nextKey(),
    type: q.type,
    prompt: q.prompt,
    imageUrl: q.imageUrl ?? '',
    options: q.options.length > 0 ? q.options : ['', '', '', ''],
    correctIndex: q.correctIndex,
    referenceAnswer: q.referenceAnswer ?? '',
    explanation: q.explanation ?? '',
    timeLimitSeconds: q.timeLimitSeconds,
    points: q.points,
    importIssues: [],
  };
}

function fromParsed(q: ParsedQuestion): Draft {
  return {
    key: nextKey(),
    type: q.type,
    prompt: q.prompt,
    imageUrl: q.imageUrl ?? '',
    options: q.options.length > 0 ? q.options : ['', '', '', ''],
    correctIndex: q.correctIndex,
    referenceAnswer: q.referenceAnswer ?? '',
    explanation: q.explanation ?? '',
    timeLimitSeconds: q.timeLimitSeconds,
    points: 1,
    importIssues: q.issues,
  };
}

const isChoice = (t: Draft['type']) => t === 'mcq' || t === 'image_mcq';

/** The same rules the server enforces, so the card can flag a problem before the save. */
function draftErrors(d: Draft): string[] {
  const errors: string[] = [];
  if (d.prompt.trim().length < 3) errors.push('The question needs some text.');
  if (isChoice(d.type)) {
    const filled = d.options.filter((o) => o.trim().length > 0);
    if (filled.length < 2) errors.push('At least two options are needed.');
    if (d.correctIndex === null) errors.push('Mark which option is correct.');
    else if (!d.options[d.correctIndex]?.trim())
      errors.push('The correct answer is a blank option.');
  }
  return errors;
}

export function AssessmentBuilder({
  cohortId,
  assessment,
  attempts,
}: {
  cohortId: string;
  assessment: AdminAssessmentDetail;
  attempts: AdminAttemptRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<'questions' | 'settings' | 'results'>('questions');
  const [drafts, setDrafts] = useState<Draft[]>(() => assessment.questions.map(fromSaved));
  const [importOpen, setImportOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const published = assessment.status === 'published';
  const problems = useMemo(() => drafts.map(draftErrors), [drafts]);
  const blocked = problems.some((p) => p.length > 0);

  function update(index: number, patch: Partial<Draft>) {
    setDrafts((current) => current.map((d, i) => (i === index ? { ...d, ...patch } : d)));
    setDirty(true);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= drafts.length) return;
    setDrafts((current) => {
      const copy = [...current];
      const [row] = copy.splice(index, 1);
      copy.splice(target, 0, row!);
      return copy;
    });
    setDirty(true);
  }

  function saveQuestions() {
    startTransition(async () => {
      const payload = drafts.map((d) => ({
        type: d.type,
        prompt: d.prompt,
        imageUrl: d.imageUrl || undefined,
        options: isChoice(d.type) ? d.options.filter((o) => o.trim().length > 0) : [],
        correctIndex: isChoice(d.type) ? d.correctIndex : null,
        referenceAnswer: isChoice(d.type) ? undefined : d.referenceAnswer || undefined,
        explanation: d.explanation || undefined,
        timeLimitSeconds: d.timeLimitSeconds,
        points: d.points,
      }));

      const result = await saveQuestionsAction(cohortId, assessment.id, payload);
      if (!result.ok) {
        toast.error('Could not save', result.message);
        return;
      }
      toast.success('Questions saved', `${result.data.count} on this paper.`);
      setDirty(false);
      router.refresh();
    });
  }

  function setStatus(status: 'draft' | 'published' | 'archived') {
    startTransition(async () => {
      const result = await setAssessmentStatusAction(cohortId, assessment.id, status);
      if (!result.ok) {
        toast.error('Could not change status', result.message);
        return;
      }
      toast.success(
        status === 'published'
          ? 'Published'
          : status === 'draft'
            ? 'Moved back to draft'
            : 'Archived',
        status === 'published' ? 'Students can sit it now.' : undefined,
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <Link
        href="/admin/assessments"
        className="text-fg-muted hover:text-fg inline-flex items-center gap-1.5 text-sm font-semibold"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All assessments
      </Link>

      <PageHeader
        eyebrow={assessment.status}
        title={assessment.title}
        description={
          published
            ? 'Published. Move it back to draft to change the questions — students may be part-way through.'
            : `${drafts.length} ${drafts.length === 1 ? 'question' : 'questions'} · pass mark ${assessment.passMarkPct}%`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {published ? (
              <Button
                variant="outline"
                size="md"
                loading={pending}
                onClick={() => setStatus('draft')}
              >
                Unpublish
              </Button>
            ) : (
              <Button
                size="md"
                loading={pending}
                disabled={drafts.length === 0 || blocked || dirty}
                onClick={() => setStatus('published')}
              >
                Publish
              </Button>
            )}
          </div>
        }
      />

      {dirty && !published && (
        <Card className="border-warning/40 bg-warning/8 flex flex-wrap items-center gap-3 p-4">
          <AlertTriangle className="text-warning size-4 shrink-0" aria-hidden />
          <p className="text-fg min-w-0 flex-1 text-sm">You have unsaved question changes.</p>
          <Button size="sm" loading={pending} onClick={saveQuestions} disabled={blocked}>
            Save questions
          </Button>
        </Card>
      )}

      <Segmented
        value={tab}
        ariaLabel="Assessment section"
        onChange={(v) => setTab(v as typeof tab)}
        options={[
          { value: 'questions', label: `Questions (${drafts.length})` },
          { value: 'settings', label: 'Settings' },
          { value: 'results', label: `Results (${attempts.length})` },
        ]}
      />

      {tab === 'questions' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="md"
              onClick={() => setImportOpen(true)}
              disabled={published}
            >
              <ClipboardPaste className="size-4" aria-hidden />
              Bulk import
            </Button>
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                setDrafts((c) => [...c, emptyDraft()]);
                setDirty(true);
              }}
              disabled={published}
            >
              <Plus className="size-4" aria-hidden />
              Add one
            </Button>
            {!published && (
              <Button
                size="md"
                className="ml-auto"
                loading={pending}
                onClick={saveQuestions}
                disabled={blocked || drafts.length === 0}
              >
                Save questions
              </Button>
            )}
          </div>

          {blocked && (
            <Card className="border-danger/40 bg-danger/8 flex items-start gap-3 p-4">
              <AlertTriangle className="text-danger mt-0.5 size-4 shrink-0" aria-hidden />
              <p className="text-fg text-sm">
                Some questions still need attention. Nothing is saved until every one of them is
                fixed — that is the point of the preview.
              </p>
            </Card>
          )}

          {drafts.length === 0 ? (
            <Card>
              <EmptyState
                icon={<ClipboardPaste className="size-6" aria-hidden />}
                title="No questions yet"
                description="Paste a set from ChatGPT with Bulk import, or add them one at a time."
              />
            </Card>
          ) : (
            drafts.map((draft, index) => (
              <QuestionCard
                key={draft.key}
                index={index}
                total={drafts.length}
                draft={draft}
                errors={problems[index] ?? []}
                readOnly={published}
                defaultSeconds={assessment.defaultQuestionSeconds}
                onChange={(patch) => update(index, patch)}
                onMove={(dir) => move(index, dir)}
                onRemove={() => {
                  setDrafts((c) => c.filter((_, i) => i !== index));
                  setDirty(true);
                }}
              />
            ))
          )}
        </div>
      )}

      {tab === 'settings' && <SettingsForm cohortId={cohortId} assessment={assessment} />}

      {tab === 'results' && <ResultsTable assessment={assessment} attempts={attempts} />}

      <Sheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Bulk import questions"
        description="Paste a whole set at once. Nothing is added until you have looked at what was read."
        size="lg"
      >
        <ImportPanel
          cohortId={cohortId}
          onAccept={(parsed) => {
            setDrafts((current) => [...current, ...parsed.map(fromParsed)]);
            setDirty(true);
            setImportOpen(false);
            toast.success(
              `${parsed.length} ${parsed.length === 1 ? 'question' : 'questions'} added`,
              'Check anything flagged, then save.',
            );
          }}
        />
      </Sheet>

      {!published && attempts.length === 0 && (
        <DangerZone cohortId={cohortId} assessmentId={assessment.id} title={assessment.title} />
      )}
      {assessment.status !== 'archived' && attempts.length > 0 && (
        <Card className="p-5">
          <SectionTitle>Retiring this paper</SectionTitle>
          <p className="text-fg-muted mt-1 mb-3 text-sm">
            Students have sat it, so it cannot be deleted — that would erase their results and
            integrity history. Archiving takes it off their list and keeps everything.
          </p>
          <Button variant="outline" loading={pending} onClick={() => setStatus('archived')}>
            Archive
          </Button>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ one question */

function QuestionCard({
  index,
  total,
  draft,
  errors,
  readOnly,
  defaultSeconds,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  total: number;
  draft: Draft;
  errors: string[];
  readOnly: boolean;
  defaultSeconds: number;
  onChange: (patch: Partial<Draft>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const warnings = draft.importIssues.filter((i) => i.level === 'warning');

  return (
    <Card
      className={cn('p-5', errors.length > 0 && 'border-danger/40')}
      aria-label={`Question ${index + 1}`}
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="text-fg-subtle text-2xs font-bold tracking-[0.14em] uppercase">
          Question {index + 1}
        </span>
        {errors.length > 0 && <Badge tone="danger">Needs attention</Badge>}
        {errors.length === 0 && warnings.length > 0 && <Badge tone="warning">Check this</Badge>}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Move up"
            disabled={readOnly || index === 0}
            onClick={() => onMove(-1)}
          >
            <ChevronUp className="size-4" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Move down"
            disabled={readOnly || index === total - 1}
            onClick={() => onMove(1)}
          >
            <ChevronDown className="size-4" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Delete question"
            disabled={readOnly}
            onClick={onRemove}
          >
            <Trash2 className="text-danger size-4" aria-hidden />
          </Button>
        </div>
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <ul className="mb-4 space-y-1">
          {errors.map((message) => (
            <li key={message} className="text-danger flex items-start gap-1.5 text-sm">
              <span aria-hidden>⚠</span>
              {message}
            </li>
          ))}
          {warnings.map((issue) => (
            <li
              key={issue.message}
              className="text-warning-strong dark:text-warning flex items-start gap-1.5 text-sm"
            >
              <span aria-hidden>·</span>
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-4">
        <TextArea
          label="Question"
          value={draft.prompt}
          disabled={readOnly}
          onChange={(e) => onChange({ prompt: e.target.value })}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Type"
            value={draft.type}
            disabled={readOnly}
            onChange={(e) => onChange({ type: e.target.value as Draft['type'] })}
          >
            <option value="mcq">Multiple choice</option>
            <option value="image_mcq">Image + multiple choice</option>
            <option value="short_answer">Short answer</option>
            <option value="long_answer">Long answer</option>
          </Select>
          <TextInput
            label="Seconds"
            type="number"
            min={5}
            max={3600}
            disabled={readOnly}
            value={draft.timeLimitSeconds ?? ''}
            placeholder={String(defaultSeconds)}
            hint="Blank uses the default."
            onChange={(e) =>
              onChange({ timeLimitSeconds: e.target.value ? Number(e.target.value) : null })
            }
          />
          <TextInput
            label="Marks"
            type="number"
            min={1}
            max={20}
            disabled={readOnly}
            value={draft.points}
            onChange={(e) => onChange({ points: Number(e.target.value) || 1 })}
          />
        </div>

        {draft.type === 'image_mcq' && (
          <TextInput
            label="Image URL"
            value={draft.imageUrl}
            disabled={readOnly}
            onChange={(e) => onChange({ imageUrl: e.target.value })}
            placeholder="https://…"
          />
        )}

        {isChoice(draft.type) ? (
          <fieldset className="space-y-2">
            <legend className="text-fg mb-1.5 block text-sm font-semibold">
              Options — select the correct one
            </legend>
            {draft.options.map((option, optionIndex) => (
              <div key={optionIndex} className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name={`correct-${draft.key}`}
                  checked={draft.correctIndex === optionIndex}
                  disabled={readOnly}
                  onChange={() => onChange({ correctIndex: optionIndex })}
                  aria-label={`Option ${String.fromCharCode(65 + optionIndex)} is correct`}
                  className="accent-pulse-600 size-4 shrink-0"
                />
                <span className="text-fg-subtle w-4 shrink-0 text-sm font-bold">
                  {String.fromCharCode(65 + optionIndex)}
                </span>
                <TextInput
                  aria-label={`Option ${String.fromCharCode(65 + optionIndex)}`}
                  value={option}
                  disabled={readOnly}
                  className="flex-1"
                  onChange={(e) => {
                    const options = [...draft.options];
                    options[optionIndex] = e.target.value;
                    onChange({ options });
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove option ${String.fromCharCode(65 + optionIndex)}`}
                  disabled={readOnly || draft.options.length <= 2}
                  onClick={() => {
                    const options = draft.options.filter((_, i) => i !== optionIndex);
                    const correctIndex =
                      draft.correctIndex === null
                        ? null
                        : draft.correctIndex === optionIndex
                          ? null
                          : draft.correctIndex > optionIndex
                            ? draft.correctIndex - 1
                            : draft.correctIndex;
                    onChange({ options, correctIndex });
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </div>
            ))}
            {draft.options.length < 8 && !readOnly && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange({ options: [...draft.options, ''] })}
              >
                <Plus className="size-3.5" aria-hidden />
                Add option
              </Button>
            )}
          </fieldset>
        ) : (
          <TextArea
            label="Model answer (what you will mark against)"
            value={draft.referenceAnswer}
            disabled={readOnly}
            onChange={(e) => onChange({ referenceAnswer: e.target.value })}
            hint="Never shown to the student. It sits beside their answer while you mark."
          />
        )}

        <TextArea
          label="Explanation (optional)"
          value={draft.explanation}
          disabled={readOnly}
          onChange={(e) => onChange({ explanation: e.target.value })}
          hint="Shown after submission when answer review is on."
        />
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- import */

function ImportPanel({
  cohortId,
  onAccept,
}: {
  cohortId: string;
  onAccept: (questions: ParsedQuestion[]) => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [raw, setRaw] = useState('');
  const [parsed, setParsed] = useState<ParsedQuestion[] | null>(null);
  const [issues, setIssues] = useState<{ level: 'error' | 'warning'; message: string }[]>([]);
  const [showFormat, setShowFormat] = useState(false);

  const errorCount = parsed?.filter((q) => q.issues.some((i) => i.level === 'error')).length ?? 0;
  const blockedOverall = issues.some((i) => i.level === 'error');

  function copy(text: string, what: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(`${what} copied`))
      .catch(() => toast.error('Could not copy', 'Select the text and copy it manually.'));
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => copy(IMPORT_PROMPT, 'Prompt')}>
          <Copy className="size-3.5" aria-hidden />
          Copy the AI prompt
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowFormat((v) => !v)}>
          {showFormat ? 'Hide' : 'Show'} the expected format
        </Button>
      </div>

      {showFormat && (
        <pre className="rounded-panel bg-bg-sunken text-fg-muted max-h-64 overflow-auto p-4 text-xs whitespace-pre-wrap">
          {IMPORT_FORMAT_EXAMPLE}
        </pre>
      )}

      <TextArea
        label="Paste your questions"
        rows={12}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setParsed(null);
        }}
        placeholder="Q1. Which nerve supplies the deltoid muscle?…"
        hint="Letters or numbers, bold or plain, with or without TIME — the importer reads all of it."
      />

      <Button
        size="lg"
        fullWidth
        loading={pending}
        disabled={raw.trim().length === 0}
        onClick={() =>
          startTransition(async () => {
            const result = await previewImportAction(cohortId, raw);
            if (!result.ok) {
              toast.error('Could not read that', result.message);
              return;
            }
            setParsed(result.data.questions);
            setIssues(result.data.issues);
          })
        }
      >
        Preview {parsed ? 'again' : ''}
      </Button>

      {issues.length > 0 && (
        <ul className="space-y-1">
          {issues.map((issue) => (
            <li
              key={issue.message}
              className={cn(
                'flex items-start gap-1.5 text-sm',
                issue.level === 'error' ? 'text-danger' : 'text-warning-strong dark:text-warning',
              )}
            >
              <span aria-hidden>{issue.level === 'error' ? '⚠' : '·'}</span>
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      {parsed && parsed.length > 0 && (
        <>
          <div className="rounded-panel bg-bg-sunken p-4">
            <p className="text-fg text-sm font-bold">
              {parsed.length} {parsed.length === 1 ? 'question' : 'questions'} read
              {errorCount > 0 ? ` · ${errorCount} need attention` : ''}
            </p>
            <p className="text-fg-muted mt-1 text-xs">
              They are added to the builder below, where you can fix anything flagged before saving.
              Nothing is published by this step.
            </p>
          </div>

          <ol className="space-y-2">
            {parsed.map((q) => {
              const bad = q.issues.some((i) => i.level === 'error');
              return (
                <li
                  key={q.number}
                  className={cn(
                    'rounded-panel border p-3',
                    bad ? 'border-danger/40 bg-danger/6' : 'border-border',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-fg-subtle text-xs font-bold tabular-nums">
                      {q.number}.
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-fg text-sm font-semibold">{q.prompt || '(no text)'}</p>
                      <p className="text-fg-subtle mt-0.5 text-xs">
                        {q.type.replace('_', ' ')}
                        {q.options.length > 0 ? ` · ${q.options.length} options` : ''}
                        {q.correctIndex !== null
                          ? ` · answer ${String.fromCharCode(65 + q.correctIndex)}`
                          : ''}
                        {q.timeLimitSeconds ? ` · ${q.timeLimitSeconds}s` : ' · default timer'}
                      </p>
                      {q.issues.map((issue) => (
                        <p
                          key={issue.message}
                          className={cn(
                            'mt-1 text-xs',
                            issue.level === 'error'
                              ? 'text-danger'
                              : 'text-warning-strong dark:text-warning',
                          )}
                        >
                          {issue.message}
                        </p>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          <Button size="lg" fullWidth disabled={blockedOverall} onClick={() => onAccept(parsed)}>
            Add {parsed.length} to the builder
          </Button>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- settings */

function SettingsForm({
  cohortId,
  assessment,
}: {
  cohortId: string;
  assessment: AdminAssessmentDetail;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <Card className="p-5">
      <form
        className="space-y-4"
        action={(formData) =>
          startTransition(async () => {
            setMessage(undefined);
            setErrors({});
            const result = await saveAssessmentAction(cohortId, assessment.id, null, formData);
            if (!result.ok) {
              setMessage(result.message);
              setErrors(result.errors ?? {});
              return;
            }
            toast.success('Settings saved');
            router.refresh();
          })
        }
      >
        <FormError>{message}</FormError>
        <TextInput
          label="Title"
          name="title"
          defaultValue={assessment.title}
          required
          error={errors.title}
        />
        <TextInput
          label="Syllabus topic"
          name="curriculumRef"
          defaultValue={assessment.curriculumRef ?? ''}
          error={errors.curriculumRef}
          hint="A path like pathology/general-pathology/inflammation."
        />
        <TextArea
          label="Instructions for the student"
          name="instructions"
          defaultValue={assessment.instructions ?? ''}
          error={errors.instructions}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Total time (minutes)"
            name="totalTimeMinutes"
            type="number"
            min={0}
            max={600}
            defaultValue={
              assessment.totalTimeSeconds ? Math.round(assessment.totalTimeSeconds / 60) : 0
            }
            error={errors.totalTimeMinutes}
            hint="0 means only the per-question timers apply."
          />
          <TextInput
            label="Default seconds per question"
            name="defaultQuestionSeconds"
            type="number"
            min={5}
            max={3600}
            defaultValue={assessment.defaultQuestionSeconds}
            error={errors.defaultQuestionSeconds}
          />
          <TextInput
            label="Pass mark (%)"
            name="passMarkPct"
            type="number"
            min={1}
            max={100}
            defaultValue={assessment.passMarkPct}
            error={errors.passMarkPct}
          />
          <TextInput
            label="Focus grace (seconds)"
            name="focusGraceSeconds"
            type="number"
            min={1}
            max={120}
            defaultValue={assessment.focusGraceSeconds}
            error={errors.focusGraceSeconds}
            hint="Longer than this away from the tab restarts the attempt."
          />
        </div>
        <Select
          label="Let students review their answers afterwards"
          name="allowAnswerReview"
          defaultValue={assessment.allowAnswerReview ? 'true' : ''}
        >
          <option value="true">Yes — show correct answers and explanations</option>
          <option value="">No — score only</option>
        </Select>
        <Button type="submit" size="lg" loading={pending}>
          Save settings
        </Button>
      </form>
    </Card>
  );
}

/* --------------------------------------------------------------- results */

function ResultsTable({
  assessment,
  attempts,
}: {
  assessment: AdminAssessmentDetail;
  attempts: AdminAttemptRow[];
}) {
  if (attempts.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<ClipboardPaste className="size-6" aria-hidden />}
          title="Nobody has sat this yet"
          description="Results, restarts and integrity events appear here once students start."
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <CardHeader
        title="Attempts"
        description="Scores and integrity history. Only you and the student who sat it can see these."
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] text-left">
          <thead>
            <tr className="border-border text-2xs text-fg-subtle border-y tracking-[0.1em] uppercase">
              <th scope="col" className="px-5 py-3 font-bold">
                Student
              </th>
              <th scope="col" className="px-3 py-3 font-bold">
                Attempt
              </th>
              <th scope="col" className="px-3 py-3 text-right font-bold">
                Score
              </th>
              <th scope="col" className="px-3 py-3 text-right font-bold">
                Restarts
              </th>
              <th scope="col" className="px-3 py-3 text-right font-bold">
                Flags
              </th>
              <th scope="col" className="px-5 py-3 font-bold">
                State
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {attempts.map((row) => (
              <tr key={row.attemptId} className="hover:bg-bg-sunken transition-colors">
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/assessments/${assessment.id}/attempts/${row.attemptId}`}
                    className="text-fg text-sm font-semibold hover:underline"
                  >
                    {row.studentName}
                  </Link>
                </td>
                <td className="text-fg-muted px-3 py-3 text-sm tabular-nums">
                  #{row.attemptNumber}
                </td>
                <td className="text-fg px-3 py-3 text-right text-sm font-bold tabular-nums">
                  {row.status === 'invalidated' ? (
                    <span className="text-fg-subtle font-normal">—</span>
                  ) : (
                    <>
                      {row.pct}%{row.provisional ? '*' : ''}
                    </>
                  )}
                </td>
                <td className="text-fg-muted px-3 py-3 text-right text-sm tabular-nums">
                  {row.restartCount}
                </td>
                <td className="px-3 py-3 text-right text-sm tabular-nums">
                  {row.integrityEvents > 0 ? (
                    <span className="text-warning-strong dark:text-warning font-bold">
                      {row.integrityEvents}
                    </span>
                  ) : (
                    <span className="text-fg-subtle">0</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  {row.status === 'invalidated' ? (
                    <Badge tone="neutral">Restarted</Badge>
                  ) : row.reviewStatus === 'pending' ? (
                    <Badge tone="warning">To mark</Badge>
                  ) : row.pct >= assessment.passMarkPct ? (
                    <Badge tone="success">Passed</Badge>
                  ) : (
                    <Badge tone="danger">Below pass</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-fg-subtle border-border border-t px-5 py-3 text-xs">
        * provisional — written answers on that paper are still waiting to be marked.
      </p>
    </Card>
  );
}

function DangerZone({
  cohortId,
  assessmentId,
  title,
}: {
  cohortId: string;
  assessmentId: string;
  title: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);

  return (
    <>
      <Card className="p-5">
        <SectionTitle>Danger zone</SectionTitle>
        <p className="text-fg-muted mt-1 mb-3 text-sm">
          Nobody has sat this paper yet, so it can still be deleted outright.
        </p>
        <Button variant="danger" onClick={() => setConfirm(true)}>
          <Trash2 className="size-3.5" aria-hidden />
          Delete assessment
        </Button>
      </Card>

      <Sheet open={confirm} onClose={() => setConfirm(false)} title={`Delete ${title}?`} size="sm">
        <div className="space-y-4 pt-2">
          <p className="text-fg-muted text-sm">
            This removes the paper and its questions. It cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" fullWidth onClick={() => setConfirm(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              fullWidth
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteAssessmentAction(cohortId, assessmentId);
                  if (!result.ok) {
                    toast.error('Could not delete', result.message);
                    return;
                  }
                  toast.success('Assessment deleted');
                  router.push('/admin/assessments');
                })
              }
            >
              Delete
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
