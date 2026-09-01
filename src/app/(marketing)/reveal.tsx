'use client';

import { useEffect } from 'react';

/**
 * Section entrances for the public page.
 *
 * A single observer for the whole document rather than a component wrapper per section,
 * because the sections themselves stay server-rendered — the entire landing page is static
 * HTML, and this is the one script on it.
 *
 * The hidden state lives behind `data-reveal-ready`, which this component sets on mount.
 * That ordering is the point: if the script never runs, never hydrates, or is stripped by a
 * proxy, the page is simply visible. Nothing a visitor needs to read is gated on an
 * animation, and reduced-motion users skip the observer entirely rather than getting a
 * zero-duration version of it.
 */
export function RevealScript() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-reveal-root]');
    if (!root) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') return;

    root.setAttribute('data-reveal-ready', '');

    const targets = Array.from(root.querySelectorAll<HTMLElement>('.ed-reveal'));

    // Anything already on screen at load — the hero — is shown immediately rather than
    // animated, so the first paint is never a blank panel that fades in late.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    );

    for (const target of targets) {
      if (target.getBoundingClientRect().top < window.innerHeight) {
        target.classList.add('is-visible');
      } else {
        observer.observe(target);
      }
    }

    return () => {
      observer.disconnect();
      root.removeAttribute('data-reveal-ready');
    };
  }, []);

  return null;
}
