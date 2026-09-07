# Overnight improvements

An implementation log for the overnight work on data integrity, fairness and
explainability. Newest phase last. Every claim here is meant to be checkable against a
file, a migration or a test.

---

## Phase 0 — Baseline (reconnaissance)

Recorded before any code was changed, so later results can be compared against something.

### Commands run on the untouched tree

| Command                | Result                                            |
| ---------------------- | ------------------------------------------------- |
| `npm test`             | **380 passed**, 26 files, ~14s                    |
| `npm run typecheck`    | clean                                             |
| `npm run lint`         | clean                                             |
| `npm run format:check` | **7 files unformatted** (pre-existing, see below) |

`format:check` failures on the untouched tree:
`.claude/launch.json`, `.mcp.json`, `drizzle/meta/_journal.json`,
`drizzle/meta/0000_snapshot.json`, `tsconfig.json` — plus `src/server/scoring.ts` and
`tests/points.test.ts`, which are part of the uncommitted work described next.

### Uncommitted work found in the tree (preserved, not overwritten)

`git status` at the start of the session showed modifications the owner had already made:

- `src/lib/domain/points.ts` — replaces `showedUpFromScore(score)` with
  `showedUpForDay({ entries, verifiedPresence })`. An admin-grantable attendance mark
  (`live_session_present` / `live_session_late`) no longer satisfies "showed up" on its own;
  it needs either a corroborating `study_room_presence` row or some other earned behaviour.
- `src/server/scoring.ts` — `recomputeDay` now loads the day's `study_room_presence` row and
  feeds it to `showedUpForDay`.
- `tests/points.test.ts`, `tests/topic-assignment.integration.test.ts` — tests for the above.
- `src/app/admin/grove/page.tsx`, `src/app/admin/syllabus/page.tsx`, `.gitignore` — small
  unrelated edits.
- Untracked: `Daily-Rounds-Demo-Access.pdf`, `FMGE PYQ/`.

This is the front half of audit recommendation 3. **All of it was kept**; the work below
builds on it rather than replacing it.

### Findings confirmed by reading the code

Each of these was verified in the source before being scheduled for a fix.

1. **Overdue focus rounds are always killed, never grown.**
   `sweepAbandonedTrees` (`src/server/grove.ts`) sets `status='withered'`,
   `wither_reason='abandoned'` on _every_ `growing` tree past `due_at + 600s`, with no test
   of whether the promised interval actually elapsed. A student who sits out a 25-minute
   round with the phone face down and picks it up 11 minutes later loses the tree even
   though server time proves they were owed it. This is the mechanism behind "roughly 60 of
   86 stumps are caused by app behaviour".
2. **Study sessions are never closed by anything but the student.**
   `src/server/actions/study.ts` writes `running`/`paused` rows; only `finishSessionAction`
   ends one. There is no sweeper and no lifecycle bound, so a closed laptop leaves a row
   running forever and `recomputeDay`'s `trackedMinutes` fallback sums unbounded
   `elapsed_seconds`. Explains "32 paused, 8 running, one student with 1,173 minutes and
   zero grown trees".
3. **No scheduled work exists at all.** `vercel.json` contains only `regions`. Both sweeps
   above are lazy and member-scoped (`sweepAbandonedTrees` runs on the caller's own rows
   during a grove read), so a student who never opens the app is never swept.
4. **`last_login_at` is written in exactly one place** — `src/server/actions/auth.ts:107`,
   on password login. Sessions last 30 days, so an active student who never logs out has a
   `last_login_at` frozen at their first sign-in.
5. **`point_rules` implies control it does not have.** `streak_bonus` and `achievement`
   have rows in `DEFAULT_POINT_RULES` (0 and 25) but neither value is ever read: streak
   bonuses come from `milestoneBonusPoints()` (`src/lib/domain/streak.ts`, a fixed 10–100
   ladder) and achievement awards from `achievementPoints(tier)`
   (`src/lib/domain/achievements.ts`, a fixed 10/25/50). The admin settings screen already
   hides `streak_bonus` and `admin_adjustment` — but it still renders an editable
   **Achievement** field that changes nothing, which is a live fake control.
