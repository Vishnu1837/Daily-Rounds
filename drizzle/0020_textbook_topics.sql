-- Textbook topics: a hosted book read one chapter at a time.
--
-- A student handed a 900-page atlas and a scroll bar has been handed a filing problem, not
-- a reading list. What they want to know on a Tuesday evening is which chapter is next and
-- whether they have already done it — and neither question has an answer while the book is
-- one undifferentiated object.
--
-- So a book gains an ordered list of topics. Crucially it does NOT gain copies of itself:
-- the PDF in the bucket stays exactly one object, and a topic is a *page range* into it.
-- The reader already pulls only the byte ranges behind the pages on screen, so opening
-- chapter 12 costs chapter 12 — splitting the file would buy nothing and would mean every
-- re-upload rebuilding twenty-two objects instead of replacing one.
--
-- Ranges are 1-based PHYSICAL page indices, not the numbers printed on the paper: a book
-- with twelve pages of front matter prints "1" on its thirteenth page, and the reader can
-- only address the thirteenth. They may touch or overlap by a page, because a chapter that
-- ends halfway down a page shares that page with the next one.

CREATE TABLE IF NOT EXISTS "textbook_topics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "material_id" uuid NOT NULL REFERENCES "materials"("id") ON DELETE CASCADE,
  -- 1-based, contiguous, and the order the chapters are read in.
  "position" smallint NOT NULL,
  "title" varchar(200) NOT NULL,
  "start_page" integer NOT NULL,
  "end_page" integer NOT NULL,
  -- Optional link to the curriculum branch this chapter covers, so a roadmap topic can open
  -- the pages that teach it. Null until somebody files it.
  "curriculum_ref" varchar(200),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "textbook_topics_pages_sane" CHECK ("start_page" >= 1 AND "end_page" >= "start_page"),
  CONSTRAINT "textbook_topics_position_sane" CHECK ("position" >= 1)
);

DO $$ BEGIN
  ALTER TABLE "textbook_topics"
    ADD CONSTRAINT "textbook_topics_material_position_key" UNIQUE ("material_id", "position");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "textbook_topics_material_idx"
  ON "textbook_topics" ("material_id", "position");

-- Whether one student has read one chapter. The row IS the answer: it exists when the topic
-- is studied and is deleted when they take the mark back, so "studied" is a toggle a
-- student can be honest with rather than a flag they regret setting.
--
-- Deliberately not a behaviour event and not a points event. The consistency denominator is
-- the set of things a cohort asks of everyone every day; reading a textbook chapter is
-- optional, and counting it would score a student who never opens the library as having
-- missed part of their day. See the same reasoning in 0018_flashcards.sql.
CREATE TABLE IF NOT EXISTS "textbook_topic_progress" (
  "member_id" uuid NOT NULL REFERENCES "cohort_members"("id") ON DELETE CASCADE,
  "topic_id" uuid NOT NULL REFERENCES "textbook_topics"("id") ON DELETE CASCADE,
  "studied_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("member_id", "topic_id")
);

CREATE INDEX IF NOT EXISTS "textbook_topic_progress_member_idx"
  ON "textbook_topic_progress" ("member_id");
