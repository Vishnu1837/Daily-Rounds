'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db/client';
import { users } from '@/db/schema';
import { requireUserAction } from '@/lib/auth/guards';
import { invalidateOwnRanking } from '@/server/cache';
import { avatarSchema, fieldErrors } from '@/lib/validation';

import { type Result, fail, guarded, ok } from './shared';

/**
 * Sets or clears the signed-in person's profile picture.
 *
 * The image arrives already downscaled to a square data URL — see `AvatarPicker`, which
 * does the resizing in a canvas before it ever reaches the network. Passing `null` removes
 * the picture and falls back to the generated monogram.
 *
 * Students and admins share this action deliberately: a cohort lead's profile is a profile
 * like any other, and giving the admin console its own half of the same feature is how the
 * two drift apart.
 */
export async function updateAvatarAction(dataUrl: string | null): Promise<Result> {
  return guarded(async () => {
    const user = await requireUserAction();
    const parsed = avatarSchema.safeParse({ dataUrl });
    if (!parsed.success) {
      return fail('We could not use that picture.', fieldErrors(parsed.error));
    }

    await db
      .update(users)
      .set({ avatarUrl: parsed.data.dataUrl, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    await invalidateOwnRanking(user.id);
    // The avatar rides in the header on every screen, so nothing narrower would do.
    revalidatePath('/', 'layout');
    return ok();
  }, 'We could not save your picture. Please try again.');
}
