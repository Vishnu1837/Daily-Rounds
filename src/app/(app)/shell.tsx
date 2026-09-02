import 'server-only';

import { Suspense, cache } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';

import { LevelBadge, XPBar } from '@/components/gamification/level';
import { HeaderStats } from '@/components/nav/top-bar';
import { Avatar } from '@/components/ui/avatar';
import { requireUser } from '@/lib/auth/guards';
import { minDate } from '@/lib/domain/calendar';
import { levelFromPoints } from '@/lib/domain/level';
import { calculateCurrentStreak } from '@/lib/domain/streak';
import { getMemberContext } from '@/server/context';
import { readActivity, readTotalPoints } from '@/server/scoring';

/**
 * The signed-in student, or a redirect to wherever they actually belong.
 *
 * This used to sit at the top of the layout, which is what made every screen in the app
 * un-prerenderable: a `cookies()` read before the first byte means Next has no static shell
 * to hand a navigation, so every tab switch waited on a server round trip before it could
 * paint anything at all.
 *
 * So the guard moved down here, into the parts of the shell that genuinely need a
 * database. Each of them calls this independently and the request-level memoisation makes
 * that free, so no single caller has to own it and pass it down. Signed-out visitors never
 * reach this: `proxy.ts` turns them away on the cookie alone, before a render starts.
 */
export const requireMember = cache(async () => {
  const user = await requireUser();
  if (!user.onboardingCompletedAt && user.role !== 'admin') redirect('/onboarding');

  const ctx = await getMemberContext(user);

  // Admins without a student membership belong in the admin console.
  if (!ctx) {
    if (user.role === 'admin') redirect('/admin');
    redirect('/no-cohort');
  }

  return { user, ctx };
});

/**
 * Streak and level, the two numbers the shell shows on every screen.
 *
 * Memoised per request because both the header pill and the desktop rail want them, and
 * they are the same numbers — without this the streak's full-cohort activity scan would run
 * twice on every page.
 */
const loadStanding = cache(async () => {
  const { ctx } = await requireMember();
  const [activity, points] = await Promise.all([
    readActivity(ctx.memberId, ctx.calendar.startDate, minDate(ctx.today, ctx.calendar.endDate)),
    readTotalPoints(ctx.memberId),
  ]);
  return {
    streak: calculateCurrentStreak(ctx.calendar, activity.showedUp, ctx.today).length,
    level: levelFromPoints(points),
  };
});

/* -------------------------------------------------------------------- header */

export async function HeaderIdentity() {
  const { user } = await requireMember();
  return <Avatar name={user.fullName} src={user.avatarUrl} size="sm" ring />;
}

export async function HeaderStanding() {
  const { streak, level } = await loadStanding();
  return <HeaderStats streak={streak} xp={level.xp} level={level.level} />;
}

export async function HeaderSubtitle() {
  const { ctx } = await requireMember();
  const todayLabel = new Date(`${ctx.today}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  return `${todayLabel} · ${ctx.cohort.name}`;
}

/* ---------------------------------------------------------------------- rail */

export async function RailStanding() {
  const { level } = await loadStanding();
  return (
    <>
      <LevelBadge info={level} size="md" />
      <XPBar info={level} className="mt-4" />
    </>
  );
}

/** Holds the rail block's height so the cohort name below it does not jump. */
export function RailStandingSkeleton() {
  return (
    <>
      <div className="bg-bg-sunken h-9 w-full animate-pulse rounded-lg" />
      <div className="bg-bg-sunken mt-4 h-8 w-full animate-pulse rounded-lg" />
    </>
  );
}

export async function RailIdentity() {
  const { user, ctx } = await requireMember();
  return (
    <>
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
    </>
  );
}

export function RailIdentitySkeleton() {
  return (
    <>
      <div className="border-border mt-4 border-t pt-3">
        <div className="bg-bg-sunken h-3 w-20 animate-pulse rounded" />
      </div>
      <div className="bg-bg-sunken mt-1.5 h-4 w-28 animate-pulse rounded" />
    </>
  );
}

/* ------------------------------------------------------- admin-only shortcuts */

/*
 * Three placements of one idea: a cohort lead browsing the student app needs a way back to
 * the console. Each is its own async component because each renders in a different slot,
 * and none of them may block the shell — an admin shortcut is not worth delaying a page for.
 */

export async function AdminShortcutInline() {
  const { user } = await requireMember();
  if (user.role !== 'admin') return null;
  return (
    <Link
      href="/admin"
      className="text-pulse-700 hover:text-pulse-500 dark:text-pulse-300 inline-flex items-center gap-1 px-3 text-sm font-semibold"
    >
      Admin console
      <ArrowUpRight className="size-3.5" aria-hidden />
    </Link>
  );
}

export async function AdminShortcutCompact() {
  const { user } = await requireMember();
  if (user.role !== 'admin') return null;
  return (
    <Link
      href="/admin"
      className="tap rounded-field text-fg-muted hover:bg-bg-sunken hover:text-fg mr-1 hidden px-3 py-1.5 text-sm font-semibold sm:inline-block lg:hidden"
    >
      Admin
    </Link>
  );
}

/** Wraps a shell slot that may resolve to nothing, so an empty one costs no placeholder. */
export function ShellSlot({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
