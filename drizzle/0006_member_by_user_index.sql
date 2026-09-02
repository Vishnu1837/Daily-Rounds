-- The membership lookup on the authenticated request path.
--
-- `getMemberContext` resolves a signed-in user to their active membership with
-- `where user_id = $1 and status = 'active'`. The only index on the table that mentions
-- `user_id` is `cohort_member_unique (cohort_id, user_id)`, and a composite index cannot
-- serve a predicate that does not constrain its leading column — so this ran as a
-- sequential scan on every page render, every server action and every navigation.

CREATE INDEX IF NOT EXISTS "cohort_member_user_idx" ON "cohort_members" ("user_id");
