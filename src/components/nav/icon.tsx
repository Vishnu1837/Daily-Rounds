import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Home,
  Inbox,
  Library,
  Map,
  Settings,
  Sparkles,
  Timer,
  TreeDeciduous,
  TrendingUp,
  Trophy,
  User,
  Users,
} from 'lucide-react';

import type { NavIconName } from './nav-items';

const ICONS = {
  home: Home,
  map: Map,
  calendar: CalendarDays,
  chart: TrendingUp,
  trophy: Trophy,
  book: BookOpen,
  library: Library,
  check: CheckCircle2,
  user: User,
  users: Users,
  settings: Settings,
  sparkles: Sparkles,
  timer: Timer,
  tree: TreeDeciduous,
  inbox: Inbox,
} as const satisfies Record<NavIconName, unknown>;

export function NavIcon({
  name,
  className,
  strokeWidth = 2,
}: {
  name: NavIconName;
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = ICONS[name];
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden />;
}
