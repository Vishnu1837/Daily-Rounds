-- A live study room, uploaded profile pictures, and the cohort lead's name.
--
-- 1. The morning study room stops being a static link. Students join it themselves, which
--    both records their own attendance for the day and puts them on a live roster, so the
--    card can show who is actually in the room right now.
-- 2. Avatars may now be a real photograph. The image is stored inline as a data URL: a
--    256px square JPEG is a few tens of kilobytes, and a cohort of thirty is not worth an
--    object-storage dependency.
-- 3. The seeded cohort lead is renamed.

/* -------------------------------------------------- 1. study room presence */

CREATE TABLE IF NOT EXISTS "study_room_presence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "member_id" uuid NOT NULL REFERENCES "cohort_members"("id") ON DELETE cascade,
  "date" date NOT NULL,
  "joined_at" timestamptz DEFAULT now() NOT NULL,
  "last_seen_at" timestamptz DEFAULT now() NOT NULL,
  "left_at" timestamptz
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "study_room_presence_unique"
  ON "study_room_presence" ("member_id", "date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_room_presence_date_idx"
  ON "study_room_presence" ("date");--> statement-breakpoint

/* ---------------------------------------------------- 2. profile pictures */

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text;--> statement-breakpoint

/* ------------------------------------------------------ 3. the cohort lead */

UPDATE "users"
SET "full_name" = 'Mohammed Imran Sujad', "updated_at" = now()
WHERE "role" = 'admin' AND "full_name" = 'Dr. Anitha Varghese';
