import Link from 'next/link';

import { Logo } from '@/components/brand/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      {/* Ambient brand wash — subtle, never competing with the form. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[340px] bg-linear-to-b from-pulse-500/12 via-iris-500/6 to-transparent"
        aria-hidden
      />
      <header className="relative px-6 pt-8">
        <Link href="/login" className="inline-flex" aria-label="Daily Rounds home">
          <Logo />
        </Link>
      </header>

      <main id="main" className="relative flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="relative px-6 pb-8 text-center text-xs text-fg-subtle">
        Built for medical students who want to show up consistently.
      </footer>
    </div>
  );
}
