# The curriculum

Daily Rounds carries the whole MBBS course as data: **4 phases → 19 subjects → 138 sections
→ 445 topics → 2,042 detail nodes**, aligned to the revised NMC Competency Based Medical
Education curriculum dated 12 September 2024.

Everything subject-shaped in the product is derived from this one tree — the subject
catalogue, the roadmap templates, and the syllabus browser. There is no second list of
subjects to keep in step.

---

## The node model

```
Phase          Phase I · First Professional MBBS
 └ Subject     01. Anatomy
    └ Section  Upper Limb
       └ Topic Pectoral Region & Axilla
          └ Node  Pectoralis major · Clavipectoral fascia · Brachial plexus — roots · …
```

A **detail node is a syllabus label, not explanatory content**. It tells a student what a
topic contains so they can decide what to study today; it is never a substitute for a
textbook. That constraint is what keeps the tree honest at 2,000 nodes.

Every level above a node is addressable by slug (`anatomy`, `anatomy/upper-limb`), so a
search hit, a deep link and a roadmap topic can all point at the same place.

---

## Where it lives

| File                          | Contents                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `src/lib/curriculum/data.ts`  | The tree. **Generated — never edit by hand.**                                 |
| `src/lib/curriculum/types.ts` | The node model, and the subject-slug union derived from it                    |
| `src/lib/curriculum/index.ts` | Lookups: `curriculumSubject`, `curriculumSection`, `searchCurriculum`, counts |
| `tools/curriculum/`           | The source text and the two scripts that regenerate `data.ts`                 |

### Regenerating

The source of truth is the authored roadmap document, extracted to
`tools/curriculum/roadmap-source.txt` as one arrow-separated line per topic:

```
Anatomy  →  Upper Limb  →  Pectoral Region & Axilla  →  Pectoral fascia  →  Pectoralis major  →  …
```

```bash
cd tools/curriculum && python parse.py && python gen.py && cp data.ts ../../src/lib/curriculum/data.ts
```

`parse.py` asserts that slugs are unique at every level and that no branch is empty, so a
malformed edit to the source fails loudly rather than silently dropping a subject. The tests
in `tests/curriculum.test.ts` re-check the same invariants against the committed output.

---

## What is derived from it

**The subject catalogue** (`src/lib/subjects.ts`) is a projection of the tree: 19 subjects in
course order, each carrying the phase it is taught in. `drizzle/0001_curriculum_subjects.sql`
backfills them into any existing database, additively — a subject that already has a row
keeps its id, so existing roadmaps, goals, quizzes and materials are untouched.

**Roadmap templates** (`src/lib/roadmap-templates.ts`) come from two sources with one shape:

- _Curated_ — the hand-built exam-prep plans, grouped the way a cohort lead teaches them.
- _Curriculum_ — one template per section, keyed `<subject>:<section>`. Each curriculum topic
  becomes a week and its detail nodes become that week's roadmap topics, which is what turns
  a syllabus into day-sized study items. Every subject in the course has one.

`templateForSubject()` prefers a curated plan when one exists and falls back to the subject's
first curriculum section, so onboarding can always build a real roadmap on day one.

**Quizzes and materials** are filed against a curriculum ref rather than against a topic
title, which is what makes cohort content reusable: write a quiz once for
`pathology/general-pathology/inflammation` and every student whose roadmap touches that
branch is offered it, whatever their template called the topic.

The ref lives on three tables — `roadmap_topics.curriculum_ref`, `quizzes.curriculum_ref` and
`materials.curriculum_ref` — and a roadmap topic gets one when its template is applied.
Matching is by _branch_, not equality, because the three do not sit at the same depth: a quiz
is usually written for a topic, a reading list is often useful for a whole section, and a
roadmap topic sits at whichever grain its template used.

```
quiz filed at    pathology/general-pathology/inflammation
roadmap topic at pathology/general-pathology            → matched (quiz is below it)
roadmap topic at pathology/general-pathology/neoplasia  → not matched (different branch)
```

`bestRefMatch` picks the closest candidate when several apply: the exact ref, then the
nearest ancestor, then the shallowest descendant. A material with no ref is a general cohort
material; a quiz with no ref is simply not offered until someone files it.

**The syllabus browser** (`/syllabus`) discloses one level at a time — sections, then topics,
then nodes — because a subject holds a few hundred labels and showing them all at once turns
the page into a wall of text. Search runs as a server action rather than over a client-side
copy of the tree; the tree has no business being shipped to the browser so a student can type
three letters. Nodes that are already on the student's roadmap are marked, and completed ones
are ticked.

---

## Scope guardrails

Carried over from the source document, and worth keeping:

- Undergraduate MBBS only. NEET-PG coaching submodules are not appended automatically.
- AETCOM, the Foundation Course, Early Clinical Exposure, electives and competency codes
  belong in separate curriculum layers, not mixed into the subject topic tree.
- Forensic Medicine spans Phase II and Phase III Part I. One canonical tree, filed under
  Phase II; expose it in both phases if the navigation ever calls for it.
- Community Medicine is taught longitudinally but grouped in Phase III Part I for clean
  navigation.
- Allied clinical subjects stay independent trees rather than being hidden inside Medicine or
  Surgery.
