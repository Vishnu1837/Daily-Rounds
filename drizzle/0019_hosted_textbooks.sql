-- Hosted textbooks: a material can be a file in our own private bucket, not only a link.
--
-- Everything in the library until now was an external URL, and anything behind a URL is as
-- private as whoever holds it. The cohort's textbooks are the one thing that must not
-- travel: they are read inside the app, by active members, and never handed out as a file.
--
-- So a hosted textbook has no URL at all. It has a `storage_key` — the object's name in a
-- bucket that is not public — and the app streams it, a page's worth at a time, to a
-- signed-in member of the cohort it belongs to. A material is exactly one of the two.

ALTER TABLE "materials" ALTER COLUMN "url" DROP NOT NULL;
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "storage_key" text;
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "size_bytes" bigint;

DO $$ BEGIN
  ALTER TABLE "materials"
    ADD CONSTRAINT "materials_link_or_file"
    CHECK (("url" IS NULL) <> ("storage_key" IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
