/**
 * Re-aligns already-generated roadmaps with the master syllabus order.
 *
 * The syllabus is the single source of ordering: `generateRoadmapForSubject` walks the
 * curriculum arrays and hands out `weekNumber` and `position` from their index. A roadmap
 * written before an ordering fix therefore keeps the old sequence in its rows until it is
 * rebuilt — and rebuilding through `writeRoadmapFromSyllabus` deletes the roadmap, which
 * throws away every completion.
 *
 * So this script resequences in place. It matches on `curriculum_ref`, which is stable
 * across an ordering change, and touches only `week_number`, `week_id` and `position`.
 * Titles, descriptions, status and `completed_at` are left exactly as they are.
 *
 *     npm run db:resequence            # report what would change
 *     npm run db:resequence -- --apply # write it
 *
 * A topic whose ref is missing or no longer in the syllabus (an admin-typed one) keeps its
 * relative order and is parked after everything the syllabus knows about, rather than being
 * deleted or silently reordered.
 */
import { asc, eq } from 'drizzle-orm';

import { loadEnv } from './env';

loadEnv();

const APPLY = process.argv.includes('--apply');

async function main() {
  const { db, closeDb } = await import('../client');
  const { roadmapTopics, roadmapWeeks, roadmaps } = await import('../schema');
  const { generateRoadmapForSubject } = await import('@/lib/roadmap/generate');

  const allRoadmaps = await db
    .select({ id: roadmaps.id, subjectRef: roadmaps.curriculumRef, title: roadmaps.title })
    .from(roadmaps);

  let changedRoadmaps = 0;
  let movedTopics = 0;
  let renumberedWeeks = 0;
  const skipped: string[] = [];

  for (const roadmap of allRoadmaps) {
    const generated = roadmap.subjectRef ? generateRoadmapForSubject(roadmap.subjectRef) : null;
    if (!generated) {
      skipped.push(`${roadmap.title} (subject ref: ${roadmap.subjectRef ?? 'none'})`);
      continue;
    }

    // Target sequence, straight off the syllabus.
    const weekNumberByRef = new Map(generated.weeks.map((w) => [w.ref, w.weekNumber]));
    const positionByRef = new Map(
      generated.weeks.flatMap((w) => w.topics.map((t) => [t.ref, t.position] as const)),
    );

    const weeks = await db
      .select({
        id: roadmapWeeks.id,
        weekNumber: roadmapWeeks.weekNumber,
        title: roadmapWeeks.title,
      })
      .from(roadmapWeeks)
      .where(eq(roadmapWeeks.roadmapId, roadmap.id))
      .orderBy(asc(roadmapWeeks.weekNumber));

    // Weeks carry no ref column, so they are matched by title — which is the section title
    // the generator wrote and is unique within a subject.
    const weekNumberByTitle = new Map(generated.weeks.map((w) => [w.title, w.weekNumber]));
    const weekIdByNumber = new Map<number, string>();
    const weekUpdates: { id: string; from: number; to: number }[] = [];
    let overflow = generated.weeks.length;
    for (const week of weeks) {
      const target = weekNumberByTitle.get(week.title) ?? ++overflow;
      weekIdByNumber.set(target, week.id);
      if (target !== week.weekNumber)
        weekUpdates.push({ id: week.id, from: week.weekNumber, to: target });
    }

    const topics = await db
      .select({
        id: roadmapTopics.id,
        title: roadmapTopics.title,
        ref: roadmapTopics.curriculumRef,
        position: roadmapTopics.position,
        weekId: roadmapTopics.weekId,
      })
      .from(roadmapTopics)
      .where(eq(roadmapTopics.roadmapId, roadmap.id))
      .orderBy(asc(roadmapTopics.position));

    // A roadmap written from the old curated templates carries titles and refs the syllabus
    // has never heard of. Resequencing one would not fix its order — it would push every
    // topic into the unmatched tail — so leave it alone and say so.
    const matched = topics.filter((t) => t.ref && positionByRef.has(t.ref)).length;
    if (matched * 2 < topics.length) {
      skipped.push(`${roadmap.title} (${matched}/${topics.length} topics match the syllabus)`);
      continue;
    }

    const topicUpdates: { id: string; from: number; to: number; weekId: string | null }[] = [];
    let tail = positionByRef.size;
    for (const topic of topics) {
      const target = (topic.ref ? positionByRef.get(topic.ref) : undefined) ?? tail++;
      const sectionRef = topic.ref?.split('/').slice(0, 2).join('/');
      const weekNumber = sectionRef ? weekNumberByRef.get(sectionRef) : undefined;
      const weekId = (weekNumber ? weekIdByNumber.get(weekNumber) : undefined) ?? topic.weekId;
      if (target !== topic.position || weekId !== topic.weekId) {
        topicUpdates.push({ id: topic.id, from: topic.position, to: target, weekId });
      }
    }

    if (weekUpdates.length === 0 && topicUpdates.length === 0) continue;

    changedRoadmaps++;
    renumberedWeeks += weekUpdates.length;
    movedTopics += topicUpdates.length;
    console.log(
      `→ ${roadmap.title}: ${topicUpdates.length} topic(s), ${weekUpdates.length} week(s) out of syllabus order`,
    );

    if (!APPLY) continue;

    await db.transaction(async (tx) => {
      // `roadmap_week_unique` is on (roadmap_id, week_number), so the intermediate state of
      // a renumber would collide. Park every moving week above the range first.
      const PARK = 1000;
      for (const w of weekUpdates) {
        await tx
          .update(roadmapWeeks)
          .set({ weekNumber: w.to + PARK })
          .where(eq(roadmapWeeks.id, w.id));
      }
      for (const w of weekUpdates) {
        await tx.update(roadmapWeeks).set({ weekNumber: w.to }).where(eq(roadmapWeeks.id, w.id));
      }
      // `position` has no unique constraint, so topics need no parking pass.
      for (const t of topicUpdates) {
        await tx
          .update(roadmapTopics)
          .set({ position: t.to, weekId: t.weekId })
          .where(eq(roadmapTopics.id, t.id));
      }
    });
  }

  for (const s of skipped) console.warn(`⚠  skipped, not syllabus-generated: ${s}`);

  console.log(
    APPLY
      ? `✓ resequenced ${changedRoadmaps} roadmap(s): ${movedTopics} topic(s), ${renumberedWeeks} week(s)`
      : `${changedRoadmaps} roadmap(s) would change: ${movedTopics} topic(s), ${renumberedWeeks} week(s). Re-run with --apply to write.`,
  );

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
