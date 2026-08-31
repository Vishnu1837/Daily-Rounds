import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Home,
  Map,
  Settings,
  Sparkles,
  Timer,
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
  check: CheckCircle2,
  user: User,
  users: Users,
  settings: Settings,
  sparkles: Sparkles,
  timer: Timer,
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