6. **Non-active days are only partly credited.** `recomputeRange` refreshes non-active days
   that carry ledger rows, and `recomputeDay` stores their points and minutes — but
   `bandForDay` collapses every non-active day to the `off` band regardless of effort, and
   `showedUp` is hard-gated on `isActive`, so weekend work is invisible on the calendar and
   cannot support a streak.

### Architecture constraints being honoured

- `daily_activity` stays a derived cache with `recomputeDay` as its only writer
  (ADR: source vs derived).
- Every XP change stays an idempotent `points_ledger` insert keyed on `idempotency_key`
  (ADR-003). No second scoring path is introduced.
- Day boundaries stay `YYYY-MM-DD` civil dates in the student's own timezone, via the
  existing `src/lib/domain/calendar.ts` helpers (ADR-005).
- Timing-sensitive outcomes are decided from server timestamps only (ADR-006's sibling rule
  in the grove module).

---

## Phase 1 — Correctness and trust foundation

Everything in this phase is about one thing: a number the product shows a student should be
derivable from something that actually happened.

### 1. The grove stops manufacturing failures

**The bug.** `sweepAbandonedTrees` set `status='withered'`, `wither_reason='abandoned'` on
every `growing` row past `due_at + 600s`, without ever testing whether the promised interval
had elapsed. The normal way to sit out a Pomodoro is to put the phone face down — which is
exactly the state in which a browser cannot report back — so the students following the
instructions best lost the most trees. The audit attributed ~60 of 86 stumps to this.

**The rule now** (`resolveOverdueRound`, `src/lib/domain/grove.ts`): an overdue round is
decided from server timestamps alone, and has no losing outcome. `planted_at` → `due_at`
elapsed means **grown**; not yet elapsed means **still growing**. Quitting still leaves a
stump, but it has to be _said_ — by `witherTreeAction`, from the button the student pressed —
rather than inferred from a tab that went quiet. Silence is not evidence.

`SWEEP_DELAY_SECONDS` (600) survives as a _scheduling_ delay only: it gives the browser first
refusal on claiming its own tree and firing its own celebration before the server does it for
them. It no longer decides any outcome.

Three further fairness fixes:

- **Brief aborts leave no trace.** A round abandoned inside `MIN_COMMITMENT_SECONDS` (120)
  deletes its row instead of planting a stump. Picking the wrong preset and stopping fifteen
  seconds later is a misclick, not a broken promise, and charging for it was dragging down a
  survival percentage students were being shown as a measure of their discipline. This is the
  only deletion in the grove, and it is bounded by `planted_at`, a server timestamp.
- **A finished round cannot be destroyed by a late client.** `witherTreeAction` now checks
  `hasRunFullRound` first: a tab that wakes from sleep and fires its "I left" handler grows
  the tree instead of killing it.
- **`growTreeAction` tolerates a server-settled round.** `status === 'grown'` falls through
  rather than erroring, so a browser waking after the scheduled sweep is handed its tree.

**Study-room join no longer kills a round.** Joining opens the meeting in another tab, and
that tab taking focus was byte-for-byte the same signal as opening Instagram. The away timer
now calls `studyRoomHoldAction` at the moment it _fires_ (not when it is armed, so the round
trip is spent only when a round is genuinely about to be lost). The decision is
`suspendsAwayTimer` in `src/lib/domain/study-room.ts`, made from two server-side facts: an
open `study_room_presence` row this student created by joining, and the room's own window
still being open on the cohort clock. The second is what keeps it from being a loophole —
joining at 06:00 buys no exemption for the rest of the day.

### 2. Study blocks are closed, and their arithmetic is bounded

**The bug.** Nothing but the student pressing Finish ever ended a block, and
`elapsed_seconds` was banked straight from the wall clock. A closed laptop accrued overnight.
Audit: 32 paused, 8 running, one student with 1,173 study minutes and zero grown trees.

**Three defences**, in `src/lib/domain/study-session.ts`, all pure and all taking their `now`:

| Rule                    | Value | What it stops                                      |
| ----------------------- | ----- | -------------------------------------------------- |
| `MAX_SEGMENT_SECONDS`   | 4h    | one uninterrupted segment banking an overnight gap |
| `MAX_SESSION_SECONDS`   | 12h   | any total, however assembled, poisoning a metric   |
| `STALE_SESSION_SECONDS` | 6h    | a quiet block staying "in progress" indefinitely   |

