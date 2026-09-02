import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { getMemberContext } from '@/server/context';
import { getAvailableQuizzes, getMaterials } from '@/server/queries/student';

import { MaterialsScreen } from './materials-screen';

export const metadata: Metadata = { title: 'Materials' };
export default async function MaterialsPage() {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  const [materials, quizzes] = await Promise.all([getMaterials(ctx), getAvailableQuizzes(ctx)]);

  return <MaterialsScreen materials={materials} quizzes={quizzes} />;
}
