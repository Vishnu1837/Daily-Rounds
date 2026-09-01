'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';

import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';

import { NavIcon } from './icon';
import { type NavItem, groupNav } from './nav-items';

function isActive(pathname: string, href: string): boolean {
  if (href === '/' || href === '/admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The mobile overflow menu.
 *
 * The bottom bar only has room for the five destinations someone touches daily, so
 * everything else — the syllabus, the materials library, the calendar — would otherwise be
 * unreachable on a phone. This is where those live, grouped exactly as they are in the
 * desktop rail so the two navigations describe the same product.
 */
export function MobileMenu({ items, footer }: { items: NavItem[]; footer?: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const groups = groupNav(items.filter((i) => !i.primary));
  if (groups.length === 0 && !footer) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="More"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="tap rounded-field text-fg-muted hover:bg-bg-sunken hover:text-fg grid size-9.5 place-items-center transition-colors lg:hidden"
      >
        <Menu className="size-[19px]" aria-hidden />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="More" size="sm">
        <div className="space-y-5 pt-1 pb-[env(safe-area-inset-bottom)]">
          {groups.map(({ group, items: groupItems }) => (
            <div key={group}>
              <p className="eyebrow px-1 pb-2">{group}</p>
              <ul className="space-y-0.5">
                {groupItems.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        // A tap that navigates should leave the menu behind it.
                        onClick={() => setOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'tap rounded-field flex items-center gap-3 px-3 py-3 text-sm font-semibold transition-colors',
                          active
                            ? 'bg-pulse-500/12 text-pulse-700 dark:text-pulse-200'
                            : 'text-fg-muted hover:bg-bg-sunken hover:text-fg',
                        )}
                      >
                        <NavIcon
                          name={item.icon}
                          className="size-[19px]"
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

          {footer && <div className="border-border border-t pt-4">{footer}</div>}
        </div>
      </Sheet>
    </>
  );
}
