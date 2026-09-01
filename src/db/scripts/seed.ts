import { loadEnv } from './env';
import { assertDestructiveTargetAllowed } from './guard';

loadEnv();
assertDestructiveTargetAllowed('db:seed');

import { sql } from 'drizzle-orm';

import {
  type ISODate,
  activeStudyDaysBetween,
  addDays,
  buildCalendar,
  todayInTimezone,
  weekStart,
} from '@/lib/domain/calendar';
import { bestRefMatch } from '@/lib/curriculum';
import { DEFAULT_POINT_RULES, ledgerKey, quizPoints } from '@/lib/domain/points';
import { hashPassword } from '@/lib/auth/password';
import { generateRoadmapForSubject } from '@/lib/roadmap/generate';
import { type Challenge } from '@/lib/validation';

import {
  ANNOUNCEMENTS,
  MATERIALS,
  QUIZ_BANK,
  ROADMAP_TEMPLATES,
  SEED_STUDENTS,
  SUBJECTS,
  type Archetype,
} from './seed-data';

/**
 * The subject each legacy seed template belonged to.
 *
 * Seed rows still name a template key because that is how the 28 fixtures were written; the
 * roadmap they produce now comes from the syllabus, so all the key has to do is name a
 * subject. Kept as an explicit table rather than read off the template, so deleting the
 * curated templates later does not silently change the demo data.
 */
const SEED_TEMPLATE_SUBJECT: Record<string, string> = {
  general_pathology: 'pathology',
  systemic_pathology: 'pathology',
  pharmacology_core: 'pharmacology',
  medicine_clinical: 'general-medicine',
  anatomy_upper_limb: 'anatomy',
  physiology_core: 'physiology',
  microbiology_core: 'microbiology',
  obgyn_core: 'obgyn',
};

/** Plausible multi-select challenge answers per archetype, for the admin student view. */
const SEED_CHALLENGES: Record<Archetype, Challenge[]> = {
  exemplary: ['consistency'],
  strong: ['procrastination', 'distractions'],
  steady: ['poor_time_management'],
  improving: ['low_motivation', 'dont_know_where_to_start'],
  declining: ['sticking_to_plans', 'distractions'],
  comeback: ['backlogs', 'low_motivation'],
  at_risk: ['procrastination', 'backlogs', 'sticking_to_plans'],
  struggling: ['consistency', 'procrastination', 'backlogs', 'low_motivation'],
};

const TZ = process.env.SEED_TIMEZONE ?? 'Asia/Kolkata';
const COHORT_WEEKS = 6;
const STUDENT_PASSWORD = process.env.SEED_STUDENT_PASSWORD ?? 'roundsdemo123';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@dailyrounds.app';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'roundsadmin123';

/** Deterministic PRNG so a reseed produces the same demo cohort. */
function makeRng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

type DayPlan = {
  missed: boolean;
  attendance: 'present' | 'late' | 'absent';
  completedBlock: boolean;
  completedTarget: boolean;
  checkedIn: boolean;
  plannedTomorrow: boolean;
  reflected: boolean;
  minutes: number;
  completion: 'completed' | 'partial' | 'none';
  satisfaction: number;
};

/** Intensity curve per archetype — how likely a full day is at this point in the cohort. */
function intensity(archetype: Archetype, index: number, total: number): number {
  const progress = total <= 1 ? 1 : index / (total - 1);
  const fromEnd = total - 1 - index;
  switch (archetype) {
    case 'exemplary':
      return 0.96;
    case 'strong':
      return 0.86;
    case 'steady':
      return 0.72;
    case 'improving':
      return 0.3 + 0.6 * progress;
    case 'declining':
      return 0.92 - 0.5 * progress;
    case 'comeback':
      // A clear break mid-cohort, then a stronger return.
      if (fromEnd >= 5 && fromEnd <= 7) return 0;
      return fromEnd < 5 ? 0.94 : 0.8;
    case 'at_risk':
      // Solid until the last couple of active days.
      return fromEnd <= 1 ? 0 : 0.82;
    case 'struggling':
      return fromEnd <= 2 ? 0.1 : 0.3;
  }
}

