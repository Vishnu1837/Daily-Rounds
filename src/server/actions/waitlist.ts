'use server';

import { db } from '@/db/client';
import { waitlistEntries } from '@/db/schema';
import { waitlistSchema } from '@/lib/validation';

import { type Result, fail, guarded, ok } from './shared';

/**
 * Captures a next-cohort enquiry from the public landing page.
 *
 * The only unauthenticated write in the product, which shapes it:
 *
 *  - It writes to a table that touches nothing in the cohort graph, so a hostile submission
 *    cannot reach student data.
 *  - It returns the same success message for a new entry and a repeat submission. The
 *    WhatsApp number is unique, and reporting "you are already on the list" would turn this
 *    form into an oracle for whether a given number has signed up.
 *  - It stores exactly what the form collects. No IP, no fingerprinting.
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

    await db
      .insert(waitlistEntries)
      .values({
        fullName: input.fullName,
        whatsapp: input.whatsapp,
        email: input.email ?? null,
        mbbsYear: input.mbbsYear ?? null,
        university: input.university ?? null,
        challenge: input.challenge ?? null,
      })
      // A second submission updates the details rather than erroring, so someone correcting
      // a typo in their own name is not told they are a duplicate.
      .onConflictDoUpdate({
        target: waitlistEntries.whatsapp,
        set: {
          fullName: input.fullName,
          email: input.email ?? null,
          mbbsYear: input.mbbsYear ?? null,
          university: input.university ?? null,
          challenge: input.challenge ?? null,
        },
      });

    return ok();
  }, 'We could not save that just now. Please try again, or message us on WhatsApp.');
}
