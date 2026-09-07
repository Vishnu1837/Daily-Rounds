-- A hand-marked present is no longer counted as a day the student missed.
--
-- 0014 stopped an admin attendance mark from asserting, on its own, that a student was in
-- the room: `showed_up` now needs the room's own corroboration. That was right, and it is
-- kept. What it did not account for is that `showed_up` is not only the turnout number — it
-- is the predicate behind the streak engine, the missed-day counter and risk. So a student
-- a cohort lead had confirmed was present had their streak broken, the day counted against
-- them, and after three of them the console filed them under "needs intervention".
--
-- On the morning this was found, 7 of the 23 students marked present or late were recorded
-- as not having shown up, and two of them were flagged for intervention off the back of it.
--
-- The third state this column adds is the missing one. A day with an admin mark of present
-- or late but no corroboration is neither a show-up nor a miss: it earns no streak and no
-- consistency, and it breaks nothing. Turnout still counts only what the room verified —
-- the number stays as hard as 0014 made it — but a student is no longer punished for the
-- one thing on this screen they do not control.
--
-- `absent` is deliberately not excused. A lead marking someone absent is evidence, and it
-- should keep counting as a miss.
ALTER TABLE "daily_activity"
  ADD COLUMN IF NOT EXISTS "attendance_excused" boolean NOT NULL DEFAULT false;

-- Backfill from the evidence already on the row: an admin mark of present or late, on a day
-- the derived cache says the student did not show up. `settle_day` recomputes this from
-- source on every write afterwards, so this only has to be right about the past.
UPDATE "daily_activity" da
SET "attendance_excused" = true
WHERE da."showed_up" = false
  AND EXISTS (
    SELECT 1 FROM "attendance" a
    WHERE a."member_id" = da."member_id"
      AND a."date" = da."date"
      AND a."source" = 'admin'
      AND a."status" IN ('present', 'late')
  );
