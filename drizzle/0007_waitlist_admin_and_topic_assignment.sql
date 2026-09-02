-- Waitlist: an email address identifies a person as much as a WhatsApp number does.
--
-- The form already refused a second submission from the same number. Someone who mistypes
-- their number on the second attempt still ends up as two rows for one person, which is
-- exactly what the admin list must not fill up with. Existing duplicates are *not* deleted:
-- the older row keeps the address and the newer ones have theirs cleared, so no enquiry is
-- lost and the index can be created.
UPDATE "waitlist_entries" AS w
SET "email" = NULL
WHERE "email" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "waitlist_entries" AS earlier
    WHERE earlier."email" IS NOT NULL
      AND lower(earlier."email") = lower(w."email")
      AND (earlier."created_at", earlier."id") < (w."created_at", w."id")
  );

CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_email_unique"
  ON "waitlist_entries" (lower("email"))
  WHERE "email" IS NOT NULL;

-- When the details behind an entry last changed, so the admin list can tell a fresh enquiry
-- from a correction to an old one.
ALTER TABLE "waitlist_entries"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();

-- Who set today's topic, and how.
--
-- Bulk assignment must not silently replace a topic an admin picked for one student by
-- hand, and that is impossible to honour unless the row remembers where it came from.
-- 'auto' covers both the nightly-style bulk run and the onboarding fallback; 'admin' marks
-- a deliberate individual assignment.
ALTER TABLE "daily_assignments"
  ADD COLUMN IF NOT EXISTS "source" varchar(16) NOT NULL DEFAULT 'auto';
ALTER TABLE "daily_assignments"
  ADD COLUMN IF NOT EXISTS "assigned_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "daily_assignments"
  ADD COLUMN IF NOT EXISTS "assigned_at" timestamptz;

-- The cohort grove rolls trees up per member, filtered by status. The existing index leads
-- with (member_id, date), which cannot serve a count that constrains status instead.
CREATE INDEX IF NOT EXISTS "focus_trees_member_status_idx"
  ON "focus_trees" ("member_id", "status");
