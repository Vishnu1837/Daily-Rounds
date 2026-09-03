import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { SITE } from '@/lib/site';

/**
 * A two-panel sign-in on desktop, a single column on mobile.
 *
 * The left panel is not decoration: it states what the product measures before anyone signs
 * in, so the first impression is the promise rather than a form. It is hidden below `lg`,
 * where screen space belongs entirely to the fields.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ------------------------------------------------------- brand panel */}
      <aside className="from-pulse-600 via-pulse-700 to-iris-800 relative hidden overflow-hidden bg-linear-to-br p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <span className="animate-drift bg-iris-400/30 absolute -top-24 -left-16 size-96 rounded-full blur-3xl" />
          <span className="animate-drift bg-pulse-300/25 absolute -right-20 bottom-0 size-80 rounded-full blur-3xl [animation-delay:-7s]" />
        </div>

        <Link href="/login" className="relative" aria-label={`${SITE.name} home`}>
          <span className="inline-flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25 ring-inset">
              <svg viewBox="0 0 40 40" className="size-6" aria-hidden>
                <path
                  d="M6 22h5.5l2.6-7.2 3.4 13.4 3.3-9.4 2.2 3.2H34"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="font-display text-lg font-extrabold tracking-[-0.03em]">
              {SITE.name}
            </span>
          </span>
        </Link>

        <div className="relative mt-auto max-w-md">
          <h2 className="text-4xl leading-[1.1] font-extrabold tracking-tight text-balance">
            Nobody remembers the day you studied hardest.
          </h2>
          <p className="mt-5 text-lg text-white/75">
            They remember whether you showed up. {SITE.name} measures one thing: did you do what you
            said you would, and did you do it again tomorrow?
          </p>

          <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-white/15 pt-8">
            <div>
              <dt className="text-2xs font-bold tracking-[0.14em] text-white/55 uppercase">
                Rewards
              </dt>
              <dd className="mt-1.5 text-sm font-bold">Process, not marks</dd>
            </div>
            <div>
              <dt className="text-2xs font-bold tracking-[0.14em] text-white/55 uppercase">
                Costs you
              </dt>
              <dd className="mt-1.5 text-sm font-bold">45 seconds a day</dd>
            </div>
            <div>
              <dt className="text-2xs font-bold tracking-[0.14em] text-white/55 uppercase">
                Weekends
              </dt>
              <dd className="mt-1.5 text-sm font-bold">Never break a streak</dd>
            </div>
          </dl>
        </div>
      </aside>

      {/* -------------------------------------------------------- form panel */}
      <div className="relative flex min-h-dvh flex-col">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-linear-to-b from-[var(--wash-pulse)] to-transparent lg:hidden"
          aria-hidden
        />

        <header className="relative px-6 pt-8 lg:hidden">
          <Link href="/login" className="inline-flex" aria-label={`${SITE.name} home`}>
            <Logo />
          </Link>
        </header>

        <main id="main" className="relative flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-md">{children}</div>
        </main>

        <footer className="text-fg-subtle relative px-6 pb-8 text-center text-xs">
          Built for medical students who want to show up consistently.
        </footer>
      </div>
    </div>
  );
}
