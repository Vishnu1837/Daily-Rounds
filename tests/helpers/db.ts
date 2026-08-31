/**
 * Integration-test harness.
 *
 * Spins up an in-memory PGlite, applies the real migrations, and inserts the minimum
 * cohort needed to exercise scoring. These tests run against genuine Postgres semantics —
 * including the unique indexes that make the points ledger idempotent — rather than mocks,
 * because those constraints *are* the guarantee under test.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { db, dbExecute } from '@/db/client';
import * as schema from '@/db/schema';
import { buildCalendar, type ISODate } from '@/lib/domain/calendar';
import { DEFAULT_POINT_RULES } from '@/lib/domain/points';

let migrated = false;

export async function migrateTestDb(): Promise<void> {
  if (migrated) return;

  // Guard against ever running the suite against a real database. The connection is
  // resolved lazily, so this assertion runs before the first query is issued.
  if (process.env.DATABASE_URL || process.env.PGLITE_DATA_DIR !== 'memory://') {
    throw new Error(
      'Integration tests must run against an in-memory database. ' +
        'Check the `env` block in vitest.config.mts.',
    );
  }

  const dir = join(process.cwd(), 'drizzle');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf8').replaceAll('--> statement-breakpoint', '');
    await dbExecute(sql);
  }
  migrated = true;
}

export type TestCohort = Awaited<ReturnType<typeof createTestCohort>>;

let counter = 0;

/** Mon 2025-09-01 → Fri 2025-10-10, Mon–Fri, with Wed 17 Sep as a holiday. */
export async function createTestCohort(options?: {
  startDate?: ISODate;
  endDate?: ISODate;
  holidays?: ISODate[];
  activeWeekdays?: number[];
}) {
  await migrateTestDb();
  counter += 1;

  const startDate = options?.startDate ?? '2025-09-01';
  const endDate = options?.endDate ?? '2025-10-10';
  const holidays = options?.holidays ?? ['2025-09-17'];
  const activeWeekdays = options?.activeWeekdays ?? [1, 2, 3, 4, 5];

  const [cohort] = await db
    .insert(schema.cohorts)
    .values({
      name: `Test Cohort ${counter}`,
      slug: `test-cohort-${counter}`,
      timezone: 'Asia/Kolkata',
      startDate,
      endDate,
      activeWeekdays,
      streakThresholdPct: 70,
      meetUrl: 'https://meet.example.com/test',
    })
    .returning();

  for (const date of holidays) {
    await db
      .insert(schema.cohortHolidays)
      .values({ cohortId: cohort!.id, date, label: 'Test holiday' });
  }

  const calendar = buildCalendar({
    timezone: 'Asia/Kolkata',
    startDate,
    endDate,
    activeWeekdays,
    holidays,
  });

  return { cohort: cohort!, calendar, rules: DEFAULT_POINT_RULES };
}

export async function createTestMember(
  cohortId: string,
  overrides?: { fullName?: string; email?: string; role?: 'student' | 'admin' },
) {
  counter += 1;
  const [user] = await db
    .insert(schema.users)
    .values({
      email: overrides?.email ?? `student-${counter}@test.local`,
      fullName: overrides?.fullName ?? `Test Student ${counter}`,
      passwordHash: 'scrypt$1$1$1$AAAA$AAAA',
      role: overrides?.role ?? 'student',
      timezone: 'Asia/Kolkata',
    })
    .returning();

  const [member] = await db
    .insert(schema.cohortMembers)
    .values({ cohortId, userId: user!.id })
    .returning();

  return { user: user!, memberId: member!.id };
}

export { db, schema };
