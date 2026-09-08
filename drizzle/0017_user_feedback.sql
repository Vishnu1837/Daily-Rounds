-- A way for a student to say the app is broken, and a place for that to land.
--
-- Until now every channel out of the product pointed at a cohort lead's WhatsApp, which
-- means a bug report is a message in a thread that also carries attendance chasing, exam
-- dates and someone's leave request. Reports that arrive that way are not triaged, they are
-- scrolled past — and the ones that never arrive at all are from the students least likely
-- to message a lead unprompted, which is exactly the group whose problems nobody hears.
--
-- So the ask goes to the student instead of waiting for them: one prompt, once, then it
-- lives in the notification bell until they answer it or the round ends.

CREATE TABLE IF NOT EXISTS "feedback_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  -- All three references are ON DELETE SET NULL rather than CASCADE. A report is about the
  -- software, not about the person: it stays readable and actionable after they leave the
  -- cohort or their account goes, and only the attribution is lost.
  "cohort_id" uuid REFERENCES "cohorts"("id") ON DELETE SET NULL,
  "member_id" uuid REFERENCES "cohort_members"("id") ON DELETE SET NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "prompt_key" varchar(60) NOT NULL,
  "issues" text NOT NULL DEFAULT '',
  "suggestions" text NOT NULL DEFAULT '',
  "resolved_at" timestamptz,
  "resolved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "feedback_submissions_cohort_idx"
  ON "feedback_submissions" ("cohort_id", "created_at");

-- The student-side predicate: "has this person answered this round?". It runs on every page
-- of the student app, because the notification bell is in the header on every page.
CREATE INDEX IF NOT EXISTS "feedback_submissions_member_prompt_idx"
  ON "feedback_submissions" ("member_id", "prompt_key");

-- Screenshots live in the column, not in a bucket.
--
-- The deployment has no object storage, and adding one for this would mean a vendor, a
-- secret, and a second delete path that can drift out of step with the row it belongs to.
-- These images are small, few per report, and meant to be discarded once the bug is fixed —
-- a `bytea` deletes with its parent and needs nothing to be true about a bucket somewhere.
--
-- The cost is that a careless `SELECT *` drags megabytes over the wire, so no query outside
-- the route that actually serves a picture names the `data` column.
CREATE TABLE IF NOT EXISTS "feedback_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid NOT NULL REFERENCES "feedback_submissions"("id") ON DELETE CASCADE,
  "mime_type" varchar(60) NOT NULL,
  -- Kept alongside the bytes so a listing can show a size without reading the image itself.
  "byte_size" integer NOT NULL,
  "data" bytea NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "feedback_attachments_submission_idx"
  ON "feedback_attachments" ("submission_id");

-- "I have seen this prompt and closed it", which is not the same as having answered it.
--
-- Dismissing takes the modal off the student's screen; answering takes the whole thing out
-- of their notification bell. With only one of the two states recorded the popup would
-- either return on every page load until the form was filled in, or disappear for good the
-- first time it was closed — the first is nagging and the second loses the request.
CREATE TABLE IF NOT EXISTS "feedback_prompt_dismissals" (
  "member_id" uuid NOT NULL REFERENCES "cohort_members"("id") ON DELETE CASCADE,
  "prompt_key" varchar(60) NOT NULL,
  "dismissed_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("member_id", "prompt_key")
);
