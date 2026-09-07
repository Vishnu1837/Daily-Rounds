/**
 * Reports what the excused-attendance rule changes, per student, without writing anything.
 *
 * Run once after 0015 to see exactly who the old rule was penalising:
 *   npx tsx src/db/scripts/excused-impact.ts
 */
import { loadEnv } from './env';

loadEnv();

async function main() {
  const { db, closeDb } = await import('../client');
  const { and, asc, eq, gte, inArray, lte } = await import('drizzle-orm');
  const { cohortExtraStudyDays, cohortHolidays, cohortMembers, cohorts, dailyActivity, users } =
    await import('../schema');
  const { buildCalendar, todayInTimezone } = await import('@/lib/domain/calendar');
  const { calculateRiskStatus } = await import('@/lib/domain/risk');
  const { calculateCurrentStreak } = await import('@/lib/domain/streak');
  const { DEFAULT_RISK_THRESHOLDS } = await import('@/lib/domain/risk');

  const [cohort] = await db.select().from(cohorts).orderBy(asc(cohorts.createdAt)).limit(1);
  if (!cohort) throw new Error('no cohort');

  // Built here rather than through `getCohortContext`, whose caching needs a Next request.
  const [holidays, extras] = await Promise.all([
    db
      .select({ date: cohortHolidays.date })
      .from(cohortHolidays)
      .where(eq(cohortHolidays.cohortId, cohort.id)),
    db
      .select({ date: cohortExtraStudyDays.date })
      .from(cohortExtraStudyDays)
      .where(eq(cohortExtraStudyDays.cohortId, cohort.id)),
  ]);
  const calendar = buildCalendar({
    timezone: cohort.timezone,
    startDate: cohort.startDate,
    endDate: cohort.endDate,
    activeWeekdays: cohort.activeWeekdays,
    holidays: holidays.map((h) => h.date),
    extraStudyDays: extras.map((e) => e.date),
  });
  const today = todayInTimezone(cohort.timezone);
  // Inlined from `thresholdsFor`, which lives behind `server-only`.
  const s = cohort.settings ?? {};
  const thresholds = {
    ...DEFAULT_RISK_THRESHOLDS,
    atRiskMissedDays: s.atRiskMissedDays ?? DEFAULT_RISK_THRESHOLDS.atRiskMissedDays,
    interventionMissedDays:
      s.interventionMissedDays ?? DEFAULT_RISK_THRESHOLDS.interventionMissedDays,
    atRiskConsistencyDropPct:
      s.atRiskConsistencyDropPct ?? DEFAULT_RISK_THRESHOLDS.atRiskConsistencyDropPct,
    minConsistencyPct: s.minConsistencyPct ?? DEFAULT_RISK_THRESHOLDS.minConsistencyPct,
  };

  const members = await db
    .select({ id: cohortMembers.id, name: users.fullName })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(and(eq(cohortMembers.cohortId, cohort.id), eq(cohortMembers.status, 'active')))
    .orderBy(asc(users.fullName));

  const rows = await db
    .select()
    .from(dailyActivity)
    .where(
      and(
        inArray(
          dailyActivity.memberId,
          members.map((m) => m.id),
        ),
        gte(dailyActivity.date, calendar.startDate),
        lte(dailyActivity.date, today),
      ),
    );

  const byMember = new Map<string, Map<string, (typeof rows)[number]>>();
  for (const r of rows) {
    if (!byMember.has(r.memberId)) byMember.set(r.memberId, new Map());
    byMember.get(r.memberId)!.set(r.date, r);
  }

  console.log(`Cohort ${cohort.name} · ${today}\n`);
  let changed = 0;

  for (const m of members) {
    const days = byMember.get(m.id) ?? new Map();
    const lookup = (d: string) => {
      const row = days.get(d);
      return row
        ? {
            date: d,
            showedUp: row.showedUp,
            excused: row.attendanceExcused,
            score: row.scorePct / 100,
            studyMinutes: row.studyMinutes,
            points: row.points,
          }
        : undefined;
    };
    const lookupOld = (d: string) => {
      const rec = lookup(d);
      return rec ? { ...rec, excused: false } : undefined;
    };
    const showedUp = (d: string) => days.get(d)?.showedUp ?? false;
    const excused = (d: string) => days.get(d)?.attendanceExcused ?? false;

    const before = calculateRiskStatus({
      calendar,
      lookup: lookupOld,
      showedUp,
      today,
      thresholds,
    });
    const after = calculateRiskStatus({
      calendar,
      lookup,
      showedUp,
      excused,
      today,
      thresholds,
    });
    const streakBefore = calculateCurrentStreak(calendar, showedUp, today).length;
    const streakAfter = calculateCurrentStreak(calendar, showedUp, today, excused).length;
    const excusedDays = [...days.values()].filter((r) => r.attendanceExcused).length;

    if (before.level !== after.level || streakBefore !== streakAfter) {
      changed += 1;
      console.log(
        `${m.name.padEnd(24)} risk ${before.level} → ${after.level}` +
          ` · missed ${before.missedActiveDays} → ${after.missedActiveDays}` +
          ` · streak ${streakBefore} → ${streakAfter}` +
          ` · ${excusedDays} excused day(s)`,
      );
    }
  }

  console.log(`\n${changed} of ${members.length} students change.`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
