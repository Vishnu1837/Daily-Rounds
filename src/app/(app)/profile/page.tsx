import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { db } from '@/db/client';
import { studentGoals, subjects } from '@/db/schema';
import { requireOnboardedUser } from '@/lib/auth/guards';
import { getMemberContext } from '@/server/context';

import { ProfileScreen } from './profile-screen';

export const metadata: Metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  const rows = await db
    .select({
      cohortGoal: studentGoals.cohortGoal,
      dailyCommitmentMinutes: studentGoals.dailyCommitmentMinutes,
      examName: studentGoals.examName,
      examDate: studentGoals.examDate,
      subjectName: subjects.name,
    })
    .from(studentGoals)
    .leftJoin(subjects, eq(subjects.id, studentGoals.primarySubjectId))
    .where(eq(studentGoals.memberId, ctx.memberId))
    .limit(1);

  return (
    <ProfileScreen
      user={{
        fullName: user.fullName,
        email: user.email,
        whatsapp: user.whatsapp,
        university: user.university,
        mbbsYear: user.mbbsYear,
        timezone: user.timezone,
        role: user.role,
      }}
      cohort={{ name: ctx.cohort.name, startDate: ctx.cohort.startDate, endDate: ctx.cohort.endDate }}
      goals={rows[0] ?? null}
    />
  );
}
