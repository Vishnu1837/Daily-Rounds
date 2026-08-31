export type NavItem = {
  href: string;
  label: string;
  /** Short label for the mobile bar, where space is tight. */
  short: string;
  icon: 'home' | 'map' | 'calendar' | 'chart' | 'trophy' | 'book' | 'check' | 'user';
  /** Shown in the mobile bottom bar (kept to five for reachability). */
  primary: boolean;
};

export const STUDENT_NAV: NavItem[] = [
  { href: '/', label: 'Home', short: 'Home', icon: 'home', primary: true },
  { href: '/roadmap', label: 'Roadmap', short: 'Roadmap', icon: 'map', primary: true },
  { href: '/check-in', label: 'Check-In', short: 'Check-in', icon: 'check', primary: true },
  { href: '/progress', label: 'Progress', short: 'Progress', icon: 'chart', primary: true },
  { href: '/leaderboard', label: 'Leaderboard', short: 'Ranks', icon: 'trophy', primary: true },
  { href: '/calendar', label: 'Calendar', short: 'Calendar', icon: 'calendar', primary: false },
  { href: '/materials', label: 'Materials', short: 'Materials', icon: 'book', primary: false },
  { href: '/profile', label: 'Profile', short: 'Profile', icon: 'user', primary: false },
];

export const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Overview', short: 'Overview', icon: 'home', primary: true },
  { href: '/admin/attendance', label: 'Attendance', short: 'Attend', icon: 'check', primary: true },
  { href: '/admin/students', label: 'Students', short: 'Students', icon: 'user', primary: true },
  { href: '/admin/roadmaps', label: 'Roadmaps', short: 'Roadmaps', icon: 'map', primary: true },
  { href: '/admin/check-ins', label: 'Check-Ins', short: 'Check-ins', icon: 'chart', primary: true },
  { href: '/admin/events', label: 'Events', short: 'Events', icon: 'calendar', primary: false },
  { href: '/admin/materials', label: 'Materials', short: 'Materials', icon: 'book', primary: false },
  { href: '/admin/settings', label: 'Settings', short: 'Settings', icon: 'trophy', primary: false },
];
