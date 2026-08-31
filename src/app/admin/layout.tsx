import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

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
      <aside className="border-border bg-bg-elevated sticky top-0 hidden h-dvh w-[17rem] shrink-0 flex-col border-r px-4 py-6 lg:flex">
        <Link href="/admin" className="mb-3 px-2" aria-label="Daily Rounds admin">
          <Logo />
        </Link>
        <div className="mb-7 px-2">
          <Badge tone="iris">Admin console</Badge>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <SideNav items={ADMIN_NAV} />
        </div>

        <div className="rounded-panel border-border bg-bg-sunken mt-6 border p-4">
          <p className="eyebrow truncate">{cohort.name}</p>
          <p className="text-fg mt-1 truncate text-sm font-semibold">{user.fullName}</p>
          <Link
            href="/"
            className="text-pulse-700 hover:text-pulse-500 dark:text-pulse-300 mt-3 inline-flex items-center gap-1.5 text-sm font-semibold transition-colors"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Student view
          </Link>
          <SignOutButton size="sm" className="mt-1 -ml-2" />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <TopBar
          name={user.fullName}
          subtitle={`${cohort.name} · admin console`}
          right={
            <Link
              href="/"
              className="tap rounded-field text-fg-muted hover:bg-bg-sunken hover:text-fg mr-1 px-3 py-1.5 text-sm font-semibold whitespace-nowrap lg:hidden"
            >
              Student
            </Link>
          }
        />
        <main
          id="main"
          className="mx-auto w-full max-w-7xl px-4 pt-5 pb-32 lg:px-8 lg:pt-7 lg:pb-14"
        >
          {children}
        </main>
      </div>

      <BottomNav items={ADMIN_NAV} />
    </div>
  );
}
