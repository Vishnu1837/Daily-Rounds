-- Per-student roadmap state.
--
-- Two things the roadmap could not previously say about itself. `is_customized` records
-- that an admin has hand-edited this one student's sequence, so the console can show
-- Custom vs Default and offer a reset without diffing against the syllabus every render.
-- `completed_at` records that the last topic of the subject is finished, so bulk topic
-- advancement can stop rather than silently finding no next topic and doing nothing.
ALTER TABLE "roadmaps"
  ADD COLUMN IF NOT EXISTS "is_customized" boolean NOT NULL DEFAULT false;
ALTER TABLE "roadmaps"
  ADD COLUMN IF NOT EXISTS "completed_at" timestamptz;

-- Two daily topics: one per subject slot.
--
-- A student carries two roadmaps but could only ever hold one topic per day, because the
-- uniqueness key was (member, date). The home screen therefore had one subject's topic to
-- show and no way to reach the other. The slot joins the key, so a day holds up to two
-- rows — primary and secondary — and every existing row keeps the slot of the roadmap its
-- topic belongs to.
ALTER TABLE "daily_assignments"
  ADD COLUMN IF NOT EXISTS "slot" "roadmap_slot" NOT NULL DEFAULT 'primary';

UPDATE "daily_assignments" AS da
SET "slot" = r."slot"
FROM "roadmap_topics" AS rt
JOIN "roadmaps" AS r ON r."id" = rt."roadmap_id"
WHERE rt."id" = da."topic_id"
  AND da."slot" <> r."slot";

DROP INDEX IF EXISTS "daily_assignment_unique";
CREATE UNIQUE INDEX "daily_assignment_unique"
  ON "daily_assignments" ("member_id", "date", "slot");
