# Daily Rounds

**A consistency and accountability platform for medical students.**

Medical students generally already have enough study material. What's hard is sitting down,
doing the work they committed to, and doing it again tomorrow. Daily Rounds measures one
thing: **did you show up and do what you said you would?**

It rewards _process_, not _result_. Someone who turns up every day and finishes their block
will always outrank someone who studies occasionally and aces the quizzes — that ordering is
enforced by the scoring model, not by convention.

```
PLAN → SHOW UP → STUDY → COMPLETE → CHECK IN → EARN → BUILD STREAK → SEE PROGRESS → REPEAT
```

---

## Quick start

You need **Node 20.9+**. You do **not** need Postgres, Docker, or any cloud account to run
the app locally.

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open <http://localhost:3000>.

> **Note.** The embedded PGlite database is single-process: stop the dev server before
> running `db:seed`, `db:migrate` or `db:reset`, then start it again. This does not apply
> when `DATABASE_URL` points at a real Postgres.

The seed builds a realistic 27-student cohort with roadmaps, attendance, check-ins, points,
streaks, achievements and events — so the app is fully alive on first run.

| Role                         | Email                       | Password         |
| ---------------------------- | --------------------------- | ---------------- |
| Cohort lead (admin)          | `admin@dailyrounds.app`     | `roundsadmin123` |
| Strong student               | `sara.menon@example.edu`    | `roundsdemo123`  |
| Typical student              | `imran.qureshi@example.edu` | `roundsdemo123`  |
| Student needing intervention | `nikhil.varma@example.edu`  | `roundsdemo123`  |

