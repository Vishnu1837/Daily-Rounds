-- Covers, a place to keep a key, and a chapter list that is not yet a chapter list.
--
-- Three changes that belong to one story: a shelf of textbooks a student can recognise by
-- sight, and an admin who no longer has to type twenty-two page ranges by hand.
--
-- 1. A material may name a cover image. It lives in the same private bucket as the book and
--    is read through the same membership-checked route, because a cohort's reading list is
--    theirs — the cover of a book is a small thing to leak, but it is still a leak, and
--    making it public would mean a second storage story for no gain.
--
-- 2. A textbook may have a DRAFT chapter list: what a model proposed, waiting for a person
--    to agree with it. Deliberately a different table from `textbook_topics` rather than a
--    status column on it, because the published list is what students read and what their
--    progress rows point at. A draft must be editable, re-generatable and throw-away-able
--    without a single student's "studied" mark noticing; the only moment the two meet is
--    the publish, which goes through the same validated path a hand-typed list does.
--
-- 3. A tiny key-value table for settings that belong to the deployment rather than to a
--    cohort — today just the Gemini API key, entered in the admin UI so the person running
--    this does not need a redeploy to change a key.

ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "cover_key" text;

-- One draft per book: generating again replaces the proposal rather than piling up
-- alternatives nobody asked to choose between.
CREATE TABLE IF NOT EXISTS "textbook_chapter_drafts" (
  "material_id" uuid PRIMARY KEY REFERENCES "materials"("id") ON DELETE CASCADE,
  -- The proposed chapters, in the same shape the editor and the save action already speak:
  -- [{ position, title, startPage, endPage, curriculumRef }]. JSON rather than rows because
  -- a draft is reviewed and replaced whole, never queried into.
  "plan" jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Which model proposed it, so a list that reads oddly can be traced to the thing that
  -- wrote it after the model has moved on.
  "model" varchar(80),
  -- 'gemini' when a model wrote it, 'outline' when it came from the PDF's own bookmarks.
  "source" varchar(20) NOT NULL DEFAULT 'gemini',
  -- What the model said about its own confidence, shown to the reviewing admin verbatim.
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "app_settings" (
  "key" varchar(60) PRIMARY KEY,
  "value" text NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL
);
