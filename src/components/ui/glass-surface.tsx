'use client';

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
} from 'react';

import { cn } from '@/lib/cn';

/*
 * A refracting "liquid glass" pane, adapted from React Bits' GlassSurface.
 *
 * On Chromium the backdrop is pushed through an SVG displacement filter: a generated map
 * bends whatever sits behind the edges of the pane, and the three colour channels are
 * displaced by slightly different amounts so the rim picks up a thin chromatic fringe.
 * WebKit and Gecko cannot run an SVG filter as a backdrop-filter — which means every
 * browser on an iPhone — so they get a frosted, tinted pane instead. The tint and rim are
 * shared tokens (`--glass-*` in globals.css), so both paths read as the same material.
 */

type Channel = 'R' | 'G' | 'B';

export interface GlassSurfaceProps {
  children?: ReactNode;
  width?: number | string;
  height?: number | string;
  /** In pixels. Clamped to half the short side when drawing the map, so 999 means "pill". */
  borderRadius?: number;
  /** Width of the refracting rim, as a fraction of the short side. */
  borderWidth?: number;
  brightness?: number;
  opacity?: number;
  /** Softens the displacement map, which widens and smooths the refraction. */
  blur?: number;
  /** Blur applied to the displaced output. */
  displace?: number;
  /** Frost over the backdrop, 0–1. */
  backgroundOpacity?: number;
  saturation?: number;
  distortionScale?: number;
  redOffset?: number;
  greenOffset?: number;
  blueOffset?: number;
  xChannel?: Channel;
  yChannel?: Channel;
  mixBlendMode?: CSSProperties['mixBlendMode'];
  className?: string;
  contentClassName?: string;
  style?: CSSProperties;
}

let svgBackdropSupport: boolean | undefined;

/**
 * Only Blink actually renders an SVG filter as a backdrop — WebKit parses `url()` and then
 * draws nothing. So this asks which engine is running rather than trusting the user-agent
 * string: `window.chrome` exists in every Blink browser (and survives DevTools' phone
 * emulation, which swaps in a Safari UA), while iOS browsers are WebKit whatever they call
 * themselves. Support never changes during a session, so it is probed once.
 */
function supportsSvgBackdrop(): boolean {
  if (svgBackdropSupport !== undefined) return svgBackdropSupport;
  const isBlink = 'chrome' in window;
  const isIos = /CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
  if (!isBlink || isIos) return (svgBackdropSupport = false);

  const probe = document.createElement('div');
  probe.style.backdropFilter = 'url(#probe)';
  return (svgBackdropSupport = probe.style.backdropFilter !== '');
}

const noopSubscribe = () => () => {};

