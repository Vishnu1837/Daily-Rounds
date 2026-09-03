'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardList, FileQuestion, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { FormError, Select, TextArea, TextInput } from '@/components/ui/form';
import { PageHeader } from '@/components/ui/page-header';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { saveAssessmentAction } from '@/server/actions/assessments';
import type { AdminAssessmentRow } from '@/server/queries/assessments';

type StatusFilter = 'all' | 'draft' | 'published' | 'archived';

const STATUS_TONE = {
  draft: 'warning',
  published: 'success',
  archived: 'neutral',
} as const;

function describeLength(row: AdminAssessmentRow): string {
  if (row.totalTimeSeconds) return `${Math.round(row.totalTimeSeconds / 60)} min total`;
  return 'Per-question timers';
}

export function AssessmentsScreen({
  cohortId,
  rows,
}: {
  cohortId: string;
  rows: AdminAssessmentRow[];
}) {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(
    () => (status === 'all' ? rows : rows.filter((r) => r.status === status)),
    [rows, status],
  );

  const pending = rows.reduce((sum, r) => sum + r.pendingReview, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="The papers"
        title="Assessments"
        description={
          pending > 0
            ? `${rows.length} in this cohort · ${pending} ${pending === 1 ? 'attempt is' : 'attempts are'} waiting to be marked`
            : `${rows.length} in this cohort`
        }
        actions={
          <Button size="md" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden />
            New assessment
          </Button>
        }
      />

      <Select
        value={status}
        onChange={(e) => setStatus(e.target.value as StatusFilter)}
        aria-label="Filter by status"
        className="w-auto"
      >
        <option value="all">All ({rows.length})</option>
        <option value="draft">Drafts ({rows.filter((r) => r.status === 'draft').length})</option>
        <option value="published">
          Published ({rows.filter((r) => r.status === 'published').length})
        </option>
        <option value="archived">
          Archived ({rows.filter((r) => r.status === 'archived').length})
        </option>
      </Select>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileQuestion className="size-6" aria-hidden />}
            title={rows.length === 0 ? 'No assessments yet' : 'Nothing matched that filter'}
            description={
              rows.length === 0
                ? 'Create one, then paste a question set straight from ChatGPT rather than typing them out.'
                : 'Try a different status.'
            }
          />
        </Card>
      ) : (
        <Card className="divide-border divide-y p-0">
          {filtered.map((row) => (
            <Link
              key={row.id}
              href={`/admin/assessments/${row.id}`}
              className="hover:bg-bg-sunken flex items-center gap-3 p-4 transition-colors"
            >
              <span className="bg-bg-sunken text-fg-subtle grid size-9 shrink-0 place-items-center rounded-full">
                <ClipboardList className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-fg truncate text-sm font-bold">{row.title}</p>
                <p className="text-fg-subtle truncate text-xs">
                  {row.subjectName ?? row.curriculumRef ?? 'No topic set'} · {row.questionCount}{' '}
                  {row.questionCount === 1 ? 'question' : 'questions'} · {describeLength(row)} ·
                  pass {row.passMarkPct}%
                </p>
              </div>
              {row.pendingReview > 0 && <Badge tone="warning">{row.pendingReview} to mark</Badge>}
              {row.attemptCount > 0 && (
                <span className="text-fg-muted shrink-0 text-xs tabular-nums">
                  {row.attemptCount} {row.attemptCount === 1 ? 'attempt' : 'attempts'}
                </span>
              )}
              <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
            </Link>
          ))}
        </Card>
      )}

      <Sheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New assessment"
        description="It starts as a draft. Add questions, then publish when it is ready."
      >
        <CreateAssessmentForm cohortId={cohortId} />
      </Sheet>
    </div>
  );
}

function CreateAssessmentForm({ cohortId }: { cohortId: string }) {
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
          const result = await saveAssessmentAction(cohortId, null, null, formData);
          if (!result.ok) {
            setMessage(result.message);
            setErrors(result.errors ?? {});
            return;
          }
          toast.success('Assessment created', 'Now add the questions.');
          router.push(`/admin/assessments/${result.data.id}`);
        })
      }
    >
      <FormError>{message}</FormError>
      <TextInput
        label="Title"
        name="title"
        required
        error={errors.title}
        placeholder="Inflammation — weekly check"
      />
      <TextInput
        label="Syllabus topic (optional)"
        name="curriculumRef"
        error={errors.curriculumRef}
        hint="A path like pathology/general-pathology/inflammation. Links the paper to the roadmap topic."
      />
      <TextArea
        label="Instructions for the student (optional)"
        name="instructions"
        error={errors.instructions}
        placeholder="Single best answer. Do not use notes."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Total time (minutes)"
          name="totalTimeMinutes"
          type="number"
          min={0}
          max={600}
          defaultValue={0}
          error={errors.totalTimeMinutes}
          hint="0 means only the per-question timers apply."
        />
        <TextInput
          label="Default seconds per question"
          name="defaultQuestionSeconds"
          type="number"
          min={5}
          max={3600}
          defaultValue={60}
          error={errors.defaultQuestionSeconds}
          hint="Used for any question with no timer of its own."
        />
        <TextInput
          label="Pass mark (%)"
          name="passMarkPct"
          type="number"
          min={1}
          max={100}
          defaultValue={60}
          error={errors.passMarkPct}
        />
        <TextInput
          label="Focus grace (seconds)"
          name="focusGraceSeconds"
          type="number"
          min={1}
          max={120}
          defaultValue={5}
          error={errors.focusGraceSeconds}
          hint="Longer than this away from the tab restarts the attempt."
        />
      </div>
      <Select
        label="Let students review their answers afterwards"
        name="allowAnswerReview"
        defaultValue="true"
      >
        <option value="true">Yes — show correct answers and explanations</option>
        <option value="">No — score only</option>
      </Select>
      <Button type="submit" size="lg" fullWidth loading={pending}>
        Create draft
      </Button>
    </form>
  );
}