`STALE_SESSION_SECONDS > MAX_SEGMENT_SECONDS` is asserted by a test: the sweep must never
close a block that is still legitimately earning.

The caps are applied on the live paths too (`pauseSessionAction`, `finishSessionAction`), so
no _new_ row can be corrupted, and `startSessionAction` closes the caller's own stale blocks
first — the same lazy-sweep pattern the grove already used.

A swept block becomes `abandoned`, not `completed`, and pays nothing. Nobody finished it.
`auto_closed_at` records that the server ended it and `raw_elapsed_seconds` preserves the
pre-cap value, so every correction is inspectable and reversible.

### 3. `point_rules` is no longer a claim the ledger contradicts

`streak_bonus` and `achievement` had rows in `point_rules` whose values were never read —
streak bonuses come from `milestoneBonusPoints()` (a fixed 10–100 ladder by milestone),
achievements from `achievementPoints(tier)` (10/25/50). The settings screen rendered an
**editable Achievement field that changed nothing at all**.

One source of truth now: `COMPUTED_POINT_EVENTS` in `src/lib/domain/points.ts`.
`EDITABLE_POINT_EVENTS` derives from it; the settings UI renders from that, the seeder writes
only those rows, and `pointRuleSchema` refuses a write for a computed event — so the screen
and the server cannot drift apart, and adding a computed event cannot leave a dead control
behind. The fake field is replaced by a **Set automatically** section explaining how each
computed value is arrived at, drawn from `COMPUTED_POINT_EXPLANATIONS` so the admin screen
and the student's own points page cannot describe the same rule differently. Migration 0014
deletes the misleading rows; no ledger entry is touched.

### 4. `last_login_at` means "last seen"

It was written in exactly one place — the password login form — and sessions last 30 days, so
an active student who never signs out showed a `last_login_at` frozen at their first sign-in
on every admin screen that asked when they were last here.

`touchLastSeen` in `src/lib/auth/session.ts` now refreshes it from any authenticated request,
throttled to at most once an hour per account. The throttle is checked against the value the
session lookup was already fetching, so the common case costs no extra read and no write at
all; the SQL predicate repeats the staleness test so two concurrent requests write once
between them. A failure is swallowed — reporting metadata must never fail a page render.

### 5. Bonus days: the weekend a student worked

`bandForDay` collapsed every non-active day to `off` regardless of effort, and `showedUp` was
hard-gated on `isActive`. The points and minutes were being stored the whole time and shown
nowhere. Audit: 18 uncredited student-days.

- New `bonus` band (migration 0013) for a non-active day with a score above zero, drawn in
  citrus — the ramp this design system reserves for earned XP — with an outline saying it
  sits _outside_ the required grid rather than higher up it.
- `recomputeDay` records `showedUp` honestly rather than gating it on `isActive`.
- `recomputeRange` now also refreshes non-active days carrying a study session, not only ones
  carrying a ledger row, so a weekend block that fell short of the payout threshold still
  shows its minutes.

**The denominator is untouched, and this is structural rather than a matter of care.**
`calculateConsistency` and the streak engine both iterate `activeStudyDaysBetween`, so a bonus
day can never enter either. Two integration tests pin it: a perfect Saturday alone still reads
0% consistency over 5 active days, and a Friday-plus-Saturday pair still reads a streak of 1.
A weekend can lift a total; it can never become expected.

### 6. Attendance: verified presence vs. reasoned override

Built on the owner's uncommitted `showedUpForDay` work, which was kept as found.

`attendance.source` (migration 0014) separates the two paths at the point of writing:

- **`verified`** — written by `joinStudyRoomAction` alongside the `study_room_presence` row
  the student's own client heartbeats. `showedUpForDay` accepts this on its own.
- **`admin`** — a hand mark. It still pays its points (a cohort lead who was in the room
  knows something the software does not) but cannot, by itself, assert that anyone turned up.

The column default is `admin`, so a writer that forgets to say where a mark came from is not
given the benefit of the doubt. A test pins that.

`markAttendanceAction` now **requires a reason** (`attendanceMarkSchema`, min 3 chars). It is
stored on the row, written into the ledger entry's `reason` so the student's own points page
can explain it, and recorded per-student in the audit log. Overruling a verified join
rewrites the row's provenance too, so a mark never keeps a credibility it no longer has.