export function GlassSurface({
  children,
  width = '100%',
  height = 'auto',
  borderRadius = 20,
  borderWidth = 0.07,
  brightness = 50,
  opacity = 0.93,
  blur = 11,
  displace = 0,
  backgroundOpacity = 0,
  saturation = 1,
  distortionScale = -180,
  redOffset = 0,
  greenOffset = 10,
  blueOffset = 20,
  xChannel = 'R',
  yChannel = 'G',
  mixBlendMode = 'difference',
  className,
  contentClassName,
  style,
}: GlassSurfaceProps) {
  // React's ids carry characters that are not valid inside `url(#…)`.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const filterId = `glass-filter-${uid}`;
  const redGradId = `glass-red-${uid}`;
  const blueGradId = `glass-blue-${uid}`;

  // False on the server and during hydration, so the first paint is always the frosted pane.
  const svgSupported = useSyncExternalStore(noopSubscribe, supportsSvgBackdrop, () => false);

  const containerRef = useRef<HTMLDivElement>(null);
  const feImageRef = useRef<SVGFEImageElement>(null);
  const redRef = useRef<SVGFEDisplacementMapElement>(null);
  const greenRef = useRef<SVGFEDisplacementMapElement>(null);
  const blueRef = useRef<SVGFEDisplacementMapElement>(null);
  const gaussianRef = useRef<SVGFEGaussianBlurElement>(null);

  // The map is drawn at the pane's real size, so it is redrawn whenever that changes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const draw = () => {
      const rect = container.getBoundingClientRect();
      const w = rect.width || 400;
      const h = rect.height || 200;
      const edge = Math.min(w, h) * (borderWidth * 0.5);
      const r = Math.min(borderRadius, w / 2, h / 2);
      const innerR = Math.max(0, r - edge);

      const svg = `
        <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="${redGradId}" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%" stop-color="#0000"/>
              <stop offset="100%" stop-color="red"/>
            </linearGradient>
            <linearGradient id="${blueGradId}" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#0000"/>
              <stop offset="100%" stop-color="blue"/>
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="${w}" height="${h}" fill="black"/>
          <rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="url(#${redGradId})"/>
          <rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="url(#${blueGradId})" style="mix-blend-mode:${mixBlendMode}"/>
          <rect x="${edge}" y="${edge}" width="${w - edge * 2}" height="${h - edge * 2}" rx="${innerR}" ry="${innerR}" fill="hsl(0 0% ${brightness}% / ${opacity})" style="filter:blur(${blur}px)"/>
        </svg>`;

      feImageRef.current?.setAttribute('href', `data:image/svg+xml,${encodeURIComponent(svg)}`);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, [borderRadius, borderWidth, brightness, opacity, blur, mixBlendMode, redGradId, blueGradId]);

  useEffect(() => {
    for (const [ref, offset] of [
      [redRef, redOffset],
      [greenRef, greenOffset],
      [blueRef, blueOffset],
    ] as const) {
      ref.current?.setAttribute('scale', String(distortionScale + offset));
      ref.current?.setAttribute('xChannelSelector', xChannel);
      ref.current?.setAttribute('yChannelSelector', yChannel);
    }
    gaussianRef.current?.setAttribute('stdDeviation', String(displace));
  }, [distortionScale, redOffset, greenOffset, blueOffset, xChannel, yChannel, displace]);

  const containerStyle = {
    ...style,
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    borderRadius: `${borderRadius}px`,
    '--glass-frost-amount': backgroundOpacity,
    '--glass-saturation': saturation,
    '--filter-id': `url(#${filterId})`,
  } as CSSProperties;

  return (
    <div
      ref={containerRef}
      className={cn(
        'glass-surface',
        svgSupported ? 'glass-surface--svg' : 'glass-surface--fallback',
        className,
      )}
      style={containerStyle}
    >
      <svg className="glass-surface__filter" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <defs>
          <filter
            id={filterId}
            colorInterpolationFilters="sRGB"
            x="0%"
            y="0%"
            width="100%"
            height="100%"
          >
            <feImage
              ref={feImageRef}
              x="0"
              y="0"
              width="100%"
              height="100%"
              preserveAspectRatio="none"
              result="map"
            />

            <feDisplacementMap ref={redRef} in="SourceGraphic" in2="map" result="dispRed" />
            <feColorMatrix
              in="dispRed"
              type="matrix"
              values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="red"
            />

            <feDisplacementMap ref={greenRef} in="SourceGraphic" in2="map" result="dispGreen" />
            <feColorMatrix
              in="dispGreen"
              type="matrix"
              values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="green"
            />

            <feDisplacementMap ref={blueRef} in="SourceGraphic" in2="map" result="dispBlue" />
            <feColorMatrix
              in="dispBlue"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
              result="blue"
            />

            <feBlend in="red" in2="green" mode="screen" result="rg" />
            <feBlend in="rg" in2="blue" mode="screen" result="output" />
            <feGaussianBlur ref={gaussianRef} in="output" stdDeviation="0.7" />
          </filter>
        </defs>
      </svg>

      <div className={cn('glass-surface__content', contentClassName)}>{children}</div>
    </div>
  );
}
