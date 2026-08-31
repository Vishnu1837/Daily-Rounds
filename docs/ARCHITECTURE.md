# Architecture

This document records the decisions that are expensive to reverse. If you are about to
change how scoring, streaks or the database driver work, read the relevant ADR first.

---

## The central principle: source vs derived

Daily Rounds separates **what happened** from **what it means**.

| Source (facts, written once) | Derived (computed, always recalculable) |
| --- | --- |
| `attendance` | current streak, best streak |
| `study_sessions` | consistency % |
| `check_ins` | show-up rate |
| `daily_assignments` | leaderboard position |
| `points_ledger` | risk level |
| `quiz_attempts` | cohort streak |
| `weekly_reviews` | weekly progress, improvement |

`daily_activity` sits between the two. It is a **cache** of derived state — one row per
student per day holding the day's score, band, points and minutes. It exists so the
leaderboard and heatmap are single queries rather than N. It is never a source of truth:
`recomputeDay()` is its only writer and rebuilds it from source records, and the admin
console exposes a **Recalculate** button that rebuilds the entire cohort from scratch.

The practical consequence: no bug in this system is unrecoverable. If a metric is ever
wrong, the fix is to correct the source record and recompute — never to hand-edit a number.

---

## ADR-001: Session auth over a hosted auth provider

**Status:** accepted.

The brief suggested Supabase Auth. We use first-party session cookies with scrypt hashing
from `node:crypto` instead.

**Why.** The rest of the application talks to Postgres through a server-side data-access
layer; it never issues queries from the browser. Supabase Auth's main advantage — a JWT the
client can present directly to PostgREST so RLS can enforce authorization — is therefore
unused. What remains is a hard runtime dependency on a specific hosted service for the one
flow that must work before anything else does.

The chosen approach: `scrypt` (N=32768) password hashing, opaque 256-bit session tokens
stored only as SHA-256 hashes, `httpOnly` + `SameSite=Lax` + `Secure` cookies, and a
30-day expiry with opportunistic cleanup. Login runs a hash comparison even when the account
does not exist, so a missing account and a wrong password take the same time and are
indistinguishable in the response.

**Consequences.** Auth works identically against Supabase, Neon, RDS or the local embedded
database, and it is fully testable without network access. We own password reset (no mail
provider ships with the MVP: in development the reset link is surfaced in the UI, in
production it is logged for the operator to relay). Migrating to Supabase Auth later means
replacing `src/lib/auth/*` and backfilling `auth.users`; nothing else changes, because every
call site goes through `requireUser()` / `requireAdmin()`.

**Authorization** is enforced server-side, in every case:

- Pages use `requireUser` / `requireOnboardedUser` / `requireAdmin`, which redirect.
- Server actions use `requireUserAction` / `requireAdminAction`, which throw a typed
  `AuthorizationError` the action layer converts into a user-facing message.
- Every admin mutation additionally verifies the target row belongs to the admin's cohort
  (`assertMemberInCohort`, `assertRoadmapInCohort`) rather than trusting IDs from the client.
- Students may only mutate their own data; a topic can only be completed if it belongs to a
  roadmap they own.
- The client never supplies points, attendance or leaderboard position. It supplies
  intent; the server decides the value.

---

## ADR-002: One schema, two drivers

**Status:** accepted.

`DATABASE_URL` present → **postgres.js** (Supabase, Neon, RDS, anything).
`DATABASE_URL` absent → **PGlite**, an embedded Postgres that stores its data under `.data/`.

**Why.** `git clone && npm install && npm run dev` produces a working, populated application
with no Postgres install, no Docker, and no cloud account. Because PGlite *is* Postgres
compiled to WebAssembly, this is not a compatibility trade: the same migrations, the same
`jsonb` and array columns, the same enums, the same partial-unique-index semantics that make
the points ledger idempotent. Nothing in the application layer knows which driver it is
talking to.

