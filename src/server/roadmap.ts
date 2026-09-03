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

  // A roadmap with its progress cleared is by definition no longer finished.
  await db.update(roadmaps).set({ completedAt: null }).where(eq(roadmaps.id, roadmapId));

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
 * The day's assignment in one subject, or the leading one when no subject is named.
 *
 * A day now holds a topic per subject, so every write that acts on "today's topic" — start
 * the timer, plant a tree, mark the target done — has to say *which*. Callers that carry a
 * slot pass it; callers that do not get the first slot with a topic set, which is the same
 * topic the dashboard leads with.
 */
export async function todaysAssignment(
  memberId: string,
  date: string,
  slot?: RoadmapSlot,
): Promise<{ slot: RoadmapSlot; topicId: string | null; plannedMinutes: number } | null> {
  const rows = await db
    .select({
      slot: dailyAssignments.slot,
      topicId: dailyAssignments.topicId,
      plannedMinutes: dailyAssignments.plannedMinutes,
    })
    .from(dailyAssignments)
    .where(and(eq(dailyAssignments.memberId, memberId), eq(dailyAssignments.date, date)))
    .orderBy(asc(dailyAssignments.slot));

  if (slot) return rows.find((r) => r.slot === slot) ?? null;
  return rows.find((r) => r.topicId) ?? rows[0] ?? null;
}

/**
 * The next topic a roadmap owes the student, and what it means when there isn't one.
 *
 * "First topic that is not completed, in this roadmap's own order" is the single definition
 * of *next* in the product — the onboarding fallback, the bulk advance and the admin's next
 * button all have to agree on it, and a roadmap the admin has resequenced by hand has to be
 * walked in its own order rather than the syllabus's. Position is that order; customising a
 * roadmap rewrites positions and nothing here changes.
 *
 * A roadmap with nothing left is *finished*, which is a different answer from "nothing to
 * do": it is the point at which the subject stops receiving daily topics, and the caller
 * marks it so rather than wrapping back round to topic 1.
 */
export async function nextTopicForRoadmap(
  roadmapId: string,
): Promise<{ id: string; title: string } | null> {
  const [next] = await db
    .select({ id: roadmapTopics.id, title: roadmapTopics.title })
    .from(roadmapTopics)
    .where(and(eq(roadmapTopics.roadmapId, roadmapId), ne(roadmapTopics.status, 'completed')))
    // `in_progress` sorts before `upcoming` in the enum, so a topic the student is already
    // on wins over a lower-positioned one they have not started.
    .orderBy(asc(roadmapTopics.status), asc(roadmapTopics.position))
    .limit(1);

  return next ?? null;
}

/**
 * Records that a roadmap has no topics left, or that it has some again.
 *
 * Idempotent in both directions: re-running the advance does not keep rewriting the
 * timestamp, and adding a topic to a finished subject reopens it.
 */
export async function syncRoadmapCompletion(roadmapId: string, hasNext: boolean): Promise<void> {
  const [row] = await db
    .select({ completedAt: roadmaps.completedAt })
    .from(roadmaps)
    .where(eq(roadmaps.id, roadmapId))
    .limit(1);
  if (!row) return;

  if (!hasNext && !row.completedAt) {
    await db.update(roadmaps).set({ completedAt: new Date() }).where(eq(roadmaps.id, roadmapId));
  } else if (hasNext && row.completedAt) {
    await db.update(roadmaps).set({ completedAt: null }).where(eq(roadmaps.id, roadmapId));
  }
}

/**
 * Makes sure the student has something to study today — in *both* of their subjects.
 *
 * One call per slot, because a day now holds one topic per subject and the two are
 * independent: a student whose primary is finished still gets their secondary topic. A slot
 * that already has a topic for today is left exactly as it is, so this never overrides a
 * deliberate choice, and a roadmap with nothing left is marked complete instead of being
 * wrapped back to its first topic.
 */
export async function assignTodaysTopic(args: {
  memberId: string;
  today: string;
  plannedMinutes?: number;
}): Promise<void> {
  const existing = await db
    .select({ slot: dailyAssignments.slot, topicId: dailyAssignments.topicId })
    .from(dailyAssignments)
    .where(
      and(eq(dailyAssignments.memberId, args.memberId), eq(dailyAssignments.date, args.today)),
    );

  const filled = new Set(existing.filter((r) => r.topicId).map((r) => r.slot));

  const memberRoadmaps = await db
    .select({ id: roadmaps.id, slot: roadmaps.slot })
    .from(roadmaps)
    .where(eq(roadmaps.memberId, args.memberId))
    .orderBy(asc(roadmaps.slot));

  for (const roadmap of memberRoadmaps) {
    const next = await nextTopicForRoadmap(roadmap.id);
    await syncRoadmapCompletion(roadmap.id, Boolean(next));
    if (!next || filled.has(roadmap.slot)) continue;

    await db
      .insert(dailyAssignments)
      .values({
        memberId: args.memberId,
        date: args.today,
        slot: roadmap.slot,
        topicId: next.id,
        plannedMinutes: args.plannedMinutes ?? 90,
      })
      .onConflictDoUpdate({
        target: [dailyAssignments.memberId, dailyAssignments.date, dailyAssignments.slot],
        set: { topicId: next.id },
      });
  }
}
