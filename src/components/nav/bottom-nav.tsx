'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';

import { cn } from '@/lib/cn';

import { NavIcon } from './icon';
import type { NavItem } from './nav-items';

function isActive(pathname: string, href: string): boolean {
  if (href === '/' || href === '/admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Mobile bottom bar. Five targets max, each at least 44px tall. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const primary = items.filter((i) => i.primary);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-[var(--nav-bg)] backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
        {primary.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'tap relative flex min-h-[3.5rem] flex-col items-center justify-center gap-1 px-1 py-2 transition-colors',
                  active ? 'text-pulse-700 dark:text-pulse-300' : 'text-fg-subtle',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="bottom-nav-pill"
                    className="absolute inset-x-2 inset-y-1.5 -z-10 rounded-2xl bg-pulse-500/12"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <NavIcon
                  name={item.icon}
                  className="size-[22px]"
                  strokeWidth={active ? 2.4 : 1.9}
                />
                <span className="text-2xs leading-none font-semibold">{item.short}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Desktop sidebar. Shows every destination, not just the primary five. */
export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="hidden lg:block">
      <ul className="space-y-1">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'tap relative flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-colors',
                  active
                    ? 'bg-pulse-500/12 text-pulse-700 dark:text-pulse-300'
                    : 'text-fg-muted hover:bg-bg-sunken hover:text-fg',
                )}
              >
                <NavIcon name={item.icon} className="size-[18px]" strokeWidth={active ? 2.4 : 2} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
