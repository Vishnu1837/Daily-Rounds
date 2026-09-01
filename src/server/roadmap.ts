import 'server-only';

import { and, asc, eq, inArray, ne } from 'drizzle-orm';

import { db } from '@/db/client';
import {
  type RoadmapSlot,
  dailyAssignments,
  roadmapTopics,
  roadmapWeeks,
  roadmaps,
  studentGoals,
  subjects,
} from '@/db/schema';
import { generateRoadmapForSubject } from '@/lib/roadmap/generate';

/**
 * Roadmap writes.
 *
 * Every path that creates, replaces, resets or deletes a student's roadmap goes through
 * this module, and every one of them builds from the master syllabus. There is deliberately
 * no function here that accepts a caller-supplied topic list: the brief's rule is that the
 * roadmap is a *view* of the curriculum, never a second hand-authored topic database, and
 * the only way to keep that true is to give callers no way to express anything else.
 *
 * The two-subject cap is enforced by the `roadmaps_member_slot_unique` index rather than by
 * checking first and inserting second, which would race.
 */

export type WriteRoadmapArgs = {
  memberId: string;
  /** One of the 19 curriculum subject slugs. */
  subjectSlug: string;
  slot: RoadmapSlot;
  dailyMinutes?: number;
};

export type WriteRoadmapOutcome =
  | { ok: true; roadmapId: string; subjectName: string; topicCount: number }
  | { ok: false; reason: 'unknown-subject' | 'subject-not-seeded' };

/**
 * Builds (or rebuilds) the roadmap in one slot from the subject's syllabus.
 *
 * Replacing is destructive *by design and only within the slot*: the old roadmap row is
 * deleted, which cascades to its weeks and topics and therefore its completion state. The
 * other slot is never touched. Callers that reach here from a student-facing surface must
 * have shown the reset warning first — see `replaceActiveSubject`.
 */
export async function writeRoadmapFromSyllabus(
  args: WriteRoadmapArgs,
): Promise<WriteRoadmapOutcome> {
  const generated = generateRoadmapForSubject(args.subjectSlug);
  if (!generated) return { ok: false, reason: 'unknown-subject' };

  const [subject] = await db
    .select({ id: subjects.id, name: subjects.name })
    .from(subjects)
    .where(eq(subjects.slug, args.subjectSlug))
    .limit(1);
  if (!subject) return { ok: false, reason: 'subject-not-seeded' };

  const estimatedMinutes = args.dailyMinutes ?? 90;

  return db.transaction(async (tx) => {
    // Clearing the slot first is what makes this an upsert. The cascade removes the old
    // weeks and topics; daily_assignments.topic_id is ON DELETE SET NULL, so a student
    // pointed at a replaced topic simply loses today's assignment rather than the row.
    await tx
      .delete(roadmaps)
      .where(and(eq(roadmaps.memberId, args.memberId), eq(roadmaps.slot, args.slot)));

    const [roadmap] = await tx
      .insert(roadmaps)
      .values({
        memberId: args.memberId,
        subjectId: subject.id,
        slot: args.slot,
        title: generated.title,
        track: generated.track,
        curriculumRef: generated.subjectSlug,
        generatedAt: new Date(),
      })
      .returning({ id: roadmaps.id });

    if (!roadmap) throw new Error('roadmap insert returned no row');

    const weekRows = await tx
      .insert(roadmapWeeks)
      .values(
        generated.weeks.map((week) => ({
          roadmapId: roadmap.id,
          weekNumber: week.weekNumber,
          title: week.title,
        })),
      )
      .returning({ id: roadmapWeeks.id, weekNumber: roadmapWeeks.weekNumber });

    const weekIdByNumber = new Map(weekRows.map((w) => [w.weekNumber, w.id]));

    const topicValues = generated.weeks.flatMap((week) =>
      week.topics.map((topic) => ({
        roadmapId: roadmap.id,
        weekId: weekIdByNumber.get(week.weekNumber) ?? null,
        title: topic.title,
        curriculumRef: topic.ref,
        description: topic.description,
        position: topic.position,
        estimatedMinutes,
        // Only the very first topic of the subject starts in progress; everything else is
        // upcoming. Topics are never calendar-locked, so this is a starting point for the
        // "current topic" pointer, not a gate.
        status: (topic.position === 0 ? 'in_progress' : 'upcoming') as 'in_progress' | 'upcoming',
      })),
    );

    if (topicValues.length > 0) {
      // Chunked because a subject can carry ~50 topics and a bulk insert of every subject
      // at once (admin regeneration for a whole cohort) would otherwise build one enormous
      // parameterised statement.
      for (let i = 0; i < topicValues.length; i += 200) {
        await tx.insert(roadmapTopics).values(topicValues.slice(i, i + 200));
      }
    }

    return {
      ok: true as const,
      roadmapId: roadmap.id,
      subjectName: subject.name,
      topicCount: topicValues.length,
    };
  });
}

