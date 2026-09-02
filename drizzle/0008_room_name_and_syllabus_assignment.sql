-- What the study room is called.
--
-- The name was a string literal in the home screen, so a cohort that moved its room to the
-- evening was still told to attend the "Morning Study Room". Null keeps the derived name —
-- morning, afternoon, evening or night, read off the start time as the student's own
-- timezone renders it — and a value set here overrides it outright.
ALTER TABLE "cohorts"
  ADD COLUMN IF NOT EXISTS "meet_title" varchar(120);

-- Today's topic, taken straight from the syllabus.
--
-- A member has at most two roadmaps (the primary/secondary slots), but an admin may point
-- any student at any topic in the whole curriculum. Where the subject is one of the
-- student's two, the topic is materialised on that roadmap and `topic_id` still carries it.
-- Where it is not, there is no roadmap row to point at, and the day's topic is recorded
-- here instead: the title, the curriculum ref that quizzes and materials attach through,
-- and the subject name to label it with.
ALTER TABLE "daily_assignments"
  ADD COLUMN IF NOT EXISTS "custom_topic_title" varchar(200);
ALTER TABLE "daily_assignments"
  ADD COLUMN IF NOT EXISTS "custom_topic_ref" varchar(200);
ALTER TABLE "daily_assignments"
  ADD COLUMN IF NOT EXISTS "custom_subject_name" varchar(120);
