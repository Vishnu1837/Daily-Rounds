-- How many times this sitting dropped out of full screen.
--
-- Counted on the server and incremented in place, so the number is the database's and not a
-- client's: the runner posts "I left full screen", never "this is my fifth". Five ends the
-- attempt (`FULLSCREEN_EXIT_LIMIT`), and the invalidated row is kept like every other
-- integrity record — the count is exactly what the cohort lead needs to see.
--
-- Per sitting rather than per student: a fresh attempt starts at nought. It is carried
-- across a focus restart, because the replacement is the same sitting continuing and a
-- restart that reset the allowance would be a way of buying five more exits.
ALTER TABLE "assessment_attempts"
  ADD COLUMN IF NOT EXISTS "fullscreen_exits" integer NOT NULL DEFAULT 0;
