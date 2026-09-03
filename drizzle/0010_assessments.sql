-- The assessment engine.
--
-- Deliberately separate from `quizzes`, which stay what they have always been: a short,
-- optional, untimed knowledge check attached to a curriculum branch that a student may take
-- as often as they like. An assessment is the graded thing — a clock, a pass mark, an
-- attempt history, an integrity log and a private result. Folding the two together would
-- have given every existing quiz a timer and a permanent record overnight.

DO $$ BEGIN
  CREATE TYPE "assessment_status" AS ENUM ('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "assessment_question_type" AS ENUM ('mcq', 'image_mcq', 'short_answer', 'long_answer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "assessment_attempt_status" AS ENUM ('in_progress', 'submitted', 'expired', 'invalidated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "assessment_review_status" AS ENUM ('auto', 'pending', 'reviewed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "assessment_integrity_event" AS ENUM ('focus_lost', 'focus_returned', 'threshold_breached', 'restarted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "assessments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "cohort_id" uuid NOT NULL REFERENCES "cohorts"("id") ON DELETE CASCADE,
  "subject_id" uuid REFERENCES "subjects"("id") ON DELETE SET NULL,
  "curriculum_ref" varchar(200),
  "title" varchar(200) NOT NULL,
  "instructions" text,
  "status" "assessment_status" NOT NULL DEFAULT 'draft',
  "total_time_seconds" integer,
  "default_question_seconds" integer NOT NULL DEFAULT 60,
  -- The brief's default focus-loss grace period. Configurable because this is a deterrent,
  -- not proctoring: it cannot tell a second device from a notification shade.
  "focus_grace_seconds" integer NOT NULL DEFAULT 5,
  "pass_mark_pct" smallint NOT NULL DEFAULT 60,
  "allow_answer_review" boolean NOT NULL DEFAULT true,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "published_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "assessments_cohort_idx" ON "assessments" ("cohort_id", "status");
CREATE INDEX IF NOT EXISTS "assessments_curriculum_ref_idx" ON "assessments" ("curriculum_ref");

CREATE TABLE IF NOT EXISTS "assessment_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "assessment_id" uuid NOT NULL REFERENCES "assessments"("id") ON DELETE CASCADE,
  "position" integer NOT NULL DEFAULT 0,
  "type" "assessment_question_type" NOT NULL DEFAULT 'mcq',
  "prompt" text NOT NULL,
  "image_url" text,
  "options" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "correct_index" smallint,
  -- The model answer an admin reads while marking. Never auto-compared against what the
  -- student wrote; their exact text is preserved on the answer row.
  "reference_answer" text,
  "explanation" text,
  "time_limit_seconds" integer,
  "points" smallint NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS "assessment_questions_assessment_idx"
  ON "assessment_questions" ("assessment_id", "position");

-- Attempts are never deleted, including the ones a restart invalidated: the restart history
-- is the evidence the admin is meant to see, and erasing it would destroy the audit trail
-- the integrity rules exist to produce.
CREATE TABLE IF NOT EXISTS "assessment_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "assessment_id" uuid NOT NULL REFERENCES "assessments"("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "cohort_members"("id") ON DELETE CASCADE,
  "attempt_number" integer NOT NULL DEFAULT 1,
  "status" "assessment_attempt_status" NOT NULL DEFAULT 'in_progress',
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz,
  "submitted_at" timestamptz,
  "restart_count" integer NOT NULL DEFAULT 0,
  "auto_score" integer NOT NULL DEFAULT 0,
  "auto_total" integer NOT NULL DEFAULT 0,
  "manual_score" integer NOT NULL DEFAULT 0,
  "manual_total" integer NOT NULL DEFAULT 0,
  "review_status" "assessment_review_status" NOT NULL DEFAULT 'auto',
  "reviewed_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamptz,
  "feedback" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "assessment_attempt_unique"
  ON "assessment_attempts" ("assessment_id", "member_id", "attempt_number");
CREATE INDEX IF NOT EXISTS "assessment_attempts_member_idx"
  ON "assessment_attempts" ("member_id");
CREATE INDEX IF NOT EXISTS "assessment_attempts_assessment_idx"
  ON "assessment_attempts" ("assessment_id", "status");

CREATE TABLE IF NOT EXISTS "assessment_answers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "attempt_id" uuid NOT NULL REFERENCES "assessment_attempts"("id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "assessment_questions"("id") ON DELETE CASCADE,
  "selected_index" smallint,
  "text_answer" text,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "answered_at" timestamptz,
  "expired" boolean NOT NULL DEFAULT false,
  "is_correct" boolean,
  "awarded_points" smallint NOT NULL DEFAULT 0,
  "reviewer_note" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "assessment_answer_unique"
  ON "assessment_answers" ("attempt_id", "question_id");

-- Behaviour is logged, not judged. Page-visibility detection cannot prove a student was not
-- reading a second device, so the only automatic consequence is the restart the threshold
-- triggers; everything else is here for a human to read.
CREATE TABLE IF NOT EXISTS "assessment_integrity_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "attempt_id" uuid NOT NULL REFERENCES "assessment_attempts"("id") ON DELETE CASCADE,
  "kind" "assessment_integrity_event" NOT NULL,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "away_ms" integer,
  "detail" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS "assessment_integrity_attempt_idx"
  ON "assessment_integrity_events" ("attempt_id", "occurred_at");
