'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { FormError, Select, TextArea, TextInput } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/ui/page-header';
import type { MaterialType } from '@/db/schema';
/*
 * Type-only. `@/lib/curriculum` eagerly indexes the whole MBBS tree at module load, and a
 * value import of it from a client component put ~160 KB of curriculum data into this
 * page's bundle just to render a badge. The badge text is resolved on the server now and
 * arrives as `refPath`.
 */
import type { RefOption } from '@/lib/curriculum';
import { deleteMaterialAction, saveMaterialAction } from '@/server/actions/admin';

type Material = {
  id: string;
  title: string;
  description: string | null;
  type: MaterialType;
  url: string;
  curriculumRef: string | null;
  /** The curriculum breadcrumb for `curriculumRef`, resolved server-side. */
  refPath: string[] | null;
  subjectId: string | null;
  subjectName: string | null;
};

type SubjectOption = { id: string; name: string; slug: string };

const TYPES: { value: MaterialType; label: string; emoji: string }[] = [
  { value: 'pdf', label: 'PDF', emoji: '📄' },
  { value: 'drive', label: 'Drive folder', emoji: '📁' },
  { value: 'video', label: 'Video', emoji: '▶️' },
  { value: 'textbook', label: 'Textbook reference', emoji: '📚' },
  { value: 'website', label: 'Website', emoji: '🔗' },
  { value: 'recording', label: 'Session recording', emoji: '🎥' },
];

export function MaterialsAdminScreen({
  cohortId,
  materials,
  subjects,
  refOptions,
}: {
  cohortId: string;
  materials: Material[];
  subjects: SubjectOption[];
  /** Every addressable place in the curriculum, keyed by subject slug. */
  refOptions: Record<string, RefOption[]>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [sheet, setSheet] = useState<{ open: boolean; material: Material | null }>({
    open: false,
    material: null,
  });
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Library"
        title="Materials"
        description="External links only — no file hosting, by design."
        actions={
          <Button size="md" onClick={() => setSheet({ open: true, material: null })}>
            <Plus className="size-4" aria-hidden />
            Add material
          </Button>
        }
      />

      <Card>
        <CardHeader title={`${materials.length} resources`} />
        {materials.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="size-6" aria-hidden />}
            title="No materials yet"
            description="Add a link and tag it with a topic — it will appear under that topic for every student."
          />
        ) : (
          <ul className="divide-border mt-2 divide-y">
            {materials.map((m) => (
              <li key={m.id} className="flex items-start gap-3 p-4">
                <span className="text-xl" aria-hidden>
                  {TYPES.find((t) => t.value === m.type)?.emoji ?? '🔗'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-fg text-sm font-bold">{m.title}</p>
                  {m.description && <p className="text-fg-muted text-xs">{m.description}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {m.subjectName && <Badge tone="iris">{m.subjectName}</Badge>}
                    {m.refPath && <Badge>{m.refPath.join(' · ')}</Badge>}
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-pulse-700 dark:text-pulse-400 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                    >
                      Open <ExternalLink className="size-3" aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => setSheet({ open: true, material: m })}
                    aria-label={`Edit ${m.title}`}
                    className="tap text-fg-subtle hover:bg-bg-sunken hover:text-fg grid size-8 place-items-center rounded-lg"
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </button>
                  {confirming === m.id ? (
                    <div className="flex gap-1">
                      <Button
                        variant="danger"
                        size="sm"
                        loading={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await deleteMaterialAction(cohortId, m.id);
                            if (!result.ok) {
                              toast.error('Could not delete', result.message);
                              return;
                            }
                            toast.success('Material removed');
                            setConfirming(null);
                            router.refresh();
                          })
                        }
                      >
                        Confirm
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(m.id)}
                      aria-label={`Delete ${m.title}`}
                      className="tap text-fg-subtle hover:bg-danger/10 hover:text-danger grid size-8 place-items-center rounded-lg"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Sheet
        open={sheet.open}
        onClose={() => setSheet({ open: false, material: null })}
        title={sheet.material ? 'Edit material' : 'Add material'}
      >
        <MaterialForm
          cohortId={cohortId}
          subjects={subjects}
          refOptions={refOptions}
          material={sheet.material}
          onDone={() => setSheet({ open: false, material: null })}
        />
      </Sheet>
    </div>
  );
}

function MaterialForm({
  cohortId,
  subjects,
  refOptions,
  material,
  onDone,
}: {
  cohortId: string;
  subjects: SubjectOption[];
  refOptions: Record<string, RefOption[]>;
  material: Material | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});

  /*
   * Subject and curriculum place are one decision, not two, so the subject select drives
   * which places are offered and clearing it clears the ref. Filing a Pathology reading
   * under an Anatomy section was possible with the free-text field this replaced.
   */
  const [subjectId, setSubjectId] = useState(material?.subjectId ?? '');
  const [curriculumRef, setCurriculumRef] = useState(material?.curriculumRef ?? '');
  const subjectSlug = subjects.find((s) => s.id === subjectId)?.slug ?? null;
  const places = subjectSlug ? (refOptions[subjectSlug] ?? []) : [];

  return (
    <form
      className="space-y-4 pt-2"
      action={(formData) =>
        startTransition(async () => {
          setMessage(undefined);
          setErrors({});
          const result = await saveMaterialAction(material?.id ?? null, null, formData);
          if (!result.ok) {
            setMessage(result.message);
            setErrors(result.errors ?? {});
            return;
          }
          toast.success(material ? 'Material updated' : 'Material added');
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
        defaultValue={material?.title ?? ''}
        required
        error={errors.title}
      />
      <TextInput
        label="URL"
        name="url"
        type="url"
        defaultValue={material?.url ?? ''}
        required
        error={errors.url}
        placeholder="https://drive.google.com/..."
      />
      <Select label="Type" name="type" defaultValue={material?.type ?? 'pdf'}>
        {TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.emoji} {t.label}
          </option>
        ))}
      </Select>
      <Select
        label="Subject"
        name="subjectId"
        value={subjectId}
        onChange={(e) => {
          setSubjectId(e.target.value);
          setCurriculumRef('');
        }}
      >
        <option value="">Not subject-specific</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <Select
        label="Curriculum place (optional)"
        name="curriculumRef"
        value={curriculumRef}
        onChange={(e) => setCurriculumRef(e.target.value)}
        disabled={places.length === 0}
        error={errors.curriculumRef}
        hint={
          places.length === 0
            ? 'Choose a subject first to file this against a section or topic.'
            : 'Students studying anywhere on this branch will see it.'
        }
      >
        <option value="">Anywhere in the cohort library</option>
        {places.map((p) => (
          <option key={p.ref} value={p.ref}>
            {p.label}
          </option>
        ))}
      </Select>
      <TextArea
        label="Description (optional)"
        name="description"
        defaultValue={material?.description ?? ''}
      />
      <Button type="submit" size="lg" fullWidth loading={pending}>
        {material ? 'Save material' : 'Add material'}
      </Button>
    </form>
  );
}
