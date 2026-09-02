import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { Logo } from '@/components/brand/logo';
import { LevelBadge, XPBar } from '@/components/gamification/level';
import { BottomNav, SideNav } from '@/components/nav/bottom-nav';
import { MobileMenu } from '@/components/nav/mobile-menu';
import { STUDENT_NAV } from '@/components/nav/nav-items';
import { TopBar } from '@/components/nav/top-bar';
import { requireUser } from '@/lib/auth/guards';
import { levelFromPoints } from '@/lib/domain/level';
import { calculateCurrentStreak } from '@/lib/domain/streak';
import { minDate } from '@/lib/domain/calendar';
import { getMemberContext } from '@/server/context';
import { readActivity, readTotalPoints } from '@/server/scoring';
import { STUDENT_HOME } from '@/lib/routes';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user.onboardingCompletedAt && user.role !== 'admin') redirect('/onboarding');

  const ctx = await getMemberContext(user);

  // Admins without a student membership belong in the admin console.
  if (!ctx) {
    if (user.role === 'admin') redirect('/admin');
    redirect('/no-cohort');
  }

  const [activity, points] = await Promise.all([
    readActivity(ctx.memberId, ctx.calendar.startDate, minDate(ctx.today, ctx.calendar.endDate)),
    readTotalPoints(ctx.memberId),
  ]);
  const streak = calculateCurrentStreak(ctx.calendar, activity.showedUp, ctx.today).length;
  const level = levelFromPoints(points);

  const todayLabel = new Date(`${ctx.today}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  return (
    <div className="min-h-dvh lg:flex">
      {/* ------------------------------------------------------ desktop rail */}
      <aside className="border-border bg-bg-elevated sticky top-0 hidden h-dvh w-[17rem] shrink-0 flex-col border-r px-4 py-6 lg:flex">
        <Link href={STUDENT_HOME} className="mb-8 px-2" aria-label="Daily Rounds home">
          <Logo />
        </Link>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <SideNav items={STUDENT_NAV} />
        </div>

        {/*
          The rail closes with the student's own standing rather than a settings link. It is
          the last thing in their eyeline on every screen, and it is a reason to keep going.
        */}
        <div className="rounded-panel border-border bg-bg-sunken mt-6 border p-4">
          <LevelBadge info={level} size="md" />
          <XPBar info={level} className="mt-4" />
          <p className="border-border eyebrow mt-4 truncate border-t pt-3">{ctx.cohort.name}</p>
          <p className="text-fg mt-0.5 truncate text-sm font-semibold">{user.fullName}</p>
          {user.role === 'admin' && (
            <Link
              href="/admin"
              className="text-pulse-700 hover:text-pulse-500 dark:text-pulse-300 mt-3 inline-flex items-center gap-1 text-sm font-semibold"
            >
              Admin console
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <TopBar
          name={user.fullName}
          avatarUrl={user.avatarUrl}
          streak={streak}
          xp={level.xp}
          level={level.level}
          subtitle={`${todayLabel} · ${ctx.cohort.name}`}
          left={
            <MobileMenu
              items={STUDENT_NAV}
              footer={
                user.role === 'admin' ? (
                  <Link
                    href="/admin"
                    className="text-pulse-700 hover:text-pulse-500 dark:text-pulse-300 inline-flex items-center gap-1 px-3 text-sm font-semibold"
                  >
                    Admin console
                    <ArrowUpRight className="size-3.5" aria-hidden />
                  </Link>
                ) : null
              }
            />
          }
          right={
            user.role === 'admin' ? (
              <Link
                href="/admin"
                className="tap rounded-field text-fg-muted hover:bg-bg-sunken hover:text-fg mr-1 hidden px-3 py-1.5 text-sm font-semibold sm:inline-block lg:hidden"
              >
                Admin
              </Link>
            ) : null
          }
        />

        {/*
          Wide enough for a real dashboard composition on desktop, and still a single
          comfortable column on a phone. The bottom padding clears the floating nav bar.
        */}
        <main
          id="main"
          className="mx-auto w-full max-w-2xl px-4 pt-5 pb-32 lg:max-w-6xl lg:px-8 lg:pt-7 lg:pb-14"
        >
          {children}
        </main>
      </div>

      <BottomNav items={STUDENT_NAV} />
    </div>
  );
}
