import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireAdmin } from '@/lib/auth/guards';
import { getPrimaryCohort } from '@/server/context';

import { AdminProfileScreen } from './profile-screen';

export const metadata: Metadata = { title: 'Your profile' };
export const dynamic = 'force-dynamic';

export default async function AdminProfilePage() {
  const user = await requireAdmin();
  const cohort = await getPrimaryCohort();
  if (!cohort) redirect('/admin/no-cohort');

  return (
    <AdminProfileScreen
      user={{
        fullName: user.fullName,
        email: user.email,
        whatsapp: user.whatsapp,
        university: user.university,
        timezone: user.timezone,
        avatarUrl: user.avatarUrl,
      }}
      cohort={{ name: cohort.name, timezone: cohort.timezone }}
    />
  );
}