function planDay(
  archetype: Archetype,
  index: number,
  total: number,
  rng: () => number,
  targetMinutes: number,
): DayPlan {
  const p = intensity(archetype, index, total);
  const missed = p === 0 || rng() > p;

  if (missed) {
    return {
      missed: true,
      attendance: 'absent',
      completedBlock: false,
      completedTarget: false,
      checkedIn: false,
      plannedTomorrow: false,
      reflected: false,
      minutes: 0,
      completion: 'none',
      satisfaction: 2,
    };
  }

  const attendRoll = rng();
  const attendance: DayPlan['attendance'] =
    attendRoll < p - 0.12 ? 'present' : attendRoll < p + 0.15 ? 'late' : 'absent';

  const completedBlock = rng() < p + 0.1;
  const completedTarget = completedBlock && rng() < p;
  const checkedIn = rng() < p + 0.2;
  const plannedTomorrow = checkedIn && rng() < p + 0.05;
  const reflected = checkedIn && rng() < p - 0.15;

  const ratio = completedTarget ? 1 + (rng() - 0.4) * 0.3 : 0.4 + rng() * 0.5;
  const minutes = Math.max(10, Math.round((targetMinutes * ratio) / 5) * 5);

  return {
    missed: false,
    attendance,
    completedBlock,
    completedTarget,
    checkedIn,
    plannedTomorrow,
    reflected,
    minutes,
    completion: completedTarget ? 'completed' : completedBlock ? 'partial' : 'none',
    satisfaction: completedTarget ? (rng() < 0.6 ? 5 : 4) : completedBlock ? 3 : 2,
  };
}

const STUDY_DESCRIPTIONS = [
  'Read the chapter, made a one-page summary and drew the flow diagram from memory.',
  'Watched the lecture at 1.5x, then wrote out the mechanism without looking.',
  'Did 30 MCQs on the topic and reviewed every wrong answer properly.',
  'Made revision cards for the classification and tested myself twice.',
  'Went through the slides and annotated the histology images.',
  'Read the standard text and compared it against my class notes.',
  'Explained the topic out loud to a friend — found three gaps and fixed them.',
  'Drew the pathway three times until I could do it without the book.',
];

const OBSTACLE_NOTES: Record<string, string> = {
  procrastination: 'Kept pushing the start time back until it was too late.',
  social_media: 'Opened Instagram "for five minutes" at 9 PM.',
  sleep: 'Slept through the alarm and never caught up.',
  classes: 'Postings ran long and I was too tired afterwards.',
  unclear_what_to_study: 'Spent too long deciding what to start with.',
  lack_of_motivation: 'Just could not get myself to sit down.',
  personal: 'Family commitment came up.',
  other: 'Unexpected disruption to the day.',
};

