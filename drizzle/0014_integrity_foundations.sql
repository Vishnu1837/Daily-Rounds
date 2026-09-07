-- Three repairs to things the app was recording wrongly, and one new table so the work that
-- fixes them is visible when it runs.

-- ---------------------------------------------------------------- study sessions
--
-- Nothing but the student pressing Finish ever ended a study block. A closed laptop left the
-- row `running` indefinitely, and every read that summed `elapsed_seconds` inherited the
-- arithmetic — the audit found 32 paused and 8 running blocks, and one student credited with
-- 1,173 study minutes and not a single completed focus round.
--
-- The sweep now closes them. These two columns are what keep that from being a silent
-- rewrite of history: `auto_closed_at` says the server ended the block rather than the
-- student, and `raw_elapsed_seconds` preserves whatever the row said before a cap was
-- applied, so a correction can always be inspected and, if it was wrong, undone.
ALTER TABLE "study_sessions"
  ADD COLUMN IF NOT EXISTS "auto_closed_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "raw_elapsed_seconds" integer;

-- The sweep's own predicate: unfinished blocks, oldest first. Without it the scheduled sweep
-- scans every session row the cohort has ever written.
CREATE INDEX IF NOT EXISTS "study_sessions_open_idx"
  ON "study_sessions" ("status", "started_at")
  WHERE "status" IN ('running', 'paused');

-- ------------------------------------------------------------------- attendance
--
-- `attendance` could not tell you where a mark came from. A student who joined the study
-- room and a cohort lead who ticked the whole column in one click wrote the identical row,
-- which is why a bulk mark could hand 26 people a scoring day on a morning one person
-- attended — and why the leaderboard was not defensible to the students on it.
--
-- `source` separates the two at the point of writing. `verified` is the student's own join,
-- corroborated by a `study_room_presence` row their client wrote. `admin` is a human
-- overrule, which now carries a mandatory reason.
--
-- Existing rows are backfilled below rather than defaulted, because guessing would destroy
-- the only evidence there is about how they were made.
DO $$ BEGIN
  CREATE TYPE "attendance_source" AS ENUM ('verified', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "attendance"
  ADD COLUMN IF NOT EXISTS "source" "attendance_source",
  ADD COLUMN IF NOT EXISTS "override_reason" text;

-- Backfill from the evidence each row already carries: a note written by the join path, or a
-- presence row for the same member-day that only the student's own client could have made.
UPDATE "attendance" a
SET "source" = 'verified'
WHERE a."source" IS NULL
  AND (
    a."note" = 'Joined the study room'
    OR EXISTS (
      SELECT 1 FROM "study_room_presence" p
      WHERE p."member_id" = a."member_id" AND p."date" = a."date"
    )
  );

-- Everything left is a mark somebody made by hand. Saying so is not a judgement on it; it is
-- the distinction the leaderboard needs in order to be explainable.
UPDATE "attendance"
SET "source" = 'admin'
WHERE "source" IS NULL;

ALTER TABLE "attendance"
  ALTER COLUMN "source" SET DEFAULT 'admin',
  ALTER COLUMN "source" SET NOT NULL;

-- -------------------------------------------------------------------- sweep runs
--
-- Background work that nobody can see is background work nobody can trust. The audit found
-- three trees that had been "growing" for three days, and the reason was not that the sweep
-- was broken — it was that no sweep was ever scheduled, and nothing in the product could
-- have told anyone that.
--
-- One row per attempt, successful or not. The admin system screen reads the newest, so
-- "last successful sweep" and "what it touched" are answerable without a log search.
CREATE TABLE IF NOT EXISTS "sweep_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which sweep: 'overdue_trees', 'stale_sessions', or 'all' for a full pass.
  "kind" varchar(32) NOT NULL,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz,
  -- NULL until the run finishes. A row with a NULL outcome is a run that died mid-flight,
  -- which is itself the signal worth seeing.
  "ok" boolean,
  -- What it changed, per sweep, e.g. {"trees_grown": 4, "sessions_closed": 2}.
  "affected" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error" text
);

CREATE INDEX IF NOT EXISTS "sweep_runs_started_idx" ON "sweep_runs" ("started_at" DESC);

-- ------------------------------------------------------------------ point rules
--
-- `point_rules` implied a control it never had. `streak_bonus` and `achievement` had rows
-- there — 0 and 25 — and neither value was ever read: streak bonuses come from a fixed
-- ladder in `milestoneBonusPoints()` and achievement awards from `achievementPoints(tier)`,
-- which pays 10, 25 or 50. So the configuration said one thing and the ledger did another,
-- and the settings screen offered an editable Achievement field that changed nothing at all.
--
-- The values are now computed in one place and documented as such (`COMPUTED_POINT_EVENTS`),
-- and the admin screen explains them instead of pretending to set them. Removing the rows is
-- what stops the table itself from carrying the old claim.
--
-- Nothing in the ledger is touched. Awards already made keep the value they were paid at, as
-- every correction in this system does — the rows deleted here were never read to make one.
DELETE FROM "point_rules"
WHERE "event" IN ('streak_bonus', 'achievement', 'admin_adjustment');