Every seeded student uses the same password. Seed credentials are configurable — see
[Environment variables](#environment-variables).

---

## What's in the box

### For students

| Screen            | What it answers                                                       |
| ----------------- | --------------------------------------------------------------------- |
| **Home**          | What do I need to do today? How am I doing? What happens next?        |
| **Study session** | A real timer for the block you committed to, with pause and finish    |
| **Check-In**      | The 45-second daily ritual that records what actually happened        |
| **Roadmap**       | My own topic plan, organised by subject rather than by year group     |
| **Calendar**      | What was planned and what actually happened, day by day               |
| **Progress**      | Consistency, heatmap, week-by-week trend, achievements, points ledger |
| **Leaderboard**   | Where I stand — and five different ways to be recognised              |
| **Syllabus**      | The whole MBBS course — 19 subjects, searchable down to the node      |
| **Materials**     | Resources grouped by topic, plus optional knowledge checks            |
| **Profile**       | My details, my commitment, my account                                 |

### For the cohort lead

Overview with cohort health and a ranked "students needing attention" list · bulk attendance
marking · per-student deep dive with full history · roadmap builder with reorder and curated
templates · one-click daily topic assignment for the whole cohort · check-in review with
obstacle patterns · events and announcements · materials · cohort settings covering study
days, holidays, the Meet link, scoring values and risk thresholds · auditable score
corrections · end-of-cohort reports.

Everything an admin needs is in the UI. Running the cohort never requires touching the
database.

---

## Tech stack

| Layer        | Choice                                                                |
| ------------ | --------------------------------------------------------------------- |
| Framework    | Next.js 16 (App Router, React 19, Server Components + Server Actions) |
| Language     | TypeScript, `strict` with `noUncheckedIndexedAccess`                  |
| Styling      | Tailwind CSS v4 with a custom design system                           |
| Motion       | Framer Motion, plus CSS for anything correctness depends on           |
| Database     | PostgreSQL via Drizzle ORM                                            |
| Local dev DB | PGlite (embedded Postgres) — zero setup                               |
| Validation   | Zod                                                                   |
| Auth         | Session cookies + scrypt (`node:crypto`)                              |
| Tests        | Vitest (unit + integration against real Postgres semantics)           |

Two architectural decisions are load-bearing and worth reading before changing anything:
**source data vs derived metrics**, and **why the database driver is swappable**. Both are
written up in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Scripts

| Command               | Does                                                 |
| --------------------- | ---------------------------------------------------- |
| `npm run dev`         | Start the dev server                                 |
| `npm run build`       | Production build                                     |
| `npm start`           | Serve the production build                           |
| `npm test`            | Run the full test suite                              |
| `npm run test:watch`  | Tests in watch mode                                  |
| `npm run typecheck`   | `tsc --noEmit`                                       |
| `npm run lint`        | ESLint                                               |
| `npm run format`      | Prettier                                             |
| `npm run db:generate` | Generate a migration from schema changes             |
| `npm run db:migrate`  | Apply pending migrations                             |
| `npm run db:seed`     | Wipe and reseed the development cohort               |
| `npm run db:setup`    | Migrate then seed                                    |
| `npm run db:reset`    | Drop and recreate the schema (guarded in production) |

---

## Environment variables

Copy `.env.example` to `.env.local`. **Every variable is optional for local development.**

| Variable                | Default                 | Purpose                                                                                       |
| ----------------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | _(unset)_               | Postgres connection string. When unset, the app uses embedded PGlite. Required in production. |
| `DATABASE_POOL_MAX`     | `10`                    | Maximum pooled connections.                                                                   |
| `PGLITE_DATA_DIR`       | `.data/daily-rounds`    | Where the embedded dev database stores its files.                                             |
| `ALLOW_DB_RESET`        | `false`                 | Must be `true` before `db:reset` will touch a hosted database.                                |
| `SEED_TIMEZONE`         | `Asia/Kolkata`          | Cohort timezone used by the seeder.                                                           |
| `SEED_ADMIN_EMAIL`      | `admin@dailyrounds.app` | Seeded admin login.                                                                           |
| `SEED_ADMIN_PASSWORD`   | `roundsadmin123`        | Seeded admin password.                                                                        |
| `SEED_STUDENT_PASSWORD` | `roundsdemo123`         | Shared password for seeded students.                                                          |
| `SEED_MEET_URL`         | a placeholder           | Study-room link for the seeded cohort.                                                        |

No secret is ever read on the client. The Google Meet link, scoring values, study days,
holidays and risk thresholds all live in the database and are edited through the admin UI —
none of them are environment variables or constants in code.

---

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full walkthrough (Supabase + Vercel,
migrations, and opening your first real cohort). The short version:

1. Create a Supabase project, copy the **transaction-mode pooler** connection string.
2. Set `DATABASE_URL` in your hosting provider.
3. Run `npm run db:migrate` against it.
4. Deploy. Create your admin user and cohort as documented.

---

## Testing

```bash
npm test
```

123 tests covering the logic that would be expensive to get wrong:

- **Calendar** — day arithmetic, leap days, DST transitions, timezone boundaries at
  midnight, active-study-day resolution.
- **Streaks** — consecutive weekdays, Friday → Monday, weekend and holiday gaps, multiple
  consecutive holidays, missed days, first day, no activity, comeback, cohort start/end
  bounds, post-cohort reads.
- **Consistency** — denominators that exclude weekends and holidays, partial days, weekly
  progress, improvement, perfect weeks.
- **Points** — the behaviour/quiz separation that stops quiz scores dominating, day bands,
  idempotency key construction.
- **Risk** — each threshold, configurability, the Monday-morning false alarm, joining
  mid-cohort.
- **Permissions** — every guard for signed-out, student and admin callers, plus error
  handling that never leaks internals to the user.
- **Integration** (against real Postgres) — ledger idempotency under sequential _and_
  concurrent duplicate submission, admin corrections leaving history intact, attendance
  re-cutting, streak milestones paying exactly once, achievements unlocking once, check-in
  uniqueness.

---

## Project layout

```
src/
  app/                    Routes
    (auth)/               Sign in, sign up, password reset
    (app)/                Student experience (shared shell + bottom nav)
    admin/                Cohort lead console
    onboarding/           First-run wizard
  components/
    ui/                   Design system primitives
    gamification/         Streak flame, celebrations, confetti
    charts/               Heatmap, week columns, donut
    nav/, brand/, report/
  db/
    schema.ts             The relational schema
    client.ts             Lazy singleton database handle
    connection.ts         Driver selection (Postgres vs PGlite)
    scripts/              migrate, seed, reset
  lib/
    curriculum/           The 19-subject MBBS tree (generated) and its lookups
    domain/               Pure business logic — calendar, streak, consistency,
                          points, risk, achievements. No I/O, fully unit-tested.
    auth/                 Password hashing, sessions, route guards
    validation.ts         Zod schemas for every input
  server/
    context.ts            Loading a member/cohort with its calendar and rules
    scoring.ts            The points ledger and derived-metric writer
    queries/              Read models for pages
    actions/              Server actions (all mutations)
drizzle/                  SQL migrations
tools/curriculum/         Source text + scripts that regenerate the curriculum tree
tests/                    Unit and integration tests
docs/                     Architecture, curriculum and deployment notes
```

---

## Design notes

The interface is mobile-first — the students using it are on phones between postings — and
composes into a real dashboard from `lg` upward rather than a stretched phone layout.

### The colour system

Ramps are named for what they _mean_, not for their hue, so the whole product retunes from
one block in `globals.css`:

| Ramp             | Means     | Used for                                 |
| ---------------- | --------- | ---------------------------------------- |
| `pulse` (indigo) | acting    | primary buttons, active nav, focus rings |
| `iris` (violet)  | the plan  | roadmaps, topics, subjects               |
| `flame` (amber)  | a streak  | streaks and milestones, and nothing else |
| `citrus` (lime)  | earned    | XP, levels, values on saturated surfaces |
| `ink`            | structure | text, borders, surfaces                  |

`success` is a distinct green, so "done" never has to compete with "primary". Three rules
hold everywhere: hierarchy is built from surface, then scale, then colour; one accent per
surface; and colour on a statistic always carries meaning.

### Hierarchy

Cards are deliberately _not_ interchangeable — `solid` (a saturated gradient, at most one
per screen), `wash`, `surface`, `outline`, `glass`. A screen made of one variant twelve
times gives every piece of information the same weight, which is the same as giving none of
it any. Statistics get their own type scale with much tighter tracking, because a 56px
number set with body tracking reads as an accident rather than a decision.

### Motion

Motion confirms behaviour, never decorates. Anything a number depends on is driven by
authoritative CSS rather than an animation, so a throttled tab or an interrupted transition
can never leave a progress bar showing a figure that isn't true. Entrances are CSS with a
`both` fill, so content is readable on the first paint and nothing is gated on an animation
finishing. Reduced motion is respected throughout, and status is never communicated by
colour alone.

### Levels and leagues

Levels are a presentation layer over the points ledger, not a second currency: XP _is_ the
lifetime point total, so a level can never disagree with the ledger and there is nothing
extra to store. Leaderboard leagues band by consistency rather than points, because points
scale with time in the cohort and ranking by them would quietly reward seniority.
