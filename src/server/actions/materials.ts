'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { db } from '@/db/client';
import { materials } from '@/db/schema';
import { requireAdminAction } from '@/lib/auth/guards';
import { PDF_MAGIC, formatBytes } from '@/lib/domain/textbooks';
import { fieldErrors, materialSchema } from '@/lib/validation';
import { invalidateCohortLibrary } from '@/server/cache';
import {
  MAX_TEXTBOOK_BYTES,
  deleteObject,
  keyBelongsToCohort,
  newTextbookKey,
  objectSize,
  readObject,
  storageDriver,
  uploadUrlFor,
} from '@/server/textbook-storage';

import { type Result, fail, guarded, ok, recordAudit } from './shared';

/**
 * Hands the admin's browser somewhere to put a textbook.
 *
 * The file goes straight from their machine to the bucket. Routing 200 MB through a server
 * action would mean holding the whole book in a function's memory for no benefit — the
 * server's job is to decide *whether* an upload may happen and *where*, and it does both
 * here: the key is ours, and the URL it signs expires in minutes.
 */
export async function startTextbookUploadAction(
  cohortId: string,
  sizeBytes: number,
): Promise<Result<{ key: string; uploadUrl: string }>> {
  return guarded(async () => {
    await requireAdminAction();
    if (!z.string().uuid().safeParse(cohortId).success) return fail('Unknown cohort.');
    if (storageDriver() === 'none') {
      return fail('Textbook storage is not set up yet. Add the R2 keys to the deployment.');
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return fail('That file is empty.');
    if (sizeBytes > MAX_TEXTBOOK_BYTES) {
      return fail(`Textbooks can be up to ${formatBytes(MAX_TEXTBOOK_BYTES)}.`);
    }

    const key = newTextbookKey(cohortId);
    return ok({ key, uploadUrl: await uploadUrlFor(key) });
  }, 'We could not start that upload. Please try again.');
}

export async function saveMaterialAction(
  materialId: string | null,
  _prev: unknown,
  formData: FormData,
): Promise<Result> {
  return guarded(async () => {
    const user = await requireAdminAction();
    const parsed = materialSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail('Check the highlighted fields.', fieldErrors(parsed.error));

    const input = parsed.data;
    const existing = materialId
      ? (
          await db
            .select({ storageKey: materials.storageKey })
            .from(materials)
            .where(and(eq(materials.id, materialId), eq(materials.cohortId, input.cohortId)))
            .limit(1)
        )[0]
      : null;
    if (materialId && !existing) return fail('That material no longer exists.');

    let source: { url: string | null; storageKey: string | null; sizeBytes: number | null } | null;

    if (input.source === 'link') {
      if (!input.url) return fail('Check the highlighted fields.', { url: 'Enter a URL.' });
      source = { url: input.url, storageKey: null, sizeBytes: null };
    } else if (input.storageKey) {
      const checked = await checkUpload(input.storageKey, input.cohortId);
      if (!checked.ok) return fail(checked.message, { file: checked.message });
      source = { url: null, storageKey: input.storageKey, sizeBytes: checked.size };
    } else if (existing?.storageKey) {
      // Editing a hosted book's details without replacing its file.
      source = null;
    } else {
      return fail('Check the highlighted fields.', { file: 'Choose a PDF to upload.' });
    }

    const values = {
      cohortId: input.cohortId,
      subjectId: input.subjectId ?? null,
      curriculumRef: input.curriculumRef ?? null,
      title: input.title,
      description: input.description ?? null,
      // A hosted file is always a textbook: it is read in the reader, not opened as a link.
      type: input.source === 'file' ? ('textbook' as const) : input.type,
      ...(source ?? {}),
    };

    if (materialId) {
      await db
        .update(materials)
        .set(values)
        .where(and(eq(materials.id, materialId), eq(materials.cohortId, input.cohortId)));
    } else {
      await db.insert(materials).values(values);
    }

    // The file this material used to point at, if it now points somewhere else.
    const replacedKey =
      source && existing?.storageKey && existing.storageKey !== source.storageKey
        ? existing.storageKey
        : null;
    if (replacedKey) await removeQuietly(replacedKey);

    await recordAudit({
      actorUserId: user.id,
      action: materialId ? 'material.update' : 'material.create',
      entity: 'material',
      entityId: materialId ?? undefined,
      payload: { title: input.title, hosted: input.source === 'file' },
    });

    invalidateCohortLibrary(input.cohortId);
    revalidatePath('/admin/materials');
    revalidatePath('/materials');
    return ok();
  }, 'We could not save that material. Please try again.');
}

export async function deleteMaterialAction(cohortId: string, materialId: string): Promise<Result> {
  return guarded(async () => {
    await requireAdminAction();
    const [removed] = await db
      .delete(materials)
      .where(and(eq(materials.id, materialId), eq(materials.cohortId, cohortId)))
      .returning({ storageKey: materials.storageKey });
    if (removed?.storageKey) await removeQuietly(removed.storageKey);

    invalidateCohortLibrary(cohortId);
    revalidatePath('/admin/materials');
    revalidatePath('/materials');
    return ok();
  }, 'We could not delete that material. Please try again.');
}

/**
 * Confirms that what the browser says it uploaded is really there, really ours, and really
 * a PDF — the browser is only reporting, and none of those three is its word to give.
 */
async function checkUpload(
  key: string,
  cohortId: string,
): Promise<{ ok: true; size: number } | { ok: false; message: string }> {
  if (!keyBelongsToCohort(key, cohortId)) return { ok: false, message: 'Upload not recognised.' };

  const size = await objectSize(key);
  if (size === null) return { ok: false, message: 'The upload did not finish. Try again.' };
  if (size > MAX_TEXTBOOK_BYTES) {
    await removeQuietly(key);
    return { ok: false, message: `Textbooks can be up to ${formatBytes(MAX_TEXTBOOK_BYTES)}.` };
  }

  const head = await readObject(key, `bytes=0-${PDF_MAGIC.length - 1}`);
  const bytes = head?.body ? new Uint8Array(await new Response(head.body).arrayBuffer()) : null;
  if (!bytes || new TextDecoder().decode(bytes.slice(0, PDF_MAGIC.length)) !== PDF_MAGIC) {
    await removeQuietly(key);
    return { ok: false, message: 'That file is not a PDF.' };
  }

  return { ok: true, size };
}

/**
 * Deletes an object whose row is already gone or repointed.
 *
 * A failure is logged rather than surfaced: the material is already saved or removed, which
 * is what the admin asked for, and an orphaned object costs storage, not privacy — nothing
 * can reach it without a row that names it.
 */
async function removeQuietly(key: string) {
  try {
    await deleteObject(key);
  } catch (error) {
    console.error('[daily-rounds] could not delete textbook object:', key, error);
  }
}