Bulk friction now matches a bulk XP grant: a confirmation sheet stating how many students are
about to change, **naming the ones whose own study-room record is being overruled**, and
requiring the reason before the button enables. The sheet also shows each row's provenance
inline, so an admin can see which marks the room recorded for itself.

Existing rows are backfilled by evidence, not by guess: `verified` where the row carries the
join path's note or a matching `study_room_presence` row exists; `admin` for everything else.

### 7. Background work is scheduled, authenticated and visible

The audit's "no sweeper is actually scheduled" was exact: `vercel.json` held only `regions`.

- **`src/server/sweep.ts`** — `runSweep()` runs both sweeps and writes a `sweep_runs` row
  _before_ the work, updating it after, so a run that dies mid-flight leaves a row with a null
  `ok` rather than no trace.
- **`GET /api/cron/sweep`** — bearer auth against `CRON_SECRET`, compared in constant time.
  **Fails closed when the variable is unset**: an unauthenticated writer to the records every
  number in the product derives from is worse than a sweep that does not run, and the latter
  is visible on the admin panel while the former is not.
- **`vercel.json`** — a cron entry every 15 minutes.
- **Admin → Cohort settings → Background sweep** — never run / last run failed / ran N ago,
  with what it touched. The "never run" state explains that `CRON_SECRET` is missing and that
  lazy per-student sweeps still cover anyone who opens the app.

Age is computed in SQL against the server clock, not in the component. `npm run lint` caught
the original `Date.now()` in render, and the fix is the better one on the merits: "has the
sweep stopped?" is a timing decision, and every timing decision here is now the server's.

### 8. Repair script for the damage already in the database

`npm run db:repair-sessions` (`src/db/scripts/repair-sessions.ts`).

- **Dry run by default**; `--apply` commits.
- **Prints its target** (driver and host, credentials stripped) before doing anything, so
  "I ran the dry pass" and "I ran it against the database I meant" are the same statement.
- **Non-destructive**: every corrected row keeps its original in `raw_elapsed_seconds`.
- **Idempotent**: a repaired row no longer matches the predicate.

`src/server/session-lifecycle.ts` exists so this script and the sweep run _the same code_; it
deliberately omits the `server-only` marker, with the reason written at the top of the file.
The alternative was reimplementing the queries in the script, which is how a repair tool ends
up applying a slightly different rule from the sweep it is meant to match.

### Files changed in Phase 1

**Migrations** — `drizzle/0013_bonus_day_band.sql`, `drizzle/0014_integrity_foundations.sql`.
(0013 is alone in its file because a new enum value may not be used in the transaction that
adds it, and the runner sends each file as one batch.)

**Domain** — `points.ts`, `grove.ts`, `study-room.ts`, `study-session.ts` (new).

**Server** — `scoring.ts`, `grove.ts`, `sweep.ts` (new), `session-lifecycle.ts` (new),
`queries/admin.ts`, `queries/grove.ts`, `actions/grove.ts`, `actions/study.ts`,
`actions/study-room.ts`, `actions/admin.ts`, `lib/auth/session.ts`, `lib/validation.ts`,
`db/schema.ts`, `db/scripts/seed.ts`, `db/scripts/repair-sessions.ts` (new).

**UI** — `app/api/cron/sweep/route.ts` (new), `admin/settings/{page,settings-screen}.tsx`,
`admin/attendance/attendance-sheet.tsx`, `(app)/study/study-screen.tsx`,
`(app)/calendar/calendar-screen.tsx`, `components/charts/heatmap.tsx`.

**Config** — `vercel.json` (cron), `package.json` (`db:repair-sessions`).

**Tests added** — `grove-sweep.integration.test.ts` (8), `study-session.test.ts` (14),
`sweep.integration.test.ts` (12), `attendance-provenance.integration.test.ts` (7); plus new
cases in `grove.test.ts`, `points.test.ts`, `scoring.integration.test.ts`.

### Phase 1 results

`npm test` — **431 passed** (30 files), up from 380/26 at baseline.
`npm run typecheck`, `npm run lint` — clean.
All 15 migrations apply from scratch against a fresh database (verified against a scratch
PGlite instance, never against a real one).

---

## Phase 2 — Immediate student value