**Consequences.** Integration tests run against real Postgres semantics in-memory, in about
two seconds, with no external service. Production uses a normal pooled Postgres connection
(`prepare: false` for Supabase's transaction-mode pooler).

Two details this forced, both of which are improvements:

- The database handle is a **lazy singleton**. Merely importing `@/db/client` opens nothing;
  the connection is created on first property access. `next build` spawns page-data workers
  that import server modules without querying, and eagerly connecting made them contend for
  the same PGlite data directory.
- The data directory is resolved **at connection time, not import time**. A module-level
  constant captures whatever the environment was when the module was first evaluated, which
  makes the target database depend on import order — that is how an integration test can
  silently end up pointed at the development database. The test harness asserts it is
  in-memory before issuing its first query.

---

## ADR-003: Points are an append-only ledger

**Status:** accepted.

There is no mutable `points` column anywhere. Every award is a row in `points_ledger` with a
student, an event type, a value, the study day it belongs to, and a deterministic
`idempotency_key`.

**Duplicate prevention is a database guarantee, not application logic.** The key is unique:

```
daily_check_in:<memberId>:<date>
attendance:<memberId>:<date>
streak_bonus:<memberId>:<milestone>
quiz_attempt:<memberId>:<quizId>:<date>
achievement:<memberId>:<code>
```

`awardPoints()` inserts with `ON CONFLICT DO NOTHING` and returns whether a row was written.
A student can submit the same check-in twenty times, or two requests can race, and exactly
one award exists afterwards. Both cases are covered by integration tests.

**Corrections never rewrite history.** An admin adjustment is a new, signed row carrying a
mandatory reason and the acting user's ID. The student's original entries survive, and the
whole ledger is visible to the student on their Progress screen.

**Attendance is the one re-cut.** Changing a mark from present to late must change the
value, so `markAttendanceAction` withdraws the previous award for that member-day and issues
a new one under the same key. This is the only place an award is ever removed, it is scoped
to a single key, and it exists because the *fact* changed — not the interpretation.

---

## ADR-004: Consistency excludes quiz performance by construction

**Status:** accepted. This is the product thesis expressed as code.

`BEHAVIOUR_EVENTS` in `src/lib/domain/points.ts` lists the six events that constitute
showing up: attending the study room, completing the block, completing the target, checking
in, planning tomorrow, and reflecting. They total 80 points a day.

A day's score is `behaviour points earned ÷ 80`, capped at 1. Consistency is the mean of
those scores across active study days. **Quiz, streak-bonus, achievement, weekly-review and
admin-adjustment points are excluded from the numerator entirely.** They are real points and
they show on the leaderboard's tiebreak, but they cannot move consistency.

This is why an admin can raise quiz values in the settings screen without any risk of quiz
performance overtaking attendance: the exclusion is structural, not a matter of choosing
small numbers. A test asserts a perfect quiz is worth less than a single study block, and
another asserts a day of nothing but quiz points scores zero.

The leaderboard ranks by consistency first and points only as a tiebreak, for the same
reason.

---

## ADR-005: The streak engine counts active study days, never calendar days

**Status:** accepted.

A naive `current_date - previous_date === 1` would break every student's streak every
weekend. Instead, `src/lib/domain/calendar.ts` defines the **active study day**:

> A date inside the cohort range whose ISO weekday is one of the cohort's active weekdays
> and which is not a cohort holiday — or which has been explicitly added as an extra study
> day.

Streaks walk `previousActiveStudyDay()`, so Friday and the following Monday are adjacent, a
mid-week holiday is skipped rather than forgiven, and consecutive holidays collapse to
nothing. Consistency uses the same set as its denominator, so weekends cannot dilute a
student's percentage.

Three details that matter:

- **A day in progress is not a miss.** If today is an active study day the student has not
  completed yet, the streak is measured to the previous active day. Opening the app on
  Tuesday morning must not show a broken streak.
- **All date arithmetic is on `YYYY-MM-DD` strings anchored at UTC noon.** Daylight-saving
  transitions cannot shift a day boundary. Tests cover both DST directions and leap days.
- **"Today" is always the cohort's timezone**, resolved with `Intl.DateTimeFormat`, never
  the browser's local offset. Tests cover the midnight boundary in both directions.

Everything is pure functions over a calendar and a `showedUp(date)` predicate, so streaks
can be recomputed from scratch at any time and are exhaustively unit-testable.

---

## ADR-006: Correctness never depends on an animation completing

**Status:** accepted, after three bugs found during QA.

Framer Motion is used for entrances, celebrations and layout transitions. It is **not** used
for anything a number depends on.

Three real failures drove this:

1. A progress bar animating `width` from `0` to `'62%'` stalled mid-flight and permanently
   displayed **38%** for a value of 62%. A bar that silently shows the wrong number is worse
   than one that does not animate.
2. `AnimatePresence mode="wait"` defers mounting the next element until the previous one
   finishes exiting. When that exit stalled, the check-in wizard's step counter advanced
   while the *content stayed on the previous question* — the student could have answered the
   wrong question entirely.
3. `requestAnimationFrame` is suspended in background and occluded tabs, so anything gated
   on an rAF callback never ran at all.

The rules now:

- Progress bars and rings carry their true value as an authoritative inline `width` /
  `stroke-dashoffset`. Only a `transform` is animated, so a stalled transition degrades to
  "no animation", never to "wrong value".
- Multi-step flows render the current step directly with a keyed CSS entrance. Nothing waits
  on an exit.
- Entrance triggers use `setTimeout`, not `requestAnimationFrame`.
- `prefers-reduced-motion` is honoured globally and neutralises all of it.

---

## Data model

```
users ──┬── auth_sessions
        ├── password_reset_tokens
        └── cohort_members ──┬── student_goals        (onboarding baseline)
                             ├── roadmaps ── roadmap_weeks ── roadmap_topics
                             ├── daily_assignments
                             ├── study_sessions
                             ├── attendance
                             ├── check_ins
                             ├── points_ledger        (append-only)
                             ├── daily_activity       (derived cache)
                             ├── student_achievements
                             ├── quiz_attempts
                             └── weekly_reviews

cohorts ──┬── cohort_holidays
          ├── cohort_extra_study_days
          ├── point_rules            (scoring, admin-editable)
          ├── events
          ├── materials
          └── announcements

subjects ── quizzes ── quiz_questions
audit_log                            (who changed what)
```

**Uniqueness that carries meaning**, rather than merely preventing junk:

| Index | Guarantees |
| --- | --- |
| `points_idempotency_unique` | a student can never be paid twice for one action |
| `check_in_unique (member, date)` | one check-in per student per day |
| `attendance_unique (member, date)` | one attendance mark per student per day |
| `daily_assignment_unique (member, date)` | one assigned topic per student per day |
| `student_achievement_unique (member, code)` | each achievement unlocks once |
| `weekly_review_unique (member, week_start)` | one review per week |
| `users_email_lower_idx` | case-insensitive unique email |

---

## Request flow

A mutation, end to end:

```
Client component
  → Server Action ('use server')
      → requireUserAction() / requireAdminAction()      authorization
      → Zod schema .safeParse()                         validation
      → ownership check (member in cohort, topic owned) scoping
      → write the source record
      → awardPoints()      idempotent ledger insert
      → settleDay()        recompute the day, pay milestones, unlock achievements
      → revalidatePath()
  ← Result<T> — { ok: true, data } | { ok: false, message, errors }
```

Actions never throw at the UI. `guarded()` converts unexpected failures into a message a
student can act on ("We couldn't save your check-in. Your points haven't been changed.")
while letting Next's redirect/notFound control-flow throws pass through untouched.

---

## Extension points

- **A new achievement** — add one entry to `ACHIEVEMENTS` in
  `src/lib/domain/achievements.ts`. It is a catalog row plus a pure predicate over an
  evaluation context; nothing else changes.
- **A new scoring event** — add it to the `point_event` enum, give it a default in
  `DEFAULT_POINT_RULES`, and decide whether it belongs in `BEHAVIOUR_EVENTS`. That single
  decision determines whether it can affect consistency.
- **A new roadmap template** — add it to `src/lib/roadmap-templates.ts`. It becomes
  available to both onboarding and the admin console automatically.
- **Automatic attendance** — `attendance` already carries `event_id`, `marked_by` and
  `marked_at`. A future integration writes rows the same way the admin UI does; scoring is
  unchanged.
