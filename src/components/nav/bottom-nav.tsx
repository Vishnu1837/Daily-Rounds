'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';

import { cn } from '@/lib/cn';

import { NavIcon } from './icon';
import { type NavItem, groupNav } from './nav-items';

/*
 * `pathname` is nullable, and that is the whole trick behind the prerendered shell.
 *
 * `usePathname()` cannot run while a route is being prerendered — the URL is not known yet —
 * so the navigation is split in two. The presentational halves below take the path as a
 * plain argument and render perfectly well without one; the `Suspense`-wrapped exports read
 * the real path at request time. The prerendered shell therefore ships a complete, clickable
 * navigation, and only the highlight on the current tab arrives a moment later.
 */
function isActive(pathname: string | null, href: string): boolean {
  if (pathname === null) return false;
  if (href === '/' || href === '/admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The mobile bar.
 *
 * A floating pill inset from the screen edges rather than a full-width bar welded to the
 * bottom: it reads as a control that belongs to the app rather than to the phone, and the
 * gap underneath means content scrolling past it stays visible instead of disappearing
 * under an opaque strip.
 *
 * One item may be raised into a centre action button. That slot is the product's single
 * daily ritual, so it is always in the same place and always the largest target.
 */
function BottomBar({ items, pathname }: { items: NavItem[]; pathname: string | null }) {
  const reduce = useReducedMotion();
  const primary = items.filter((i) => i.primary);
  const fab = primary.find((i) => i.fab);
  const tabs = primary.filter((i) => !i.fab);

  // With a raised action the tabs split evenly around it; without one they simply fill.
  const half = Math.ceil(tabs.length / 2);
  const groups = fab ? [tabs.slice(0, half), tabs.slice(half)] : [tabs];

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      <div className="rounded-pill border-border shadow-float relative mx-auto flex max-w-md items-stretch gap-1 border bg-[var(--nav-bg)] px-2 py-1.5 backdrop-blur-2xl">
        {groups.map((group, groupIndex) => (
          <ul key={groupIndex} className="flex flex-1 items-stretch justify-around">
            {group.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href} className="flex-1">
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'tap rounded-pill relative flex min-h-13 flex-col items-center justify-center gap-1 px-1 transition-colors duration-150',
                      active ? 'text-pulse-700 dark:text-pulse-200' : 'text-fg-subtle',
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="bottom-nav-pill"
                        className="rounded-pill bg-pulse-500/14 absolute inset-0 -z-10"
                        transition={
                          reduce ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 }
                        }
                      />
                    )}
                    <NavIcon
                      name={item.icon}
                      className="size-[21px]"
                      strokeWidth={active ? 2.5 : 1.9}
                    />
                    <span className="text-2xs leading-none font-semibold">{item.short}</span>
                  </Link>
                </li>
              );
            })}
            {/* Reserves the footprint the raised button occupies above the bar. */}
            {fab && groupIndex === 0 && <li className="w-16 shrink-0" aria-hidden />}
          </ul>
        ))}

        {fab && (
          <Link
            href={fab.href}
            aria-label={fab.label}
            aria-current={isActive(pathname, fab.href) ? 'page' : undefined}
            className={cn(
              'tap absolute -top-4 left-1/2 grid size-14 -translate-x-1/2 place-items-center rounded-full',
              'from-pulse-400 to-pulse-600 shadow-glow-pulse bg-linear-to-br text-white',
              'ease-out-soft ring-4 ring-[var(--bg)] transition-transform duration-200',
              'active:scale-95 motion-reduce:active:scale-100',
            )}
          >
            <NavIcon name={fab.icon} className="size-6" strokeWidth={2.4} />
          </Link>
        )}
      </div>
    </nav>
  );
}

/**
 * The desktop rail.
 *
 * Grouped with quiet headings so eight destinations read as three ideas rather than a list
 * of eight. The active item gets a filled gradient pill *and* a brighter icon — colour
 * alone would not survive a monochrome display or a colour-blind reader.
 */
function Rail({ items, pathname }: { items: NavItem[]; pathname: string | null }) {
  const reduce = useReducedMotion();
  const groups = groupNav(items);

  return (
    <nav aria-label="Primary" className="hidden lg:block">
      <div className="space-y-6">
        {groups.map(({ group, items: groupItems }) => (
          <div key={group}>
            <p className="eyebrow px-3.5 pb-2">{group}</p>
            <ul className="space-y-0.5">
              {groupItems.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'tap rounded-field relative flex items-center gap-3 px-3.5 py-2.5 text-sm font-semibold transition-colors duration-150',
                        active ? 'text-white' : 'text-fg-muted hover:bg-bg-sunken hover:text-fg',
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="side-nav-pill"
                          className="rounded-field from-pulse-500 to-pulse-600 shadow-glow-pulse absolute inset-0 -z-10 bg-linear-to-r"
                          transition={
                            reduce
                              ? { duration: 0 }
                              : { type: 'spring', stiffness: 420, damping: 36 }
                          }
                        />
                      )}
                      <NavIcon
                        name={item.icon}
                        className="size-[18px]"
                        strokeWidth={active ? 2.4 : 2}
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ exports */

/** The live navigation: knows which tab you are on. Must render inside `<Suspense>`. */
export function BottomNav({ items }: { items: NavItem[] }) {
  return <BottomBar items={items} pathname={usePathname()} />;
}

export function SideNav({ items }: { items: NavItem[] }) {
  return <Rail items={items} pathname={usePathname()} />;
}

/**
 * The same navigation with nothing highlighted — the prerendered stand-in.
 *
 * Not a skeleton: every destination is real and every link works from the first paint.
 * Someone who taps through before the highlight resolves loses nothing at all.
 */
export function BottomNavFallback({ items }: { items: NavItem[] }) {
  return <BottomBar items={items} pathname={null} />;
}

export function SideNavFallback({ items }: { items: NavItem[] }) {
  return <Rail items={items} pathname={null} />;
}
