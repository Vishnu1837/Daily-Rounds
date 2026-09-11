# Deployment

Daily Rounds runs anywhere Next.js and Postgres run. This walkthrough uses **Supabase** for
the database and **Vercel** for hosting, which is the cheapest sensible production setup for
a cohort of this size (both have free tiers that comfortably cover 27 students).

---

## 1. Create the database

1. Create a project at [supabase.com](https://supabase.com).
2. **Project Settings → Database → Connection string → Connection pooling**.
3. Copy the **Transaction** mode URI (port `6543`) and substitute your password:

```
postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

Use the pooler, not the direct connection (port 5432). Serverless functions open many
short-lived connections and will exhaust a direct connection limit. The app already sets
`prepare: false`, which transaction-mode pooling requires.

Any other Postgres works identically — Neon, RDS, Railway, or one you run yourself. Only the
connection string changes.

**Pick the region deliberately, and match it in `vercel.json`.** Every page here is
server-rendered against this database, so a request's cost is the number of round trips it
makes multiplied by the latency of one. Same-region that is a couple of milliseconds a trip;
across an ocean it is 200–300 ms, and the dashboard's handful of trips becomes a visible
second of blank screen. `vercel.json` pins the functions to `bom1` (Mumbai) to sit beside a
Supabase project in `ap-south-1` — if you host the database anywhere else, change that
entry to the matching Vercel region. It is the single largest performance setting in this
project, and no amount of query tuning compensates for getting it wrong.

---

## 2. Apply migrations

Run this from your machine, pointed at the production database:

```bash
DATABASE_URL="postgresql://..." npm run db:migrate
```

The runner applies every file in `drizzle/` in order and records what it has applied in
`__drizzle_migrations`, so it is safe to re-run and safe to run as a release step.

**Do not run `npm run db:seed` against production.** It truncates every table. It refuses to
run destructively only for `db:reset`, which additionally requires `ALLOW_DB_RESET=true`;
the seeder is a development tool and will happily wipe whatever you point it at.

---

## 3. Deploy

```bash
npm i -g vercel
vercel link
vercel env add DATABASE_URL production
vercel --prod
```

Or import the repository at [vercel.com/new](https://vercel.com/new) and add
`DATABASE_URL` under **Settings → Environment Variables**. No other variable is required in
production — everything else is configured through the admin UI.

Verify the build locally first:

```bash
npm run typecheck && npm test && npm run build
```

---

## 4. Open your first cohort

A fresh production database has no users, so `/admin` has nothing to show. Bootstrap it once
from your machine:

```bash
DATABASE_URL="postgresql://..." npx tsx -e "
import { db } from './src/db/client';
import { users, cohorts, pointRules } from './src/db/schema';
import { hashPassword } from './src/lib/auth/password';
import { DEFAULT_POINT_RULES } from './src/lib/domain/points';

const [admin] = await db.insert(users).values({
  email: 'you@yourdomain.com',
  fullName: 'Your Name',
  passwordHash: await hashPassword(process.env.ADMIN_PASSWORD!),
  role: 'admin',
  timezone: 'Asia/Kolkata',
  onboardingCompletedAt: new Date(),
}).returning();

const [cohort] = await db.insert(cohorts).values({
  name: 'Cohort 01',
  slug: 'cohort-01',
  timezone: 'Asia/Kolkata',
  startDate: '2026-01-05',
  endDate: '2026-02-13',
  activeWeekdays: [1, 2, 3, 4, 5],
  streakThresholdPct: 70,
  meetStartTime: '06:00',
  meetEndTime: '07:00',
}).returning();

await db.insert(pointRules).values(
  Object.entries(DEFAULT_POINT_RULES).map(([event, points]) => ({
    cohortId: cohort!.id, event: event as never, points,
  })),
);

console.log('Admin:', admin!.email, '· Cohort:', cohort!.name);
process.exit(0);
"
```

Set `ADMIN_PASSWORD` in your shell rather than inlining it, so it does not land in shell
history.

Then sign in and finish setup in the UI:

1. **Admin → Settings** — set the Google Meet link, study-room times, active weekdays, term
   dates, holidays, scoring values and risk thresholds.
2. **Admin → Students** — add each student with a temporary password, or send them to
   `/signup` and let them onboard themselves (they join the active cohort automatically).
3. **Admin → Roadmaps** — apply a curated template per student, or build one topic by topic.
4. **Admin → Roadmaps → Daily assignments** — "Assign next topic to everyone" each morning.
5. **Admin → Events** — schedule workshops, guest sessions and weekly reviews.

---

## 5. Running the cohort day to day

| When                 | Do                                                                     |
| -------------------- | ---------------------------------------------------------------------- |
| Each morning         | **Assign today's topics** (one click for the whole cohort)             |
| After the study room | **Mark attendance** — points are awarded or withdrawn immediately      |
| During the day       | Watch **Students needing attention** and message anyone flagged        |
| Each evening         | Skim **Check-ins** for obstacle patterns worth acting on               |
| Weekly               | Post an **announcement**; students get their weekly review from Friday |
| End of cohort        | Open each student's **end-of-cohort report**                           |

Adding a holiday, changing the active weekdays, or editing the term dates recalculates every
student's streak and consistency automatically. **Recalculate** on the overview rebuilds
every derived metric from source records if you ever need it.

---

## 6. Hosted textbooks (Cloudflare R2)

Textbooks uploaded under **Admin → Materials → Upload textbook** live in a private R2
bucket. Students read them in the in-app reader; the file itself is never given a public
URL, and every page the reader fetches is checked against the student's membership, so
setting someone to _paused_ or _left_ locks them out on their next page turn. R2's free tier
is 10 GB of storage with no charge for downloads.

1. **Create the bucket.** Cloudflare dashboard → **R2** → **Create bucket**, e.g.
   `daily-rounds-textbooks`. Leave **Public access** off — do not add a custom domain or
   enable the `r2.dev` URL.
2. **Create an API token.** R2 → **Manage R2 API Tokens** → **Create API token** with
   **Object Read & Write**, scoped to that one bucket. Note the Access Key ID and Secret.
3. **Allow uploads from the site.** The admin's browser sends the file straight to R2, so the
   bucket needs a CORS rule. Bucket → **Settings** → **CORS policy**:

   ```json
   [
     {
       "AllowedOrigins": ["https://your-domain.com", "http://localhost:3000"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Only `PUT` is allowed from the browser. Reads go through the app, never to R2 directly.

4. **Add four environment variables** to the deployment (your account ID is on the R2
   overview page):

   ```bash
   vercel env add R2_ACCOUNT_ID production
   vercel env add R2_BUCKET production
   vercel env add R2_ACCESS_KEY_ID production
   vercel env add R2_SECRET_ACCESS_KEY production
   ```

Without them, production shows "Textbook storage is not set up yet" on upload. Local
development without them stores uploads under `.data/textbooks` instead, so the feature
works on a laptop with no Cloudflare account.

**What the reader does and does not prevent.** There is no download button, no text to
copy, and printing and Ctrl+S are blocked; the file URL answers 404 to anything but the
reader. Every page is also stamped with the reader's name and email, drawn into the page
image itself. Nothing on a screen can be protected from a screenshot or a phone camera —
the watermark is what makes a leaked page traceable to whoever leaked it.

---

## Upgrading

Schema changes:

```bash
# 1. Edit src/db/schema.ts
npm run db:generate     # writes a new file to drizzle/
# 2. Review the generated SQL, then commit it
DATABASE_URL="postgresql://..." npm run db:migrate
```

Always read the generated SQL before applying it. Drizzle occasionally proposes a
drop-and-recreate where an `ALTER` was intended.

---

## Operational notes

**Backups.** Supabase takes daily backups on paid plans. On the free tier, take your own:

```bash
pg_dump "$DATABASE_URL" > backup-$(date +%F).sql
```

The points ledger is append-only, so a restore loses no history beyond the restore point.

**Timezones.** The cohort's timezone determines what "today" means for every student —
scoring, streaks and the leaderboard. It is stored on the cohort row and is editable in
Settings. Individual students have their own timezone for display, but **scoring always uses
the cohort's**, so everyone's day rolls over at the same moment.

**Health check.** After deploying, confirm:

- `/login` renders (the app is up)
- signing in as admin reaches `/admin` (database is reachable and migrated)
- the overview shows your student count (derived metrics are computing)

**Scaling.** The cohort is 27 students, but nothing is tied to that. Leaderboard and admin
queries are set-based (a fixed handful of queries regardless of cohort size), every hot path
is indexed, and `daily_activity` keeps the heatmap and standings to single scans. The natural
first bottleneck would be per-member loops in `recomputeCohort`, which is an explicit admin
action rather than a request-path operation.

**Cost.** For one cohort: Vercel Hobby and Supabase Free are sufficient. The application
holds no media and stores only external links for materials, so storage stays negligible.
