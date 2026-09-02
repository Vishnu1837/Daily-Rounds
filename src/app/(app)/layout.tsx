import { Suspense } from 'react';
import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import {
  BottomNav,
  BottomNavFallback,
  SideNav,
  SideNavFallback,
} from '@/components/nav/bottom-nav';
import { MobileMenu, MobileMenuFallback } from '@/components/nav/mobile-menu';
import { STUDENT_NAV } from '@/components/nav/nav-items';
import { AvatarSkeleton, HeaderStatsSkeleton, TopBar } from '@/components/nav/top-bar';
import { STUDENT_HOME } from '@/lib/routes';

import {
  AdminShortcutCompact,
  AdminShortcutInline,
  HeaderIdentity,
  HeaderStanding,
  HeaderSubtitle,
  RailIdentity,
  RailIdentitySkeleton,
  RailStanding,
  RailStandingSkeleton,
  ShellSlot,
} from './shell';

/**
 * The student shell.
 *
 * Deliberately synchronous. Everything here — the rail, the navigation, the header frame,
 * the main column — is the same for every student, so Next can prerender it once and hand
 * it to a navigation instantly. The parts that differ per person are Suspense boundaries
 * that stream in behind it.
 *
 * The rule this encodes: nothing in this file may `await`. The moment the layout reads a
 * cookie or touches the database directly, the whole route loses its static shell and every
 * tab switch goes back to waiting on the server before it can paint. See `./shell.tsx`.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:flex">
      {/* ------------------------------------------------------ desktop rail */}
      <aside className="border-border bg-bg-elevated sticky top-0 hidden h-dvh w-[17rem] shrink-0 flex-col border-r px-4 py-6 lg:flex">
        <Link href={STUDENT_HOME} className="mb-8 px-2" aria-label="Daily Rounds home">
          <Logo />
        </Link>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Suspense fallback={<SideNavFallback items={STUDENT_NAV} />}>
            <SideNav items={STUDENT_NAV} />
          </Suspense>
        </div>

        {/*
          The rail closes with the student's own standing rather than a settings link. It is
          the last thing in their eyeline on every screen, and it is a reason to keep going.
        */}
        <div className="rounded-panel border-border bg-bg-sunken mt-6 border p-4">
          <Suspense fallback={<RailStandingSkeleton />}>
            <RailStanding />
          </Suspense>
          <Suspense fallback={<RailIdentitySkeleton />}>
            <RailIdentity />
          </Suspense>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <TopBar
          identity={
            <Suspense fallback={<AvatarSkeleton />}>
              <HeaderIdentity />
            </Suspense>
          }
          stats={
            <Suspense fallback={<HeaderStatsSkeleton />}>
              <HeaderStanding />
            </Suspense>
          }
          subtitle={
            <ShellSlot>
              <HeaderSubtitle />
            </ShellSlot>
          }
          left={
            <Suspense fallback={<MobileMenuFallback items={STUDENT_NAV} />}>
              <MobileMenu
                items={STUDENT_NAV}
                footer={
                  <ShellSlot>
                    <AdminShortcutInline />
                  </ShellSlot>
                }
              />
            </Suspense>
          }
          right={
            <ShellSlot>
              <AdminShortcutCompact />
            </ShellSlot>
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

      <Suspense fallback={<BottomNavFallback items={STUDENT_NAV} />}>
        <BottomNav items={STUDENT_NAV} />
      </Suspense>
    </div>
  );
}
