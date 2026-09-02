import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { getMemberContext } from '@/server/context';
import { getPeerGrove } from '@/server/queries/grove';

import { PeerGroveScreen } from './peer-grove-screen';

export const metadata: Metadata = { title: 'Grove' };
/**
 * One classmate's grove, read-only.
 *
 * A member id from another cohort — or one that does not exist — is a 404, not an empty
 * grove: `getPeerGrove` returns null unless the member is an active student in the caller's
 * own cohort, and there is deliberately no fallback path that renders anything without it.
 */
export default async function PeerGrovePage({ params }: { params: Promise<{ memberId: string }> }) {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  const { memberId } = await params;
  const grove = await getPeerGrove(ctx, memberId);
  if (!grove) notFound();

  return <PeerGroveScreen grove={grove} today={ctx.today} />;
}
