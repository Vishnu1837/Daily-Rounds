-- The Grove: Pomodoro rounds recorded as trees.
--
-- A row is written when a round STARTS, so the commitment exists in the database before the
-- outcome does. `planted_at` and `due_at` are the evidence the server uses to decide whether
-- a tree survived — the browser's own countdown is never trusted.
--
-- Nothing here touches the points ledger. The grove is the intrinsic layer that sits beside
-- scoring; a student cannot farm XP by starting timers.

DO $$ BEGIN
  CREATE TYPE "focus_tree_status" AS ENUM ('growing', 'grown', 'withered');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "focus_tree_species" AS ENUM ('sprout', 'fern', 'neem', 'banyan', 'deodar');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "focus_wither_reason" AS ENUM ('left', 'gave_up', 'abandoned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "focus_trees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "member_id" uuid NOT NULL REFERENCES "cohort_members"("id") ON DELETE cascade,
  "date" date NOT NULL,
  "session_id" uuid REFERENCES "study_sessions"("id") ON DELETE set null,
  "topic_id" uuid REFERENCES "roadmap_topics"("id") ON DELETE set null,
  "preset" varchar(16) DEFAULT 'classic' NOT NULL,
  "focus_minutes" integer NOT NULL,
  "species" "focus_tree_species" NOT NULL,
  "status" "focus_tree_status" DEFAULT 'growing' NOT NULL,
  "wither_reason" "focus_wither_reason",
  "planted_at" timestamptz DEFAULT now() NOT NULL,
  "due_at" timestamptz NOT NULL,
  "settled_at" timestamptz
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "focus_trees_member_date_idx"
  ON "focus_trees" ("member_id", "date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "focus_trees_status_idx"
  ON "focus_trees" ("status");
