import { Suspense } from 'react';
import Link from 'next/link';

import { LinkDeviceLauncher } from '@/components/auth/link-device';
import { Logo } from '@/components/brand/logo';
import { GroveDock } from '@/components/grove/dock';
import {
  BottomNav,
  BottomNavFallback,
  SideNav,
  SideNavFallback,
} from '@/components/nav/bottom-nav';
import { MobileMenu, MobileMenuFallback } from '@/components/nav/mobile-menu';
import { BookOpeningOverlay } from '@/components/textbook/book-opening';
import { STUDENT_NAV } from '@/components/nav/nav-items';
import { AvatarSkeleton, HeaderStatsSkeleton, TopBar } from '@/components/nav/top-bar';
import { NotificationBellSkeleton } from '@/components/notifications/notification-bell';
import { STUDENT_HOME } from '@/lib/routes';

import {
  AdminShortcutCompact,
  AdminShortcutInline,
  FeedbackPrompt,
  HeaderIdentity,
  HeaderNotifications,
  HeaderStanding,
  HeaderSubtitle,
  RailIdentity,
  RailIdentitySkeleton,
  RailStanding,
  RailStandingSkeleton,
  ShellSlot,
  ViewingAsBanner,
} from './shell';
import { SITE } from '@/lib/site';

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
    <>
      {/*
        Admin "view as student" bar. Full width, above the rail and the main column, and
        outside the `lg:flex` row so it never becomes a flex column. Renders nothing for an
        ordinary student. See `./shell`.
      */}
      <ShellSlot>
        <ViewingAsBanner />
      </ShellSlot>

      <div className="min-h-dvh lg:flex">
        {/* ---------------------------------------------------- desktop rail */}
        <aside className="border-border bg-bg-elevated sticky top-0 hidden h-dvh w-[17rem] shrink-0 flex-col border-r px-4 py-6 lg:flex">
          <Link href={STUDENT_HOME} className="mb-8 px-2" aria-label={`${SITE.name} home`}>
            <Logo />
          </Link>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <Suspense fallback={<SideNavFallback items={STUDENT_NAV} />}>
              <SideNav items={STUDENT_NAV} />
            </Suspense>
          </div>

          {/*
            The rail closes with the student's own standing rather than a settings link. It
            is the last thing in their eyeline on every screen, and a reason to keep going.
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
              <>
                <ShellSlot>
                  <AdminShortcutCompact />
                </ShellSlot>
                {/*
                  The bell sits left of the stats rather than beside the avatar, so the two
                  numbers a student checks constantly keep the position they have always had.
                  A notification count is the one thing in a header allowed to *change* while
                  you are looking at it, and moving the streak to make room for it would
                  charge every student for a message most of them have already read.
                */}
                <Suspense fallback={<NotificationBellSkeleton />}>
                  <HeaderNotifications />
                </Suspense>
              </>
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

        {/*
          The "open on your phone" prompt. A client component with no props, so it costs the
          static shell nothing — the rule at the top of this file still holds, and the code
          it offers is only minted once a student actually asks for one.
        */}
        <LinkDeviceLauncher />

        {/*
          The focus round, once it has been minimised.

          It lives in the shell rather than on `/study` because that is the whole point of
          it: a round that only exists on its own page is a round the student has to choose
          between and the reading it was supposed to protect. A client component with no
          props, so the static shell is untouched — and it resolves to nothing for the
          overwhelming majority of page loads, where nothing is growing. See the component.
        */}
        <ShellSlot>
          <GroveDock />
        </ShellSlot>

        {/*
          The feedback round's one interruption. Resolves to nothing for a student who has
          already answered it or already closed it once, which is almost everybody almost
          all of the time — so it is a `ShellSlot` and never delays a page. See `./shell`.
        */}
        <ShellSlot>
          <FeedbackPrompt />
        </ShellSlot>

        {/*
          Opening a book from the shelf. It lives here because the animation has to outlive
          the shelf page that starts it. No props, and nothing rendered until a cover is
          tapped, so the static shell is untouched. See the component.
        */}
        <BookOpeningOverlay />
      </div>
    </>
  );
}
