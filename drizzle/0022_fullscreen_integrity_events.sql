-- Two integrity events for the full-screen lock.
--
-- An assessment now runs in full screen, and leaving it is a thing that happens *to the
-- attempt* rather than to the tab: `visibilitychange` cannot see a student who drops out of
-- full screen and reads a browser window beside the paper, because the tab never goes
-- hidden. So the exits are counted in their own right — `fullscreen_exited` for each one,
-- `fullscreen_invalidated` for the fifth, which ends the sitting.
--
-- Alone in its own migration because a new enum value may not be used inside the same
-- transaction that adds it, and the migration runner sends each file as one batch. See
-- 0013 for the same constraint.
ALTER TYPE "assessment_integrity_event" ADD VALUE IF NOT EXISTS 'fullscreen_exited';
ALTER TYPE "assessment_integrity_event" ADD VALUE IF NOT EXISTS 'fullscreen_invalidated';