async function main() {
  const { db, dbDriver, dbExecute, closeDb } = await import('../client');
  const schema = await import('../schema');

  console.log(`→ seeding (driver: ${dbDriver()}, timezone: ${TZ})`);

  // ---------------------------------------------------------------- reset
  await dbExecute(`
    TRUNCATE TABLE
      audit_log, weekly_reviews, announcements, materials, quiz_attempts, quiz_questions,
      quizzes, student_achievements, daily_activity, points_ledger, point_rules, check_ins,
      attendance, events, study_sessions, daily_assignments, roadmap_topics, roadmap_weeks,
      roadmaps, student_goals, cohort_members, cohort_extra_study_days, cohort_holidays,
      cohorts, subjects, password_reset_tokens, auth_sessions, users
    RESTART IDENTITY CASCADE;
  `);

  // ------------------------------------------------------------- subjects
  const subjectRows = await db
    .insert(schema.subjects)
    .values(SUBJECTS.map((s) => ({ name: s.name, slug: s.slug, accent: s.accent })))
    .returning();
  const subjectBySlug = new Map(subjectRows.map((s) => [s.slug, s]));
  console.log(`  ✓ ${subjectRows.length} subjects`);

  // --------------------------------------------------------------- cohort
  const today = todayInTimezone(TZ);
  const startDate = weekStart(addDays(today, -(COHORT_WEEKS - 2) * 7));
  const endDate = addDays(startDate, COHORT_WEEKS * 7 - 3);

  const holidayDate = addDays(startDate, 16); // a Wednesday in week 3
  const extraStudyDate = addDays(startDate, 12); // a Saturday catch-up in week 2

  const [cohort] = await db
    .insert(schema.cohorts)
    .values({
      name: 'Cohort 01',
      slug: 'cohort-01',
      timezone: TZ,
      startDate,
      endDate,
      activeWeekdays: [1, 2, 3, 4, 5],
      streakThresholdPct: 70,
      meetUrl: process.env.SEED_MEET_URL ?? 'https://meet.google.com/dry-rnds-001',
      meetStartTime: '06:00',
      meetEndTime: '07:00',
      settings: {
        atRiskMissedDays: 2,
        interventionMissedDays: 3,
        atRiskConsistencyDropPct: 15,
        minConsistencyPct: 40,
      },
      isActive: true,
    })
    .returning();

  if (!cohort) throw new Error('Failed to create cohort');

  await db.insert(schema.cohortHolidays).values({
    cohortId: cohort.id,
    date: holidayDate,
    label: 'College festival — no study room',
  });
  await db.insert(schema.cohortExtraStudyDays).values({
    cohortId: cohort.id,
    date: extraStudyDate,
    label: 'Saturday catch-up session',
  });

  await db.insert(schema.pointRules).values(
    (Object.keys(DEFAULT_POINT_RULES) as (keyof typeof DEFAULT_POINT_RULES)[]).map((event) => ({
      cohortId: cohort.id,
      event,
      points: DEFAULT_POINT_RULES[event],
    })),
  );

  const calendar = buildCalendar({
    timezone: TZ,
    startDate,
    endDate,
    activeWeekdays: [1, 2, 3, 4, 5],
    holidays: [holidayDate],
    extraStudyDays: [extraStudyDate],
  });

  const elapsedDays = activeStudyDaysBetween(calendar, startDate, today);
  console.log(
    `  ✓ Cohort 01 · ${startDate} → ${endDate} · ${elapsedDays.length} active study days so far`,
  );

  // ---------------------------------------------------------------- users
  const studentHash = await hashPassword(STUDENT_PASSWORD);
  const adminHash = await hashPassword(ADMIN_PASSWORD);

  const [admin] = await db
    .insert(schema.users)
    .values({
      email: ADMIN_EMAIL,
      passwordHash: adminHash,
      fullName: 'Mohammed Imran Sujad',
      role: 'admin',
      timezone: TZ,
      avatarSeed: 'anitha',
      university: 'Daily Rounds',
      onboardingCompletedAt: new Date(),
    })
    .returning();
  if (!admin) throw new Error('Failed to create admin');

  const userRows = await db
    .insert(schema.users)
    .values(
      SEED_STUDENTS.map((s) => ({
        email: s.email,
        passwordHash: studentHash,
        fullName: s.fullName,
        whatsapp: `+91 9${String(4000000000 + ((s.email.length * 7919) % 999999999)).slice(0, 9)}`,
        university: s.university,
        mbbsYear: s.mbbsYear,
        role: 'student' as const,
        timezone: TZ,
        avatarSeed: s.fullName.split(' ')[0]!.toLowerCase(),
        onboardingCompletedAt: new Date(),
      })),
    )
    .returning();

  const memberRows = await db
    .insert(schema.cohortMembers)
    .values(
      userRows.map((u) => ({
        cohortId: cohort.id,
        userId: u.id,
        status: 'active' as const,
      })),
    )
    .returning();

  const memberByEmail = new Map<string, string>();
  userRows.forEach((u, i) => memberByEmail.set(u.email, memberRows[i]!.id));
  console.log(`  ✓ ${userRows.length} students + 1 admin`);

  // ---------------------------------------------------- goals and roadmaps
  const topicsByMember = new Map<string, { id: string; title: string; ref: string | null }[]>();

  for (const student of SEED_STUDENTS) {
    const memberId = memberByEmail.get(student.email)!;
    const primarySlug = SEED_TEMPLATE_SUBJECT[student.roadmap]!;
    // A deterministic second subject so every seeded student exercises both slots, which is
    // what the product actually ships. Offset by 7 in course order to avoid pairing two
    // subjects from the same phase, and never the primary itself.
    const primaryIndex = SUBJECTS.findIndex((s) => s.slug === primarySlug);
    const secondarySlug = SUBJECTS[(primaryIndex + 7) % SUBJECTS.length]!.slug;

    const primary = subjectBySlug.get(primarySlug)!;
    const secondary = subjectBySlug.get(secondarySlug)!;

    await db.insert(schema.studentGoals).values({
      memberId,
      primarySubjectId: primary.id,
      secondarySubjectId: secondary.id,
      cohortGoal: student.goal,
      dailyCommitmentMinutes: student.dailyMinutes,
      examName: student.exam ?? null,
      examDate: student.exam ? addDays(endDate, 10) : null,
      baselineDaysStudiedLastWeek: student.baselineDays,
      baselineConsistencyRating: student.baselineConsistency,
      baselineConfidence: student.baselineConfidence,
      biggestObstacle: student.obstacle,
      challenges: SEED_CHALLENGES[student.archetype],
    });

    const memberTopics: { id: string; title: string; ref: string | null; position: number }[] = [];

    for (const [slot, subject] of [
      ['primary', primary],
      ['secondary', secondary],
    ] as const) {
      // Straight from the master syllabus — the seed uses the same generator the app does,
      // so a seeded roadmap and a real one can never drift apart.
      const generated = generateRoadmapForSubject(subject.slug)!;

      const [roadmap] = await db
        .insert(schema.roadmaps)
        .values({
          memberId,
          subjectId: subject.id,
          slot,
          title: generated.title,
          track: generated.track,
          curriculumRef: generated.subjectSlug,
        })
        .returning();

      const weekRows = await db
        .insert(schema.roadmapWeeks)
        .values(
          generated.weeks.map((w) => ({
            roadmapId: roadmap!.id,
            weekNumber: w.weekNumber,
            title: w.title,
          })),
        )
        .returning();

      const weekIdByNumber = new Map(weekRows.map((w) => [w.weekNumber, w.id]));

      const topicValues = generated.weeks.flatMap((w) =>
        w.topics.map((t) => ({
          roadmapId: roadmap!.id,
          weekId: weekIdByNumber.get(w.weekNumber)!,
          title: t.title,
          curriculumRef: t.ref,
          description: t.description,
          position: t.position,
          estimatedMinutes: student.dailyMinutes,
        })),
      );

      const topicRows = await db.insert(schema.roadmapTopics).values(topicValues).returning();

      // Only the primary subject drives the seeded study history, so the demo data reads
      // the way a real month does: one subject carried most days, the other picked up.
      if (slot === 'primary') {
        memberTopics.push(
          ...topicRows.map((t) => ({
            id: t.id,
            title: t.title,
            ref: t.curriculumRef,
            position: t.position,
          })),
        );
      }
    }

    topicsByMember.set(
      memberId,
      memberTopics
        .sort((a, b) => a.position - b.position)
        .map((t) => ({ id: t.id, title: t.title, ref: t.ref })),
    );
  }
  console.log(`  ✓ ${SEED_STUDENTS.length} students × 2 syllabus-generated roadmaps`);

  // ----------------------------------------------------- events & materials
  const eventValues: (typeof schema.events.$inferInsert)[] = [
    {
      cohortId: cohort.id,
      type: 'workshop',
      title: 'LinkedIn for Medical Students',
      description:
        'Building a profile that actually helps with electives and research applications.',
      date: addDays(startDate, 12),
      startTime: '19:00',
      endTime: '20:30',
      meetUrl: 'https://meet.google.com/dry-rnds-linkedin',
    },
    {
      cohortId: cohort.id,
      type: 'guest_session',
      title: 'Guest Session — Life as an Intern',
      description:
        'A recent graduate on what the first six months of internship actually look like.',
      date: addDays(startDate, 19),
      startTime: '19:00',
      endTime: '20:00',
      meetUrl: 'https://meet.google.com/dry-rnds-guest',
    },
    {
      cohortId: cohort.id,
      type: 'workshop',
      title: 'Productivity Session — Beating the 9 PM Slump',
      description: 'Practical routines for studying after a full day of postings.',
      date: addDays(startDate, 26),
      startTime: '19:00',
      endTime: '20:00',
      meetUrl: 'https://meet.google.com/dry-rnds-productivity',
    },
    {
      cohortId: cohort.id,
      type: 'assessment',
      title: 'Mid-Cohort Knowledge Check',
      description: 'A short, low-stakes check across everyone’s current subject.',
      date: addDays(startDate, 24),
      startTime: '20:00',
      endTime: '20:45',
    },
  ];

  // A weekly review event every Friday of the cohort.
  for (let w = 0; w < COHORT_WEEKS; w++) {
    const friday = addDays(startDate, w * 7 + 4);
    if (friday > endDate) break;
    eventValues.push({
      cohortId: cohort.id,
      type: 'weekly_review',
      title: `Week ${w + 1} Review`,
      description: 'Look back at the week, then set next week’s commitment.',
      date: friday,
      startTime: '20:00',
      endTime: '20:30',
      meetUrl: cohort.meetUrl,
    });
  }

  await db.insert(schema.events).values(eventValues);

  await db.insert(schema.materials).values(
    MATERIALS.map((m) => ({
      cohortId: cohort.id,
      subjectId: subjectBySlug.get(m.subject)?.id ?? null,
      curriculumRef: m.curriculumRef,
      title: m.title,
      description: m.description,
      type: m.type,
      url: m.url,
    })),
  );

  await db.insert(schema.announcements).values(
    ANNOUNCEMENTS.map((a) => ({
      cohortId: cohort.id,
      title: a.title,
      body: a.body,
      isPinned: a.isPinned,
      createdBy: admin.id,
    })),
  );
  console.log(`  ✓ ${eventValues.length} events, ${MATERIALS.length} materials, announcements`);

  // --------------------------------------------------------------- quizzes
  const seededQuizzes: { id: string; curriculumRef: string }[] = [];
  for (const quiz of QUIZ_BANK) {
    const [row] = await db
      .insert(schema.quizzes)
      .values({
        subjectId: subjectBySlug.get(quiz.subject)?.id ?? null,
        curriculumRef: quiz.curriculumRef,
        title: quiz.title,
      })
      .returning();
    await db.insert(schema.quizQuestions).values(
      quiz.questions.map((q) => ({
        quizId: row!.id,
        prompt: q.prompt,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
      })),
    );
    seededQuizzes.push({ id: row!.id, curriculumRef: quiz.curriculumRef });
  }
  console.log(`  ✓ ${QUIZ_BANK.length} quizzes`);

  // ------------------------------------------------- behaviour generation
  const rules = DEFAULT_POINT_RULES;
  const assignments: (typeof schema.dailyAssignments.$inferInsert)[] = [];
  const sessions: (typeof schema.studySessions.$inferInsert)[] = [];
  const attendanceRows: (typeof schema.attendance.$inferInsert)[] = [];
  const checkInRows: (typeof schema.checkIns.$inferInsert)[] = [];
  const ledger: (typeof schema.pointsLedger.$inferInsert)[] = [];
  const completedTopicIds = new Set<string>();
  const quizAttemptRows: (typeof schema.quizAttempts.$inferInsert)[] = [];
  const weeklyReviewRows: (typeof schema.weeklyReviews.$inferInsert)[] = [];

  // Assignments run one day past today so students always have a plan for tomorrow.
  const planningHorizon = activeStudyDaysBetween(calendar, startDate, addDays(today, 7));

  for (const student of SEED_STUDENTS) {
    const memberId = memberByEmail.get(student.email)!;
    const topics = topicsByMember.get(memberId)!;
    const rng = makeRng(student.email);

    let topicCursor = 0;
    let comebackPending = false;
    let lastMissed = false;

    for (let i = 0; i < planningHorizon.length; i++) {
      const date = planningHorizon[i]!;
      const topic = topics[Math.min(topicCursor, topics.length - 1)]!;

      assignments.push({
        memberId,
        date,
        topicId: topic.id,
        plannedMinutes: student.dailyMinutes,
      });

      // Only generate history for days that have actually happened.
      if (date > today) continue;

      const plan = planDay(student.archetype, i, elapsedDays.length, rng, student.dailyMinutes);
      const isToday = date === today;

      if (plan.missed) {
        attendanceRows.push({
          memberId,
          date,
          status: 'absent',
          markedBy: admin.id,
        });
        lastMissed = true;
        comebackPending = true;
        continue;
      }

      // ---- attendance
      attendanceRows.push({
        memberId,
        date,
        status: plan.attendance,
        markedBy: admin.id,
      });
      if (plan.attendance !== 'absent') {
        const event = plan.attendance === 'present' ? 'live_session_present' : 'live_session_late';
        ledger.push({
          memberId,
          event,
          points: rules[event],
          occurredOn: date,
          idempotencyKey: ledgerKey.attendance(memberId, date),
          reason: plan.attendance === 'present' ? 'Attended the study room' : 'Joined late',
        });
      }

      // ---- study session
      if (plan.completedBlock) {
        const startedAt = new Date(`${date}T02:00:00.000Z`); // ~07:30 IST
        sessions.push({
          memberId,
          date,
          topicId: topic.id,
          plannedMinutes: student.dailyMinutes,
          elapsedSeconds: plan.minutes * 60,
          status: 'completed',
          startedAt,
          endedAt: new Date(startedAt.getTime() + plan.minutes * 60_000),
        });
        ledger.push({
          memberId,
          event: 'study_block_completed',
          points: rules.study_block_completed,
          occurredOn: date,
          idempotencyKey: ledgerKey.daily('study_block_completed', memberId, date),
          reason: 'Completed the planned study block',
        });
      }

      // ---- target completion advances the roadmap
      if (plan.completedTarget) {
        ledger.push({
          memberId,
          event: 'daily_target_completed',
          points: rules.daily_target_completed,
          occurredOn: date,
          idempotencyKey: ledgerKey.daily('daily_target_completed', memberId, date),
          reason: topic.title,
        });
        completedTopicIds.add(topic.id);
        topicCursor = Math.min(topicCursor + 1, topics.length - 1);
      }

      // ---- check-in
      if (plan.checkedIn) {
        checkInRows.push({
          memberId,
          date,
          completion: plan.completion,
          actualMinutes: plan.minutes,
          whatStudied: `${topic.title} — ${STUDY_DESCRIPTIONS[Math.floor(rng() * STUDY_DESCRIPTIONS.length)]}`,
          obstacle: plan.completion === 'completed' ? 'none' : student.obstacle,
          obstacleNote:
            plan.completion === 'completed' ? null : (OBSTACLE_NOTES[student.obstacle] ?? null),
          tomorrowTarget: plan.plannedTomorrow
            ? `${topics[Math.min(topicCursor, topics.length - 1)]!.title} — ${student.dailyMinutes} minutes`
            : null,
          satisfaction: plan.satisfaction,
          reflection: plan.reflected
            ? 'The early start made the difference. Keeping the same slot tomorrow.'
            : null,
          isComeback: comebackPending && lastMissed,
          comebackReason:
            comebackPending && lastMissed
              ? (OBSTACLE_NOTES[student.obstacle] ?? 'Lost the routine for a day.')
              : null,
        });

        ledger.push({
          memberId,
          event: 'daily_check_in',
          points: rules.daily_check_in,
          occurredOn: date,
          idempotencyKey: ledgerKey.daily('daily_check_in', memberId, date),
        });

        if (plan.plannedTomorrow) {
          ledger.push({
            memberId,
            event: 'tomorrow_plan',
            points: rules.tomorrow_plan,
            occurredOn: date,
            idempotencyKey: ledgerKey.daily('tomorrow_plan', memberId, date),
          });
        }
        if (plan.reflected) {
          ledger.push({
            memberId,
            event: 'reflection',
            points: rules.reflection,
            occurredOn: date,
            idempotencyKey: ledgerKey.daily('reflection', memberId, date),
          });
        }
      }

      // ---- occasional knowledge check
      // Matched through the curriculum, the same way the app does it at runtime.
      const quiz = bestRefMatch(topic.ref, seededQuizzes);
      const quizId = quiz?.id ?? null;
      if (quizId && !isToday && rng() < 0.25) {
        const total = 5;
        const score = 2 + Math.floor(rng() * 4);
        const capped = Math.min(score, total);
        quizAttemptRows.push({
          memberId,
          quizId,
          date,
          score: capped,
          total,
          answers: Array.from({ length: total }, () => Math.floor(rng() * 4)),
        });
        const { attempt, bonus } = quizPoints(capped, total, rules);
        ledger.push({
          memberId,
          event: 'quiz_attempt',
          points: attempt,
          occurredOn: date,
          idempotencyKey: ledgerKey.quizAttempt(memberId, quizId, date),
        });
        if (bonus > 0) {
          ledger.push({
            memberId,
            event: 'quiz_bonus',
            points: bonus,
            occurredOn: date,
            idempotencyKey: ledgerKey.quizBonus(memberId, quizId, date),
            metadata: { score: capped, total },
          });
        }
      }

      lastMissed = false;
      comebackPending = false;
    }

    // ---- weekly reviews for completed weeks
    for (let w = 0; w < COHORT_WEEKS; w++) {
      const ws = addDays(weekStart(startDate), w * 7);
      if (addDays(ws, 6) >= today) break;
      if (rng() < 0.35) continue;
      weeklyReviewRows.push({
        memberId,
        weekStart: ws,
        whatWentWell:
          'Morning study room kept me honest — the days I joined it, I finished the block.',
        whatStopped: OBSTACLE_NOTES[student.obstacle] ?? 'Lost momentum in the middle of the week.',
        whatToChange: 'Cutting the daily target by 15 minutes so I actually finish it.',
        subjectConfidence: Math.min(5, student.baselineConfidence + 1 + (w > 1 ? 1 : 0)),
      });
      ledger.push({
        memberId,
        event: 'weekly_review',
        points: rules.weekly_review,
        occurredOn: addDays(ws, 4),
        idempotencyKey: ledgerKey.weeklyReview(memberId, ws),
      });
    }
  }

  await insertChunked(db, schema.dailyAssignments, assignments);
  await insertChunked(db, schema.studySessions, sessions);
  await insertChunked(db, schema.attendance, attendanceRows);
  await insertChunked(db, schema.checkIns, checkInRows);
  await insertChunked(db, schema.quizAttempts, quizAttemptRows);
  await insertChunked(db, schema.weeklyReviews, weeklyReviewRows);
  await insertChunked(db, schema.pointsLedger, ledger);

  console.log(
    `  ✓ ${assignments.length} assignments · ${attendanceRows.length} attendance · ${checkInRows.length} check-ins · ${ledger.length} ledger entries`,
  );

  // ---- topic states
  if (completedTopicIds.size > 0) {
    await db
      .update(schema.roadmapTopics)
      .set({ status: 'completed', completedAt: new Date() })
      .where(sql`${schema.roadmapTopics.id} IN ${[...completedTopicIds]}`);
  }

  // Mark each student's current topic as in progress.
  for (const student of SEED_STUDENTS) {
    const memberId = memberByEmail.get(student.email)!;
    const topics = topicsByMember.get(memberId)!;
    const next = topics.find((t) => !completedTopicIds.has(t.id));
    if (next) {
      await db
        .update(schema.roadmapTopics)
        .set({ status: 'in_progress' })
        .where(sql`${schema.roadmapTopics.id} = ${next.id}`);
    }
  }

  // ------------------------------------------------ derive activity + badges
  const { recomputeRange, settleDay } = await import('@/server/scoring');
  for (const student of SEED_STUDENTS) {
    const memberId = memberByEmail.get(student.email)!;
    await recomputeRange({ memberId, from: startDate, to: today, calendar, rules });
    // settleDay on each elapsed active day so streak milestones and achievements land on
    // the day they were actually earned.
    for (const date of elapsedDays) {
      await settleDay({ memberId, date, calendar, rules });
    }
  }
  // Seeded history is not "news" — mark it seen so students are not greeted by a
  // celebration for a badge they earned three weeks ago.
  await dbExecute(
    `UPDATE student_achievements SET seen_at = now() WHERE earned_on < current_date;`,
  );

  console.log('  ✓ derived daily activity, streak bonuses and achievements');

  await closeDb();
  console.log('\n→ seed complete');
  console.log(`   admin:   ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`   student: ${SEED_STUDENTS[0]!.email} / ${STUDENT_PASSWORD}`);
  console.log(`   at risk: ${SEED_STUDENTS.find((s) => s.archetype === 'struggling')!.email}`);
}

/** PGlite and Postgres both dislike very large multi-row inserts; chunk them. */
async function insertChunked<T extends Record<string, unknown>>(
  db: import('../client').Database,
  table: any,
  rows: T[],
  size = 200,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    if (chunk.length > 0) await db.insert(table).values(chunk);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
