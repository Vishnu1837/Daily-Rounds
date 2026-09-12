-- Three things an assessment could not say before this migration.
--
--  1. *How* it is timed. The engine has always run both clocks at once — a per-question
--     allowance and an optional cap on the whole paper — which is right for a rapid-fire
--     recall drill and wrong for a mock exam, where one clock over ninety minutes is the
--     whole point and a per-question timer that snatches a question away mid-thought is an
--     exam nobody sits. `timer_mode` lets the admin pick, instead of the schema picking.
--
--  2. What a student thought of a question while they were on it. Marking one for review
--     and coming back is how every real test platform works, and it needs a flag that
--     survives navigating away, a reload, and a laptop dying.
--
--  3. Who it is for. Publishing has been all-or-nothing: the moment an assessment goes
--     live, every student in the cohort sees it. There has been no way to put a finished
--     paper in front of one test account, look at it end to end, and then open it up.

DO $$ BEGIN
  CREATE TYPE "assessment_timer_mode" AS ENUM ('per_question', 'whole_paper');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "assessment_audience" AS ENUM ('everyone', 'selected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 'per_question' for everything that already exists, which is exactly what those papers
-- have been doing. An assessment carrying a total limit is *not* migrated to 'whole_paper':
-- its per-question timers are real and students have sat it under them, so changing the
-- rules of a live paper underneath an admin who never asked would be the wrong default.
ALTER TABLE "assessments"
  ADD COLUMN IF NOT EXISTS "timer_mode" "assessment_timer_mode" NOT NULL DEFAULT 'per_question';

ALTER TABLE "assessments"
  ADD COLUMN IF NOT EXISTS "audience" "assessment_audience" NOT NULL DEFAULT 'everyone';

-- Survives the page, the reload and the dead battery, because the palette a student is
-- steering by has to agree with itself after all three.
ALTER TABLE "assessment_answers"
  ADD COLUMN IF NOT EXISTS "marked_for_review" boolean NOT NULL DEFAULT false;

-- The explicit list, read only when `audience` = 'selected'.
--
-- Rows are kept when the assessment goes back to 'everyone' rather than deleted, so the
-- try-it-on-a-test-account-then-open-it-up cycle is reversible: an admin who opens a paper
-- up and then wants it narrow again gets their list back instead of rebuilding it.
CREATE TABLE IF NOT EXISTS "assessment_audience_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "assessment_id" uuid NOT NULL REFERENCES "assessments"("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "cohort_members"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "assessment_audience_unique"
  ON "assessment_audience_members" ("assessment_id", "member_id");

-- The hot read: "is this assessment for me", once per student per assessment list.
CREATE INDEX IF NOT EXISTS "assessment_audience_member_idx"
  ON "assessment_audience_members" ("member_id");
