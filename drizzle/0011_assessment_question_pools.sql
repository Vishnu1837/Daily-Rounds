-- Question banks: one assessment, many more questions than any one student sits.
--
-- Until now a paper *was* its question list — every attempt served all of it, in order. That
-- is right for a fifteen-question topic check and wrong for a five-hundred-question bank,
-- where the point is that two sittings differ and that a student meets questions they have
-- not seen before. So the paper a student sits becomes a thing of its own: drawn at the
-- moment the attempt opens, recorded, and never re-drawn for that attempt.
--
-- `questions_per_attempt` NULL keeps the old behaviour exactly — serve the whole list — so
-- every assessment that exists today is unaffected.
ALTER TABLE "assessments"
  ADD COLUMN IF NOT EXISTS "questions_per_attempt" integer;

-- The drawn paper.
--
-- Written once per attempt, inside the same transaction that creates it, and read by
-- everything downstream: the runtime, the grader, the result, the admin's review. It is
-- also the record of what this student has already been shown — the unseen-first draw reads
-- its own history back out of here — which is why the rows outlive the attempt's grading and
-- are kept even for the sittings a restart invalidated. A question they saw is a question
-- they saw.
CREATE TABLE IF NOT EXISTS "assessment_attempt_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "attempt_id" uuid NOT NULL REFERENCES "assessment_attempts"("id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "assessment_questions"("id") ON DELETE CASCADE,
  -- Order on this student's paper, which has nothing to do with the question's position in
  -- the bank.
  "position" integer NOT NULL DEFAULT 0,
  -- False when the draw had to reach back into questions this student had already met,
  -- because the unseen pool was too small to fill the window. Recorded rather than shown:
  -- the admin can see why a paper repeated, and the student cannot tell which ones did.
  "fresh" boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS "assessment_attempt_question_unique"
  ON "assessment_attempt_questions" ("attempt_id", "question_id");
CREATE INDEX IF NOT EXISTS "assessment_attempt_questions_paper_idx"
  ON "assessment_attempt_questions" ("attempt_id", "position");
CREATE INDEX IF NOT EXISTS "assessment_attempt_questions_question_idx"
  ON "assessment_attempt_questions" ("question_id");
