'use server';

import { eq, or, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db/client';
import { type WaitlistStatus, waitlistEntries } from '@/db/schema';
import { requireAdminAction } from '@/lib/auth/guards';
import { waitlistToCsv } from '@/lib/domain/waitlist';
import { waitlistNoteSchema, waitlistSchema, waitlistStatusSchema } from '@/lib/validation';
import { getWaitlistEntries } from '@/server/queries/waitlist';

import { type Result, fail, guarded, ok, recordAudit } from './shared';

/**
 * Captures a next-cohort enquiry from the public landing page.
 *
 * The only unauthenticated write in the product, which shapes it:
 *
 *  - It writes to a table that touches nothing in the cohort graph, so a hostile submission
 *    cannot reach student data.
 *  - It returns the same success message for a new entry and a repeat submission. The
 *    WhatsApp number and the email address are both unique, and reporting "you are already
 *    on the list" would turn this form into an oracle for whether a given person signed up.
 *  - It stores exactly what the form collects, plus the moment it arrived. No IP, no
 *    fingerprinting.
 */
export async function joinWaitlistAction(_prev: unknown, formData: FormData): Promise<Result> {
  return guarded(async () => {
    const parsed = waitlistSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || 'form';
        if (!(key in errors)) errors[key] = issue.message;
      }
      return fail('Check the highlighted fields.', errors);
    }

    const input = parsed.data;
    const email = input.email ?? null;

    const details = {
      fullName: input.fullName,
      whatsapp: input.whatsapp,
      email,
      mbbsYear: input.mbbsYear ?? null,
      university: input.university ?? null,
      challenge: input.challenge ?? null,
      updatedAt: new Date(),
    };

    /*
     * Two identities, one person.
     *
     * A repeat submission is matched on the WhatsApp number *or* the email address, so
     * someone who comes back a week later and mistypes one of the two still updates their
     * own row rather than creating a second one for the admin to chase twice. The lookup is
     * a real read rather than a pair of upserts because Postgres can only arbitrate one
     * unique index per `ON CONFLICT`.
     */
    const [existing] = await db
      .select({ id: waitlistEntries.id })
      .from(waitlistEntries)
      .where(
        email
          ? or(
              eq(waitlistEntries.whatsapp, input.whatsapp),
              sql`lower(${waitlistEntries.email}) = lower(${email})`,
            )
          : eq(waitlistEntries.whatsapp, input.whatsapp),
      )
      .limit(1);

    if (existing) {
      // A second submission updates the details rather than erroring, so someone correcting
      // a typo in their own name is not told they are a duplicate. `createdAt` is left
      // alone: the admin list is ordered by when this person first came to us.
      await db.update(waitlistEntries).set(details).where(eq(waitlistEntries.id, existing.id));
      return ok();
    }

    await db
      .insert(waitlistEntries)
      .values(details)
      // Two submissions racing each other land here. The number is the older of the two
      // constraints and the one the form always supplies, so it is what arbitrates.
      .onConflictDoUpdate({ target: waitlistEntries.whatsapp, set: details });

    return ok();
  }, 'We could not save that just now. Please try again, or message us on WhatsApp.');
}

/* ------------------------------------------------------------ admin side */

/**
 * Moves an enquiry along the pipeline.
 *
 * Guarded with `requireAdminAction` rather than by hiding the control: this action is a
 * public HTTP endpoint like every other server action, and the row it edits holds contact
 * details for people who are not users yet.
 */
export async function setWaitlistStatusAction(
  entryId: string,
  status: WaitlistStatus,
): Promise<Result> {
  return guarded(async () => {
    const user = await requireAdminAction();

    const parsed = waitlistStatusSchema.safeParse({ entryId, status });
    if (!parsed.success) return fail('That status is not one we recognise.');

    const updated = await db
      .update(waitlistEntries)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(eq(waitlistEntries.id, parsed.data.entryId))
      .returning({ id: waitlistEntries.id });

    if (updated.length === 0) return fail('That waitlist entry no longer exists.');

    await recordAudit({
      actorUserId: user.id,
      action: 'waitlist.status',
      entity: 'waitlist_entry',
      entityId: parsed.data.entryId,
      payload: { status: parsed.data.status },
    });

    revalidatePath('/admin/waitlist');
    return ok();
  }, 'We could not update that entry. Please try again.');
}

/** A private reminder of what was said when this person was contacted. */
export async function setWaitlistNoteAction(entryId: string, note: string): Promise<Result> {
  return guarded(async () => {
    await requireAdminAction();

    const parsed = waitlistNoteSchema.safeParse({ entryId, note });
    if (!parsed.success) return fail('That note is too long.');

    const updated = await db
      .update(waitlistEntries)
      .set({ note: parsed.data.note ?? null, updatedAt: new Date() })
      .where(eq(waitlistEntries.id, parsed.data.entryId))
      .returning({ id: waitlistEntries.id });

    if (updated.length === 0) return fail('That waitlist entry no longer exists.');

    revalidatePath('/admin/waitlist');
    return ok();
  }, 'We could not save that note. Please try again.');
}

/**
 * Removes an enquiry for good.
 *
 * A real delete, not a fifth status. "Not interested" already covers the case where the
 * person should stay on the list but stop being chased, so a soft delete here would just be
 * a second thing that looks like the first — and the reason an admin reaches for this is
 * usually spam, which nobody wants to keep.
 */
export async function deleteWaitlistEntryAction(entryId: string): Promise<Result> {
  return guarded(async () => {
    const user = await requireAdminAction();

    const deleted = await db
      .delete(waitlistEntries)
      .where(eq(waitlistEntries.id, entryId))
      .returning({ id: waitlistEntries.id, fullName: waitlistEntries.fullName });

    if (deleted.length === 0) return fail('That waitlist entry no longer exists.');

    await recordAudit({
      actorUserId: user.id,
      action: 'waitlist.delete',
      entity: 'waitlist_entry',
      entityId: entryId,
      payload: { fullName: deleted[0]!.fullName },
    });

    revalidatePath('/admin/waitlist');
    return ok();
  }, 'We could not delete that entry. Please try again.');
}

/**
 * The whole waitlist as a CSV, built on the server.
 *
 * The browser already holds every row it is showing, so this could have been assembled in
 * the client — but then the file would contain whatever the table had filtered down to, and
 * "export the complete waitlist" would silently become "export what I was looking at". It
 * is also one more place the admin check runs before contact details leave the server.
 */
export async function exportWaitlistCsvAction(): Promise<Result<{ csv: string; count: number }>> {
  return guarded(async () => {
    await requireAdminAction();
    const rows = await getWaitlistEntries();
    return ok({ csv: waitlistToCsv(rows), count: rows.length });
  }, 'We could not build that export. Please try again.');
}
