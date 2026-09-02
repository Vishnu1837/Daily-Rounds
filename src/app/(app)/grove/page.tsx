import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { getMemberContext } from '@/server/context';
import { getGroveData } from '@/server/queries/grove';

import { GroveScreen } from './grove-screen';

export const metadata: Metadata = { title: 'Grove' };
export const dynamic = 'force-dynamic';

export default async function GrovePage() {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  const data = await getGroveData(ctx);

  return <GroveScreen data={data} today={ctx.today} />;
}
