'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

import { cn } from '@/lib/cn';

/**
 * Counts up to `value` on mount and whenever it changes. Points arriving as a number that
 * climbs is a large part of why earning them feels like earning them.
 */
export function AnimatedCounter({
  value,
  duration = 900,
  className,
  suffix,
  prefix,
}: {
  value: number;
  duration?: number;
  className?: string;
  suffix?: string;
  prefix?: string;
}) {
  const reduce = useReducedMotion();
  const [counted, setCounted] = useState(0);
  const fromRef = useRef(0);

  // With reduced motion the final value is rendered directly — no state write needed.
  const display = reduce ? value : counted;

  useEffect(() => {
    if (reduce) return;
    const from = fromRef.current;
    const delta = value - from;
    if (delta === 0) return;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutExpo keeps the last digits from crawling.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setCounted(Math.round(from + delta * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduce]);

  return (
    <span className={cn('tabular-nums', className)}>
      {prefix}
      {display.toLocaleString()}
      {suffix}
    </span>
  );
}
