export type NavIconName =
  | 'home'
  | 'map'
  | 'calendar'
  | 'chart'
  | 'trophy'
  | 'book'
  | 'library'
  | 'check'
  | 'user'
  | 'settings'
  | 'sparkles'
  | 'timer'
  | 'tree'
  | 'inbox'
  | 'users';

export type NavItem = {
  href: string;
  label: string;
  /** Short label for the mobile bar, where space is tight. */
  short: string;
  icon: NavIconName;
  /** Shown in the mobile bottom bar (kept to five for reachability). */
  primary: boolean;
  /**
   * Raised into the centre action button on mobile. At most one per nav list.
   *
   * This is reserved for the single thing the product wants someone to do every day. For a
   * student that is the check-in; the admin console has no equivalent daily ritual, so its
   * bar is five even tabs.
   */
  fab?: boolean;
  /** Groups the item in the desktop sidebar. Items are rendered in list order. */
  group: string;
};

export const STUDENT_NAV: NavItem[] = [
  { href: '/today', label: 'Today', short: 'Today', icon: 'home', primary: true, group: 'Daily' },
  {
    href: '/roadmap',
    label: 'Roadmap',
    short: 'Roadmap',
    icon: 'map',
    primary: true,
    group: 'Daily',
  },
  {
    href: '/check-in',
    label: 'Check-In',
    short: 'Check-in',
    icon: 'check',
    primary: true,
    fab: true,
    group: 'Daily',
  },
  {
    href: '/progress',
    label: 'Progress',
    short: 'Progress',
    icon: 'chart',
    primary: true,
    group: 'Momentum',
  },
  {
    href: '/leaderboard',
    label: 'Leaderboard',
    short: 'Ranks',
    icon: 'trophy',
    primary: true,
    group: 'Momentum',
  },
  {
    href: '/grove',
    label: 'Grove',
    short: 'Grove',
    icon: 'tree',
    primary: false,
    group: 'Momentum',
  },
  {
    href: '/calendar',
    label: 'Calendar',
    short: 'Calendar',
    icon: 'calendar',
    primary: false,
    group: 'Momentum',
  },
  {
    href: '/syllabus',
    label: 'Syllabus',
    short: 'Syllabus',
    icon: 'library',
    primary: false,
    group: 'Library',
  },
  {
    href: '/materials',
    label: 'Materials',
    short: 'Materials',
    icon: 'book',
    primary: false,
    group: 'Library',
  },
  {
    href: '/profile',
    label: 'Profile',
    short: 'Profile',
    icon: 'user',
    primary: false,
    group: 'Library',
  },
];

export const ADMIN_NAV: NavItem[] = [
  {
    href: '/admin',
    label: 'Overview',
    short: 'Overview',
    icon: 'home',
    primary: true,
    group: 'Cohort',
  },
  {
    href: '/admin/attendance',
    label: 'Attendance',
    short: 'Attend',
    icon: 'check',
    primary: true,
    group: 'Cohort',
  },
  {
    href: '/admin/students',
    label: 'Students',
    short: 'Students',
    icon: 'users',
    primary: true,
    group: 'Cohort',
  },
  {
    href: '/admin/roadmaps',
    label: 'Roadmaps',
    short: 'Roadmaps',
    icon: 'map',
    primary: true,
    group: 'Content',
  },
  {
    href: '/admin/check-ins',
    label: 'Check-Ins',
    short: 'Check-ins',
    icon: 'chart',
    primary: true,
    group: 'Content',
  },
  {
    href: '/admin/events',
    label: 'Events',
    short: 'Events',
    icon: 'calendar',
    primary: false,
    group: 'Content',
  },
  {
    href: '/admin/materials',
    label: 'Materials',
    short: 'Materials',
    icon: 'book',
    primary: false,
    group: 'Content',
  },
  {
    href: '/admin/waitlist',
    label: 'Waitlist',
    short: 'Waitlist',
    icon: 'inbox',
    primary: false,
    group: 'Cohort admin',
  },
  {
    href: '/admin/settings',
    label: 'Settings',
    short: 'Settings',
    icon: 'settings',
    primary: false,
    group: 'Cohort admin',
  },
];

/** Preserves list order while collecting items into their sidebar groups. */
export function groupNav(items: NavItem[]): { group: string; items: NavItem[] }[] {
  const groups: { group: string; items: NavItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }
  return groups;
}
