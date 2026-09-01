-- Two-subject syllabus-driven roadmaps, announcement acknowledgement, and the public waitlist.
--
-- Three independent changes ship together because they are the data model the revised
-- product brief depends on:
--
--   1. A roadmap now occupies one of exactly two slots per student, and knows which subject
--      of the master syllabus it was generated from.
--   2. Announcements can surface as a one-time popup, with per-student acknowledgement.
--   3. The public landing page can capture next-cohort enquiries.

/* ------------------------------------------------- 1. two-subject roadmaps */

DO $$ BEGIN
  CREATE TYPE "roadmap_slot" AS ENUM ('primary', 'secondary');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

ALTER TABLE "roadmaps" ADD COLUMN IF NOT EXISTS "slot" "roadmap_slot" NOT NULL DEFAULT 'primary';--> statement-breakpoint
ALTER TABLE "roadmaps" ADD COLUMN IF NOT EXISTS "curriculum_ref" varchar(200);--> statement-breakpoint
ALTER TABLE "roadmaps" ADD COLUMN IF NOT EXISTS "generated_at" timestamptz NOT NULL DEFAULT now();--> statement-breakpoint

-- Backfill the subject slug a roadmap was built from. Every existing roadmap already points
-- at a subject row, and `subjects.slug` is the curriculum key.
UPDATE "roadmaps" AS r
SET "curriculum_ref" = s."slug"
FROM "subjects" AS s
WHERE s."id" = r."subject_id" AND r."curriculum_ref" IS NULL;--> statement-breakpoint

-- Existing students may hold more than two roadmaps, and all of them currently read
-- 'primary'. Keep the two oldest per student as primary + secondary and drop the rest:
-- the brief caps active subjects at two, and a roadmap generated from the syllabus is
-- reproducible at any time, so nothing unrecoverable is lost.
WITH ranked AS (
  SELECT "id", "member_id",
         row_number() OVER (PARTITION BY "member_id" ORDER BY "created_at", "id") AS rn
  FROM "roadmaps"
)
DELETE FROM "roadmaps" WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 2);--> statement-breakpoint

WITH ranked AS (
  SELECT "id",
         row_number() OVER (PARTITION BY "member_id" ORDER BY "created_at", "id") AS rn
  FROM "roadmaps"
)
UPDATE "roadmaps" AS r
SET "slot" = 'secondary'
FROM ranked
WHERE ranked."id" = r."id" AND ranked.rn = 2;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "roadmaps_member_slot_unique"
  ON "roadmaps" ("member_id", "slot");--> statement-breakpoint

/* ------------------------------------ 2. multi-select consistency challenges */

ALTER TABLE "student_goals"
  ADD COLUMN IF NOT EXISTS "challenges" text[] NOT NULL DEFAULT ARRAY[]::text[];--> statement-breakpoint

-- Seed the array from the single obstacle already on record, so existing students are not
-- shown an empty challenge list. 'none' carries no information and stays empty.
UPDATE "student_goals"
SET "challenges" = ARRAY["biggest_obstacle"::text]
WHERE cardinality("challenges") = 0 AND "biggest_obstacle" <> 'none';--> statement-breakpoint

/* ------------------------------------------------ 3. announcement pop-ups */

ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "is_popup" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "is_persistent" boolean NOT NULL DEFAULT false;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "announcement_reads" (
  "announcement_id" uuid NOT NULL REFERENCES "announcements"("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "cohort_members"("id") ON DELETE CASCADE,
  "read_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "announcement_reads_pk" PRIMARY KEY ("announcement_id", "member_id")
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "announcement_reads_member_idx"
  ON "announcement_reads" ("member_id");--> statement-breakpoint

/* ------------------------------------------------------- 4. public waitlist */

DO $$ BEGIN
  CREATE TYPE "waitlist_status" AS ENUM ('new', 'contacted', 'enrolled', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "waitlist_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "full_name" varchar(120) NOT NULL,
  "whatsapp" varchar(32) NOT NULL,
  "email" varchar(255),
  "mbbs_year" smallint,
  "university" varchar(160),
  "challenge" text,
  "status" "waitlist_status" NOT NULL DEFAULT 'new',
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "waitlist_created_idx" ON "waitlist_entries" ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_whatsapp_unique" ON "waitlist_entries" ("whatsapp");
