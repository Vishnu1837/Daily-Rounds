import { redirect } from 'next/navigation';
import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { BottomNav, SideNav } from '@/components/nav/bottom-nav';
import { STUDENT_NAV } from '@/components/nav/nav-items';
import { TopBar } from '@/components/nav/top-bar';
import { requireUser } from '@/lib/auth/guards';
import { calculateCurrentStreak } from '@/lib/domain/streak';
import { minDate } from '@/lib/domain/calendar';
import { getMemberContext } from '@/server/context';
import { loadActivity } from '@/server/scoring';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user.onboardingCompletedAt && user.role !== 'admin') redirect('/onboarding');

  const ctx = await getMemberContext(user);

  // Admins without a student membership belong in the admin console.
  if (!ctx) {
    if (user.role === 'admin') redirect('/admin');
    redirect('/no-cohort');
  }

  const activity = await loadActivity(
    ctx.memberId,
    ctx.calendar.startDate,
    minDate(ctx.today, ctx.calendar.endDate),
  );
  const streak = calculateCurrentStreak(ctx.calendar, activity.showedUp, ctx.today).length;

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-bg-elevated px-4 py-6 lg:flex">
        <Link href="/" className="mb-8 px-2" aria-label="Daily Rounds home">
          <Logo />
        </Link>
        <SideNav items={STUDENT_NAV} />
        <div className="mt-auto rounded-2xl bg-bg-sunken p-4">
          <p className="text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">
            {ctx.cohort.name}
          </p>
          <p className="mt-1 text-sm font-semibold text-fg">{user.fullName}</p>
          {user.role === 'admin' && (
            <Link
              href="/admin"
              className="mt-3 inline-block text-sm font-semibold text-pulse-700 dark:text-pulse-400"
            >
              Admin console →
            </Link>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <TopBar
          name={user.fullName}
          streak={streak}
          right={
            user.role === 'admin' ? (
              <Link
                href="/admin"
                className="tap mr-1 hidden rounded-xl px-3 py-1.5 text-sm font-semibold text-fg-muted hover:bg-bg-sunken hover:text-fg sm:inline-block lg:hidden"
              >
                Admin
              </Link>
            ) : null
          }
        />
        <main id="main" className="mx-auto max-w-2xl px-4 pt-4 pb-28 lg:max-w-4xl lg:px-8 lg:pb-12">
          {children}
        </main>
      </div>

      <BottomNav items={STUDENT_NAV} />
    </div>
  );
}