### 1. Assessments now pay, and the marking backlog is visible

**Results and explanations were already correct.** `getAttemptDetail` releases the
auto-scored result on submission and returns per-question explanations, gated on the
assessment's own `allow_answer_review` (default true). No change was needed; the audit's
"release results immediately, show explanations" was already satisfied.

**The ledger was not wired at all.** `submitAttemptAction` awarded nothing. A student could
sit a timed paper and watch their points not move — the clearest way a product can say the
work did not count.

Assessments now pay through `quiz_attempt` / `quiz_bonus`, the events that already exist for
this shape of thing, rather than through a second scoring path. Both are outside
`BEHAVIOUR_EVENTS`, so no assessment result can move consistency or outrank showing up
(ADR-004) — asserted by a test rather than left to the reader.

Two deliberate decisions worth the owner's attention:

- **Keyed on the attempt** (`ledgerKey.assessmentAttempt`), not on assessment-and-date. A
  student may sit the same paper twice and each sitting is its own work; an
  assessment-and-date key would silently refuse to pay for the second. A re-submitted or
  replayed submission is still a no-op at the database.
- **The accuracy bonus is computed on the auto-graded portion only, and never revised.** It
  can therefore be paid the moment the student submits, alongside the result they are already
  looking at, instead of arriving days later when a human reaches the written answers — and
  it stays one award, one key, one moment, so it needs no correction machinery. Revising it
  after review would mean a second re-cut of a paid award, and ADR-003 has exactly one of
  those on purpose. Written answers are marked by a human for feedback, which is what they
  are for.

**The review queue.** Each assessment already carried its own pending count, but nothing
showed the cohort-wide backlog — so a paper set weeks ago and never marked was invisible
unless somebody opened that assessment. That gap is where the audit's 107 ungraded answers
were sitting. `getReviewQueue` lists every pending attempt across the cohort **oldest first**,
because the student who has waited longest is the one the queue should hand you next, with
the wait in days (aged in SQL, against the server clock) and the count of unmarked answers.
It renders at the top of `/admin/assessments`, each row linking straight into the marking
screen. Sittings a restart invalidated are excluded — thrown-away work is not work anyone is
waiting on.

### 2. Pre-filled check-ins

The check-in is a six-step form at the end of a long day, and it is where several numbers come
from — so when it is skipped, work that genuinely happened scores as though it did not.

`src/lib/domain/check-in.ts` builds the form's opening answers from records the student made:
the day's assigned topics, the focus rounds that **grew**, tracked block minutes, and whether
they ticked today's target off. Three rules keep it honest, and the third matters most:

1. **Everything stays editable.** Suggestions, never submissions; the full form is unchanged.
2. **Nothing is invented.** No evidence for a field means the field is left empty. A wrong
   default is worse than an empty one — it is a number the student did not choose, arriving
   under their name.
3. **Nothing is pre-filled downward.** `completion` is never suggested as `none`. The absence
   of a record is not evidence that nothing happened, and a form opening with "I did nothing"
   selected is one bad tap from writing that down.

Minutes take the **larger** of block and grove time, never the sum: a round sat _inside_ a
block is counted by both, and adding them would routinely hand students twice the minutes
they did.