/** The subject slugs currently filling a student's two slots. */
export async function activeSubjects(
  memberId: string,
): Promise<{ slot: RoadmapSlot; subjectSlug: string; subjectName: string; roadmapId: string }[]> {
  const rows = await db
    .select({
      slot: roadmaps.slot,
      subjectSlug: subjects.slug,
      subjectName: subjects.name,
      roadmapId: roadmaps.id,
    })
    .from(roadmaps)
    .innerJoin(subjects, eq(subjects.id, roadmaps.subjectId))
    .where(eq(roadmaps.memberId, memberId))
    .orderBy(asc(roadmaps.slot));

  return rows;
}

export type ReplaceOutcome =
  | { ok: true; replacedSubject: string | null; newSubject: string; topicCount: number }
  | { ok: false; reason: 'unknown-subject' | 'subject-not-seeded' | 'duplicate-subject' };

/**
 * Swaps the subject in one slot, resetting only that slot's progress.
 *
 * Refuses to put the same subject in both slots — two identical roadmaps would double-count
 * the student's work and make "switch back" meaningless.
 */
export async function replaceActiveSubject(args: {
  memberId: string;
  slot: RoadmapSlot;
  subjectSlug: string;
  dailyMinutes?: number;
}): Promise<ReplaceOutcome> {
  const current = await activeSubjects(args.memberId);
  const otherSlot = current.find((r) => r.slot !== args.slot);
  if (otherSlot && otherSlot.subjectSlug === args.subjectSlug) {
    return { ok: false, reason: 'duplicate-subject' };
  }

  const replaced = current.find((r) => r.slot === args.slot)?.subjectName ?? null;

  const written = await writeRoadmapFromSyllabus({
    memberId: args.memberId,
    subjectSlug: args.subjectSlug,
    slot: args.slot,
    dailyMinutes: args.dailyMinutes,
  });
  if (!written.ok) return written;

  await syncGoalSubjects(args.memberId);

  return {
    ok: true,
    replacedSubject: replaced,
    newSubject: written.subjectName,
    topicCount: written.topicCount,
  };
}

/**
 * Clears completion state without rebuilding, so the topic list and any admin edits survive.
 *
 * This is the "reset progress" admin action; "regenerate" is `writeRoadmapFromSyllabus`.
 */
export async function resetRoadmapProgress(roadmapId: string): Promise<{ topicsReset: number }> {
  const reset = await db
    .update(roadmapTopics)
    .set({ status: 'upcoming', completedAt: null })
    .where(and(eq(roadmapTopics.roadmapId, roadmapId), ne(roadmapTopics.status, 'upcoming')))
    .returning({ id: roadmapTopics.id });

  // Put the pointer back on the first topic so the student has a current topic again.
  const [first] = await db
    .select({ id: roadmapTopics.id })
    .from(roadmapTopics)
    .where(eq(roadmapTopics.roadmapId, roadmapId))
    .orderBy(asc(roadmapTopics.position))
    .limit(1);

  if (first) {
    await db
      .update(roadmapTopics)
      .set({ status: 'in_progress' })
      .where(eq(roadmapTopics.id, first.id));
  }

  return { topicsReset: reset.length };
}

/** Removes a roadmap entirely, freeing its slot for a fresh assignment. */
export async function deleteRoadmap(roadmapId: string): Promise<void> {
  await db.delete(roadmaps).where(eq(roadmaps.id, roadmapId));
}

