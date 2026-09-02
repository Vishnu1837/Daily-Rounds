'use server';

import { and, desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db/client';
import { dailyAssignments, focusTrees } from '@/db/schema';
import { requireUserAction } from '@/lib/auth/guards';
import {
  type FocusPresetKey,
  type TreeSpecies,
  type WitherReason,
  hasRunFullRound,
  presetByKey,
  speciesFor,
} from '@/lib/domain/grove';
import { getMemberContext } from '@/server/context';
import { sweepAbandonedTrees } from '@/server/grove';

import { type Result, fail, guarded, ok } from './shared';

/** A round in progress, as the browser needs to draw it. */
export type PlantedTree = {
  id: string;
  preset: FocusPresetKey;
  species: TreeSpecies;
  focusMinutes: number;
  /** Server timestamps. The countdown is derived from these, never from a local start time. */
  plantedAt: string;
  dueAt: string;
  /** True when this was already running and we handed the same tree back. */
  resumed: boolean;
};

async function context() {
  const user = await requireUserAction();
  const ctx = await getMemberContext(user);
  if (!ctx) throw new Error('You are not in an active cohort yet.');
  return ctx;
}

/**
 * Starts a focus round, or hands back the one already running.
 *
 * Reloading the page, or opening the study screen in a second tab, must never cost a student
 * their tree — so an unfinished round is returned rather than replaced. Only the wall clock
 * can end a round: a second plant while one is live is a resume.
 */
export async function plantTreeAction(input: {
  preset: string;
  sessionId?: string | null;
}): Promise<Result<PlantedTree>> {
  return guarded(async () => {
    const ctx = await context();
    await sweepAbandonedTrees(ctx.memberId);

    const [live] = await db
      .select()
      .from(focusTrees)
      .where(and(eq(focusTrees.memberId, ctx.memberId), eq(focusTrees.status, 'growing')))
      .orderBy(desc(focusTrees.plantedAt))
      .limit(1);

    if (live) return ok(toPlanted(live, true));

    const preset = presetByKey(input.preset);

    const [assignment] = await db
      .select({ topicId: dailyAssignments.topicId })
      .from(dailyAssignments)
      .where(and(eq(dailyAssignments.memberId, ctx.memberId), eq(dailyAssignments.date, ctx.today)))
      .limit(1);

    const plantedAt = new Date();
    const [created] = await db
      .insert(focusTrees)
      .values({
        memberId: ctx.memberId,
        date: ctx.today,
        sessionId: input.sessionId ?? null,
        topicId: assignment?.topicId ?? null,
        preset: preset.key,
        focusMinutes: preset.focusMinutes,
        species: speciesFor(preset.focusMinutes),
        status: 'growing',
        plantedAt,
        dueAt: new Date(plantedAt.getTime() + preset.focusMinutes * 60_000),
      })
      .returning();

    return ok(toPlanted(created!, false));
  }, 'We could not start that round. Nothing has been planted — please try again.');
}

export type GrowOutcome = {
  focusMinutes: number;
  species: TreeSpecies;
  /** Grown trees in the student's grove today, including this one. */
  treesToday: number;
};

/**
 * Turns a finished round into a tree.
 *
 * The check is against `planted_at`, not against anything the client sends. A browser whose
 * countdown has run out early — a clock skew, a devtools console, a tampered timer — is told
 * the round is not finished rather than being handed a tree it did not sit through.
 */
export async function growTreeAction(treeId: string): Promise<Result<GrowOutcome>> {
  return guarded(async () => {
    const ctx = await context();

    const [tree] = await db
      .select()
      .from(focusTrees)
      .where(and(eq(focusTrees.id, treeId), eq(focusTrees.memberId, ctx.memberId)))
      .limit(1);

    if (!tree) return fail('That round could not be found.');
    if (tree.status === 'withered') return fail('That tree has already withered.');

    if (tree.status === 'growing') {
      if (!hasRunFullRound({ plantedAt: tree.plantedAt, focusMinutes: tree.focusMinutes })) {
        return fail('That round has not finished yet. Stay with it a little longer.');
      }
      await db
        .update(focusTrees)
        .set({ status: 'grown', settledAt: new Date() })
        .where(eq(focusTrees.id, tree.id));
    }

    const grownToday = await db
      .select({ id: focusTrees.id })
      .from(focusTrees)
      .where(
        and(
          eq(focusTrees.memberId, ctx.memberId),
          eq(focusTrees.date, ctx.today),
          eq(focusTrees.status, 'grown'),
        ),
      );

    revalidatePath('/grove');
    revalidatePath('/today');
    return ok({
      focusMinutes: tree.focusMinutes,
      species: tree.species,
      treesToday: grownToday.length,
    });
  }, 'We could not save that round. Please try again — your tree is still in the ground.');
}

/**
 * Kills a round early, and records why.
 *
 * There is no soft option here on purpose. The reason is written down and the stump stays in
 * the grove, because the only thing that makes "do not leave" mean anything is that leaving
 * leaves a mark.
 */
export async function witherTreeAction(treeId: string, reason: WitherReason): Promise<Result> {
  return guarded(async () => {
    const ctx = await context();

    const [tree] = await db
      .select({ id: focusTrees.id, status: focusTrees.status })
      .from(focusTrees)
      .where(and(eq(focusTrees.id, treeId), eq(focusTrees.memberId, ctx.memberId)))
      .limit(1);

    if (!tree) return fail('That round could not be found.');
    // Withering twice — two tabs both reporting the same walk-away — is a no-op, not an error.
    if (tree.status !== 'growing') return ok();

    await db
      .update(focusTrees)
      .set({ status: 'withered', witherReason: reason, settledAt: new Date() })
      .where(eq(focusTrees.id, tree.id));

    revalidatePath('/grove');
    return ok();
  }, 'We could not record that. Please try again.');
}

function toPlanted(row: typeof focusTrees.$inferSelect, resumed: boolean): PlantedTree {
  return {
    id: row.id,
    preset: presetByKey(row.preset).key,
    species: row.species,
    focusMinutes: row.focusMinutes,
    plantedAt: row.plantedAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
    resumed,
  };
}
