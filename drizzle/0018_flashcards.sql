-- Flashcards: spaced recall, filed against the curriculum.
--
-- The product could already ask a student whether they showed up and whether they got a
-- knowledge check right. It had nothing that asked whether they still *remember* the thing
-- they studied eleven days ago — which is the only question an exam actually asks. A quiz
-- is a snapshot taken once; a deck is the same twenty-four facts coming back at widening
-- intervals until they stop being difficult.
--
-- Decks are cohort content and reach students by curriculum branch, exactly as quizzes do.
-- Everything personal lives in `flashcard_progress`, one row per student per card.

-- `flashcard_session` joins the points ledger. It is deliberately NOT a behaviour event:
-- the consistency denominator is the set of things a cohort asks for every day, and adding
-- an optional revision tool to it would mark every student who did not open a deck as
-- having missed part of their day.
ALTER TYPE "point_event" ADD VALUE IF NOT EXISTS 'flashcard_session';

DO $$ BEGIN
  CREATE TYPE "flashcard_type" AS ENUM (
    'definition', 'question', 'cloze', 'multiple_choice', 'true_false', 'image', 'concept'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "flashcard_grade" AS ENUM ('again', 'hard', 'good', 'easy');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "flashcard_mastery" AS ENUM ('new', 'learning', 'difficult', 'mastered');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "flashcard_decks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "subject_id" uuid REFERENCES "subjects"("id") ON DELETE SET NULL,
  "curriculum_ref" varchar(200),
  "title" varchar(160) NOT NULL,
  "description" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "flashcard_decks_curriculum_ref_idx"
  ON "flashcard_decks" ("curriculum_ref");

CREATE TABLE IF NOT EXISTS "flashcards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deck_id" uuid NOT NULL REFERENCES "flashcard_decks"("id") ON DELETE CASCADE,
  "type" "flashcard_type" NOT NULL DEFAULT 'definition',
  "position" smallint NOT NULL DEFAULT 0,
  "front" text NOT NULL,
  "back" text NOT NULL,
  "explanation" text,
  "image_url" text,
  "options" jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Nullable on purpose: a default of 0 would silently make the first option correct on a
  -- card whose author never marked one, which is a wrong card that nobody can see is wrong.
  "correct_option" smallint,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "flashcards_deck_idx" ON "flashcards" ("deck_id", "position");

CREATE TABLE IF NOT EXISTS "flashcard_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "member_id" uuid NOT NULL REFERENCES "cohort_members"("id") ON DELETE CASCADE,
  "deck_id" uuid NOT NULL REFERENCES "flashcard_decks"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "reviewed" smallint NOT NULL,
  "correct" smallint NOT NULL,
  "best_streak" smallint NOT NULL DEFAULT 0,
  "completed" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "flashcard_sessions_member_idx"
  ON "flashcard_sessions" ("member_id", "date");

-- A cache of derived state, in keeping with the architectural rule: every column here is
-- recomputable by folding `flashcard_reviews` through the scheduler in
-- src/lib/domain/flashcards.ts. It exists so the deck list can read a mastery mix in one
-- indexed query rather than replaying a history per card.
CREATE TABLE IF NOT EXISTS "flashcard_progress" (
  "member_id" uuid NOT NULL REFERENCES "cohort_members"("id") ON DELETE CASCADE,
  "card_id" uuid NOT NULL REFERENCES "flashcards"("id") ON DELETE CASCADE,
  "mastery" "flashcard_mastery" NOT NULL DEFAULT 'new',
  "streak" smallint NOT NULL DEFAULT 0,
  "reps" smallint NOT NULL DEFAULT 0,
  "lapses" smallint NOT NULL DEFAULT 0,
  "interval_days" smallint NOT NULL DEFAULT 0,
  "last_grade" "flashcard_grade",
  "last_reviewed_at" timestamptz,
  "next_review_at" timestamptz,
  PRIMARY KEY ("member_id", "card_id")
);

CREATE INDEX IF NOT EXISTS "flashcard_progress_due_idx"
  ON "flashcard_progress" ("member_id", "next_review_at");

-- The source the table above caches. Append-only.
CREATE TABLE IF NOT EXISTS "flashcard_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "member_id" uuid NOT NULL REFERENCES "cohort_members"("id") ON DELETE CASCADE,
  "card_id" uuid NOT NULL REFERENCES "flashcards"("id") ON DELETE CASCADE,
  "session_id" uuid REFERENCES "flashcard_sessions"("id") ON DELETE CASCADE,
  "grade" "flashcard_grade" NOT NULL,
  "occurred_on" date NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "flashcard_reviews_member_idx"
  ON "flashcard_reviews" ("member_id", "occurred_on");
