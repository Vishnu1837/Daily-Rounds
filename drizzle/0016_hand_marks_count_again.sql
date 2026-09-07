-- A cohort lead's attendance mark counts as showing up again.
--
-- 0014 required the study room to corroborate an admin mark before it could assert that a
-- student turned up, and 0015 stopped the uncorroborated ones counting as misses. Both were
-- answers to a real exposure: attendance is the one behaviour a lead can grant to the whole
-- cohort in a single click, and it is worth more points than any other.
--
-- The exposure is real and the remedy was wrong for how this cohort is actually run. The
-- lead is in the room and the software is not; nobody uses the study-room join button, so
-- every mark is a hand mark, and a turnout figure that discounts all of them reports 68% on
-- a morning 23 of 25 students were present. That is not a strict number, it is a number
-- about something else.
--
-- So the mark is trusted, and the exposure is handled by making it visible instead of by
-- refusing it. `hand_marked_only` — this is `attendance_excused` renamed, because its
-- meaning has inverted — flags the days whose show-up rests on a mark and nothing else, and
-- the admin console reports the verified count alongside the headline. `attendance.source`
-- still records who made every mark. A number that can be inflated and shows you when it
-- has been beats one nobody trusts.
ALTER TABLE "daily_activity" RENAME COLUMN "attendance_excused" TO "hand_marked_only";

-- Re-derive `showed_up` under the restored rule: any behaviour award on the day, whoever
-- caused it. `settle_day` computes exactly this from now on, so the two cannot drift.
UPDATE "daily_activity" da
SET "showed_up" = true
WHERE da."showed_up" = false
  AND EXISTS (
    SELECT 1 FROM "points_ledger" p
    WHERE p."member_id" = da."member_id"
      AND p."occurred_on" = da."date"
      AND p."points" > 0
      AND p."event" IN (
        'live_session_present', 'live_session_late', 'study_block_completed',
        'daily_target_completed', 'daily_check_in', 'tomorrow_plan', 'reflection'
      )
  );

-- And re-derive the flag itself: a show-up with no presence row behind it whose only
-- behaviour award is an attendance one.
UPDATE "daily_activity" da
SET "hand_marked_only" = (
  da."showed_up"
  AND NOT EXISTS (
    SELECT 1 FROM "study_room_presence" p
    WHERE p."member_id" = da."member_id" AND p."date" = da."date"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "points_ledger" p
    WHERE p."member_id" = da."member_id"
      AND p."occurred_on" = da."date"
      AND p."points" > 0
      AND p."event" IN (
        'study_block_completed', 'daily_target_completed',
        'daily_check_in', 'tomorrow_plan', 'reflection'
      )
  )
  AND EXISTS (
    SELECT 1 FROM "points_ledger" p
    WHERE p."member_id" = da."member_id"
      AND p."occurred_on" = da."date"
      AND p."points" > 0
      AND p."event" IN ('live_session_present', 'live_session_late')
  )
);
