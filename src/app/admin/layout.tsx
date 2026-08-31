import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Logo } from '@/components/brand/logo';
import { BottomNav, SideNav } from '@/components/nav/bottom-nav';
import { ADMIN_NAV } from '@/components/nav/nav-items';
import { SignOutButton } from '@/components/nav/sign-out-button';
import { TopBar } from '@/components/nav/top-bar';
import { Badge } from '@/components/ui/badge';
import { requireAdmin } from '@/lib/auth/guards';
import { getPrimaryCohort } from '@/server/context';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const cohort = await getPrimaryCohort();
  if (!cohort) redirect('/admin/no-cohort');

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-bg-elevated px-4 py-6 lg:flex">
        <Link href="/admin" className="mb-3 px-2" aria-label="Daily Rounds admin">
          <Logo />
        </Link>
        <div className="mb-6 px-2">
          <Badge tone="iris">Admin console</Badge>
        </div>
        <SideNav items={ADMIN_NAV} />
        <div className="mt-auto rounded-2xl bg-bg-sunken p-4">
          <p className="text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">
            {cohort.name}
          </p>
          <p className="mt-1 text-sm font-semibold text-fg">{user.fullName}</p>
          <Link
            href="/"
            className="mt-3 inline-block text-sm font-semibold text-pulse-700 dark:text-pulse-400"
          >
            ← Student view
          </Link>
          <SignOutButton size="sm" className="mt-2 -ml-2" />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <TopBar
          name={user.fullName}
          right={
            <Link
              href="/"
              className="tap mr-1 rounded-xl px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-fg-muted hover:bg-bg-sunken hover:text-fg lg:hidden"
            >
              Student
            </Link>
          }
        />
        <main id="main" className="mx-auto max-w-6xl px-4 pt-4 pb-28 lg:px-8 lg:pb-12">
          {children}
        </main>
      </div>

      <BottomNav items={ADMIN_NAV} />
    </div>
  );
}