/**
 * Points `student_goals` at whatever actually fills the two slots.
 *
 * The goals row records what the student chose at onboarding and the roadmaps record what
 * they are studying now. Every write path that changes a slot calls this so an admin reading
 * the student record never sees a subject the student no longer has.
 */
export async function syncGoalSubjects(memberId: string): Promise<void> {
  const current = await activeSubjects(memberId);
  const bySlot = new Map(current.map((r) => [r.slot, r]));

  const slugs = current.map((r) => r.subjectSlug);
  const subjectRows =
    slugs.length > 0
      ? await db
          .select({ id: subjects.id, slug: subjects.slug })
          .from(subjects)
          .where(inArray(subjects.slug, slugs))
      : [];
  const idBySlug = new Map(subjectRows.map((s) => [s.slug, s.id]));

  const primary = bySlot.get('primary');
  const secondary = bySlot.get('secondary');

  await db
    .update(studentGoals)
    .set({
      primarySubjectId: primary ? (idBySlug.get(primary.subjectSlug) ?? null) : null,
      secondarySubjectId: secondary ? (idBySlug.get(secondary.subjectSlug) ?? null) : null,
    })
    .where(eq(studentGoals.memberId, memberId));
}

/**
 * Gives a member the roadmaps their onboarding choices imply, without disturbing any slot
 * that is already filled.
 *
 * This is the idempotent "make the student whole" call: onboarding uses it, and so does the
 * admin cohort-assignment flow. It is safe to run repeatedly.
 */
export async function ensureRoadmaps(args: {
  memberId: string;
  primarySubjectSlug: string | null;
  secondarySubjectSlug: string | null;
  dailyMinutes?: number;
  cohortTimezone: string;
  today: string;
}): Promise<void> {
  const existing = await activeSubjects(args.memberId);
  const filled = new Set(existing.map((r) => r.slot));

  const wanted: { slot: RoadmapSlot; slug: string | null }[] = [
    { slot: 'primary', slug: args.primarySubjectSlug },
    { slot: 'secondary', slug: args.secondarySubjectSlug },
  ];

  for (const { slot, slug } of wanted) {
    if (!slug || filled.has(slot)) continue;
    // Never let the same subject occupy both slots.
    if (existing.some((r) => r.subjectSlug === slug)) continue;

    await writeRoadmapFromSyllabus({
      memberId: args.memberId,
      subjectSlug: slug,
      slot,
      dailyMinutes: args.dailyMinutes,
    });
  }

  await assignTodaysTopic({
    memberId: args.memberId,
    today: args.today,
    plannedMinutes: args.dailyMinutes ?? 90,
  });
}

/**
 * Makes sure the student has something to study today.
 *
 * Picks the first incomplete topic across their active roadmaps, primary slot first. Does
 * nothing if today is already assigned, so it never overrides a deliberate choice.
 */
export async function assignTodaysTopic(args: {
  memberId: string;
  today: string;
  plannedMinutes?: number;
}): Promise<void> {
  const [existing] = await db
    .select({ id: dailyAssignments.id, topicId: dailyAssignments.topicId })
    .from(dailyAssignments)
    .where(and(eq(dailyAssignments.memberId, args.memberId), eq(dailyAssignments.date, args.today)))
    .limit(1);

  if (existing?.topicId) return;

  const [next] = await db
    .select({ id: roadmapTopics.id })
    .from(roadmapTopics)
    .innerJoin(roadmaps, eq(roadmaps.id, roadmapTopics.roadmapId))
    .where(and(eq(roadmaps.memberId, args.memberId), ne(roadmapTopics.status, 'completed')))
    .orderBy(asc(roadmaps.slot), asc(roadmapTopics.position))
    .limit(1);

  if (!next) return;

  await db
    .insert(dailyAssignments)
    .values({
      memberId: args.memberId,
      date: args.today,
      topicId: next.id,
      plannedMinutes: args.plannedMinutes ?? 90,
    })
    .onConflictDoUpdate({
      target: [dailyAssignments.memberId, dailyAssignments.date],
      set: { topicId: next.id },
    });
}
