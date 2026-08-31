import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Home,
  Map,
  TrendingUp,
  Trophy,
  User,
} from 'lucide-react';

import type { NavItem } from './nav-items';

const ICONS = {
  home: Home,
  map: Map,
  calendar: CalendarDays,
  chart: TrendingUp,
  trophy: Trophy,
  book: BookOpen,
  check: CheckCircle2,
  user: User,
} as const;

export function NavIcon({
  name,
  className,
  strokeWidth = 2,
}: {
  name: NavItem['icon'];
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = ICONS[name];
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden />;
}