The form shows where its suggestion came from ("From 2 focus rounds, 55 min tracked. Change
anything that is not right.") — a pre-filled field with no explanation reads as something the
app decided about you; one that shows its working reads as a record you can correct.

The check-in is also offered from the study screen at the end of a round, which is the moment
the work is freshest and the student is already stopped.

### 3. "Yesterday you said…" on Home

`check_ins.tomorrow_target` has been collected since launch, pays 10 XP, and was shown back
to the student **nowhere** — only to admins on a review screen. Asking someone to write a
commitment and then never mentioning it again teaches them the commitment does not matter.

The card leads the Home screen with their own words and two actions, neither of which invents
any data:

- **Start that** opens `/study`, which already begins a block and plants a round against
  today's assigned topic — so the round is pre-associated exactly as asked, without inventing
  a second mechanism for saying which topic a commitment is about.
- **Change it** goes to the check-in, where the target lives.

It takes the most recent check-in with a target rather than strictly yesterday's — a student
who checked in on Friday and opens the app on Monday should still see what they said — and
labels itself honestly either way ("Yesterday you said" / "On Thursday 3 Sept you said"). It
disappears the moment today's check-in is filed, because at that point the student has made a
new commitment and being asked about the old one is noise.

### Phase 2 files

**Domain** — `check-in.ts` (new), `points.ts` (assessment ledger keys).
**Server** — `actions/assessments.ts`, `queries/assessments.ts`, `queries/student.ts`.
**UI** — `admin/assessments/{page,assessments-screen}.tsx`, `(app)/today/home-screen.tsx`,
`(app)/check-in/check-in-screen.tsx`, `(app)/study/study-screen.tsx`.
**Tests** — `assessment-scoring.integration.test.ts` (7), `check-in-prefill.test.ts` (16).

---

## Two pre-existing bugs found and fixed along the way

Neither was in the brief; both were blocking.

1. **`npm run db:seed` was broken.** The seeder wrote every row and then died on its final
   scoring pass, leaving `daily_activity` empty — so a freshly seeded database showed nobody
   with any consistency. Cause: `seed.ts` dynamically imports `@/server/scoring`, which pulls
   in `@/server/cache`, which is marked `server-only` — and that package's default export
   throws the moment anything outside a React Server Component build imports it, which a
   plain `tsx` run is. Fixed by running the script under `--conditions=react-server`, which
   resolves `server-only` to its empty stub. `db:repair-sessions` carries the same flag.
   (`src/server/cache.ts` is unmodified; this was present before tonight's work.)

2. **`export const dynamic` in a route handler breaks the build.** Caught by `npm run build`,
   not by typecheck or lint: this project runs Next's Cache Components, which rejects that
   segment config outright. The cron route does not need it — it reads `request.headers`,
   which makes it dynamic by construction. Worth knowing before the next route handler is
   written.

---

## Verification

### Commands, on the final tree

| Command                | Result                                                     |
| ---------------------- | ---------------------------------------------------------- |
| `npm test`             | **454 passed**, 32 files (baseline: 380 / 26)              |
| `npm run typecheck`    | clean                                                      |
| `npm run lint`         | clean                                                      |
| `npm run format:check` | 5 files — **all pre-existing**, all untouched by this work |
| `npm run build`        | passes (see caveat below)                                  |

The `format:check` failures are `.claude/launch.json`, `.mcp.json`,
`drizzle/meta/_journal.json`, `drizzle/meta/0000_snapshot.json` and `tsconfig.json`. All five
failed on the untouched tree at baseline. They are left alone deliberately: reformatting
config files nobody asked about is unrelated churn in an already large diff. `npx prettier
--write .` clears them whenever you want.

### How the build and preview were run

Another dev server was already running in this directory (from a different session), and Next
refuses a second one — so `next build` was run against an **isolated copy** of the tree in a
scratch directory, pointed at a scratch PGlite database. Nothing touched the working tree's
`.next`, and no migration was ever run against a real database.

**Migrations were verified end to end**: all 15 apply cleanly to an empty database, and the
seeder then populates it and completes its scoring pass.

### What was checked in a browser, and what was not

**Verified visually**, signed in as a seeded student against the scratch database:

- the "Yesterday you said…" card renders at the top of Home with the quote, today's topic,
  and both actions — including the honest fallback label when the last commitment was not
  literally yesterday.

**Not verified visually**: the admin attendance confirmation sheet and the admin sweep panel.
Admin sign-in would not go through in the automated browser — no POST was issued at all,
while the identical code path signed a student in minutes earlier — so this is harness
friction rather than evidence of a defect, but it is untested by eye either way. Both screens
are type-checked, linted and compiled by the production build, and their server-side logic is
covered by tests; the rendering is not. **Please click through
`/admin/attendance` and `/admin/settings` once before trusting them.**

---

# Morning handoff

## Before this deploys to production

In this order. Nothing here was done for you — no migration was run, no scheduler configured,
no secret set, and no real database was touched at any point tonight.

### 1. Apply the migrations

```bash
DATABASE_URL="postgresql://..." npm run db:migrate
```

Two new files, `0013_bonus_day_band.sql` and `0014_integrity_foundations.sql`. Both are
idempotent and safe to re-run. 0014 backfills `attendance.source` from evidence already in
the rows (the join path's note, or a matching `study_room_presence` row) before adding the
`NOT NULL` constraint, and deletes the three misleading `point_rules` rows. It touches no
ledger entry.

`0013` is alone in its file because Postgres will not let a new enum value be _used_ in the
transaction that adds it, and the migration runner sends each file as one batch. Keep them
separate.

### 2. Turn the scheduled sweep on

**The cron schedule is once a day (`0 20 * * *`, 01:30 IST), not every 15 minutes.** This
project is on Vercel's Hobby plan, which permits exactly one cron run per day — and a more
frequent expression is not merely ignored, it **fails the entire deployment**. That is what
kept three commits of fixes from ever reaching production, silently, with a green git push
each time. If the project moves to Pro, change it back to `*/15 * * * *` in `vercel.json`.

A daily backstop is weaker but less so than it sounds: the grove and study screens sweep the
caller's own rows on every read, so the only student it leaves waiting is one who has not
opened the app at all.

Set `CRON_SECRET` on the Vercel project. Vercel Cron sends it automatically as a bearer token
to the schedule already declared in `vercel.json` (`/api/cron/sweep`, every 15 minutes).

**The endpoint fails closed when the variable is unset** — it refuses every request rather
than falling open. Until you set it, `/admin/settings` will show the sweep as "Never run" with
an explanation. That is the intended failure mode: a sweep that does not run is visible, an
unauthenticated writer to the records every number derives from is not.

Add it to `.env.example` when you set it; I deliberately did not invent a value.

### 3. Repair the study sessions already in the database

Dry run first, and read the numbers:

```bash
DATABASE_URL="postgresql://..." npm run db:repair-sessions
```

Then, if they look right:

```bash
DATABASE_URL="postgresql://..." npm run db:repair-sessions -- --apply
```

It prints its target host before doing anything, keeps every original value in
`raw_elapsed_seconds`, deletes nothing, and is idempotent. Afterwards, press **Recalculate**
in `/admin/settings` so the derived activity cache picks up the corrected minutes.

### 4. Recalculate the cohort

Needed anyway, regardless of step 3 — bonus days, the attendance rule and the corrected
minutes all change `daily_activity`, and it is a derived cache with `recomputeDay` as its only
writer. The **Recalculate** button in `/admin/settings` rebuilds it from source.

Expect these to move: weekend days that had work appear as bonus days; a few students'
`showedUp` flips to false on days whose only evidence was a hand-marked attendance row;
study-minute totals fall where the old uncapped arithmetic had inflated them.

---

## Behaviour changes students and admins will notice

**Students**

- Focus rounds no longer die because the browser was asleep. A round whose promised time has
  elapsed on the server's clock is grown, full stop. Roughly 60 of the existing 86 stumps were
  produced by the old sweep — those rows are historical and are _not_ rewritten, but no new
  ones will be created. **Consider telling the cohort**; some of them have been blaming
  themselves for these.
- Quitting inside two minutes now leaves nothing behind instead of a stump.
- Joining the study room no longer kills a running round.
- Weekend work appears as a **bonus day** on the calendar, with its XP and minutes. Consistency
  is still measured over active study days only, so this can lift a total but can never make a
  weekend expected.
- Sitting an assessment now awards XP. It could not previously.
- The check-in opens pre-filled from the day's actual work, and says where the suggestion came
  from.
- Home leads with their own last commitment and a button that starts it.

**Admins**

- Marking attendance by hand now **requires a reason** and goes through a confirmation sheet
  that names the students whose own study-room record is being overruled. This is a real
  change to a daily workflow — it is the change that makes the leaderboard defensible, but it
  will feel slower on day one.
- A hand-marked attendance row still pays its points but no longer, on its own, asserts that
  the student turned up.
- The **Achievement** field in Scoring is gone. It never did anything; the section now explains
  how those values are actually computed.
- `/admin/assessments` opens with the cohort-wide marking queue, oldest first.
- `/admin/settings` shows whether the background sweep is running.

---

## Deferred, ranked by impact

1. **Evening nudges (audit #5) — not started.** Correctly so: consent, quiet hours, preferred
   channel, unsubscribe, delivery audit and timezone-aware scheduling are all prerequisites,
   and none of that infrastructure exists. Building the data model without the delivery path
   would have added schema nobody could use. The scheduled-job mechanism this needs now exists
   (`/api/cron/sweep` is the pattern), which is the hard part.
2. **Week-focused roadmap view and "too much / too little" (audit #8).** Deferred because the
   reflow is the substance and doing it _deterministically_ against the existing roadmap logic
   needs a design decision I would be guessing at: whether feedback moves topic dates, changes
   how many topics a week holds, or re-weights the remaining plan. The default-to-this-week
   view without a working reflow would be a fake control. No student has customised a roadmap
   yet, so nothing is currently broken by waiting.
3. **Waitlist status workflow and stale-entry warning (audit #9).** Straightforward and
   self-contained; ran out of night. 20 warm leads averaging five days untouched.
4. **Student-facing XP explanation (Phase 2 #4).** Partly delivered — ledger entries from
   admin attendance marks now carry the reason in their `reason` field, so the Progress screen
   shows "Marked present by a cohort lead — <reason>" rather than a bare label. A dedicated
   explanation surface was not built.
5. **Learning-outcome linkage (audit #F).** Untouched, correctly — it was scoped as
   "lightweight foundations only", and nothing tonight naturally produced them.
6. **Daily obstacle taxonomy (audit #10, last bullet).** Untouched; the audit itself calls it
   product work rather than engineering.

---

## Decisions that need your call

1. **Grove history is not rewritten.** The ~60 stumps the old sweep created are still stumps,
   and still drag down every affected student's survival percentage. I did not backfill them:
   the sweep recorded `wither_reason = 'abandoned'` for both genuine walk-aways and its own
   false failures, so nothing in the data separates them now — any repair would be guesswork
   applied to students' records. If you want them cleared, the defensible rule is "every
   `abandoned` stump created before the deploy date", which will also forgive some real
   walk-aways. **Your call, and it needs to be a deliberate one.**

2. **The accuracy bonus ignores written answers.** See Phase 2 §1. The alternative — revising
   the award after a human marks the paper — means a second re-cut of a paid ledger entry, and
   ADR-003 has exactly one of those by design. If you would rather written answers counted
   toward XP, that is a real product decision and it changes the ledger's guarantees.

3. **The away-timer check fails open.** If `studyRoomHoldAction` errors, the round survives.
   This matches the study screen's stated philosophy (a wrongly killed tree is the failure that
   makes students stop trusting the mechanic) and the round is still settled by server time —
   a student who really walked away cannot claim it until its full length has elapsed. But it
   does mean going offline for twenty seconds protects a round.

4. **Session caps are judgement calls, not measurements.** 4h per segment, 12h per block, 6h to
   stale. They are far outside any real sitting and far inside the overnight gaps that caused
   the damage, but if your students genuinely do 6-hour unbroken blocks, raise
   `MAX_SEGMENT_SECONDS` in `src/lib/domain/study-session.ts` — one constant, and
   `STALE_SESSION_SECONDS` must stay above it (a test enforces that).

5. **Attendance friction.** The required reason is a real cost on a daily admin task. It is
   what makes the leaderboard explainable, but if it proves too heavy in practice the honest
   lever is to keep the reason and drop the confirmation sheet for single-student marks —
   not to drop the reason.

---

## Reviewing this locally

```bash
npm test && npm run typecheck && npm run lint
```

To see it running, against a throwaway database rather than production:

```bash
DATABASE_URL= PGLITE_DATA_DIR=.data/review npm run db:migrate
```

```bash
DATABASE_URL= PGLITE_DATA_DIR=.data/review npm run db:seed
```

```bash
DATABASE_URL= PGLITE_DATA_DIR=.data/review npm run dev
```

Sign in as `admin@dailyrounds.app` / `roundsadmin123`, or as a student with
`sara.menon@example.edu` / `roundsdemo123`.

The three things most worth looking at by eye:

- `/today` as a student who has not yet checked in — the commitment card.
- `/admin/attendance` — mark somebody, and read the confirmation sheet. **This is the one
  screen I could not verify visually.**
- `/admin/settings` — the Background sweep panel, and the Scoring card's "Set automatically"
  section where the dead Achievement field used to be.

To read the diff by theme rather than by file:

```bash
git diff -- src/lib/domain/ src/server/grove.ts src/server/sweep.ts src/server/session-lifecycle.ts
```

```bash
git diff -- drizzle/ src/db/schema.ts
```
