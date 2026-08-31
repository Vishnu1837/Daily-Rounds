-- Backfills the subject catalogue to the full 19-subject MBBS course.
--
-- The catalogue used to hold the 12 subjects we had written roadmaps for. It is now derived
-- from the curriculum tree in src/lib/curriculum, which covers the whole course, so every
-- database needs the missing subjects before a student can choose one.
--
-- Additive on purpose: a subject already present keeps its row and its id, so existing
-- roadmaps, goals, quizzes and materials are untouched.
INSERT INTO "subjects" ("name", "slug", "accent") VALUES
  ('Anatomy', 'anatomy', 'rose'),
  ('Physiology', 'physiology', 'sky'),
  ('Biochemistry', 'biochemistry', 'amber'),
  ('Pathology', 'pathology', 'violet'),
  ('Pharmacology', 'pharmacology', 'emerald'),
  ('Microbiology', 'microbiology', 'teal'),
  ('Forensic Medicine', 'forensic-medicine', 'slate'),
  ('Community Medicine', 'community-medicine', 'lime'),
  ('Ophthalmology', 'ophthalmology', 'cyan'),
  ('ENT', 'ent', 'teal'),
  ('General Medicine', 'general-medicine', 'indigo'),
  ('General Surgery', 'general-surgery', 'orange'),
  ('Obstetrics & Gynaecology', 'obgyn', 'fuchsia'),
  ('Paediatrics', 'paediatrics', 'cyan'),
  ('Orthopaedics', 'orthopaedics', 'orange'),
  ('Dermatology', 'dermatology', 'rose'),
  ('Psychiatry', 'psychiatry', 'violet'),
  ('Anaesthesiology', 'anaesthesiology', 'sky'),
  ('Radiodiagnosis', 'radiodiagnosis', 'slate')
ON CONFLICT ("slug") DO NOTHING;
