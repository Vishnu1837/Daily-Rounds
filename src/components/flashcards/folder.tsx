'use client';

import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

import './folder.css';

/**
 * Folder — ported from React Bits (reactbits.dev), JavaScript + CSS variant, typed for this
 * codebase.
 *
 * Two modes:
 *   - Default: clicking toggles the folder open and fans its papers out (the upstream
 *     behaviour). Papers under the pointer follow it a little while open.
 *   - `onActivate` given: the folder becomes a single control — click / Enter / Space call
 *     `onActivate` instead of toggling — and the papers only *peek* on hover. This is how a
 *     deck folder navigates into its session.
 */

const darkenColor = (hex: string, percent: number): string => {
  let color = hex.startsWith('#') ? hex.slice(1) : hex;
  if (color.length === 3) {
    color = color
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const num = parseInt(color.slice(0, 6), 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  r = Math.max(0, Math.min(255, Math.floor(r * (1 - percent))));
  g = Math.max(0, Math.min(255, Math.floor(g * (1 - percent))));
  b = Math.max(0, Math.min(255, Math.floor(b * (1 - percent))));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
};

export type FolderProps = {
  /** Primary colour of the folder. Hex. */
  color?: string;
  /** Scale factor for the whole folder. */
  size?: number;
  /** Up to three nodes, rendered as the papers inside. */
  items?: ReactNode[];
  className?: string;
  /** When set, the folder is a button: click/Enter/Space fire this and papers only peek. */
  onActivate?: () => void;
  /** Accessible label for the folder control. */
  ariaLabel?: string;
};

const MAX_ITEMS = 3;

export default function Folder({
  color = '#5227FF',
  size = 1,
  items = [],
  className = '',
  onActivate,
  ariaLabel,
}: FolderProps) {
  const papers: ReactNode[] = items.slice(0, MAX_ITEMS);
  while (papers.length < MAX_ITEMS) papers.push(null);

  const [open, setOpen] = useState(false);
  const [paperOffsets, setPaperOffsets] = useState(
    Array.from({ length: MAX_ITEMS }, () => ({ x: 0, y: 0 })),
  );

  const folderBackColor = darkenColor(color, 0.08);
  const paper1 = darkenColor('#ffffff', 0.1);
  const paper2 = darkenColor('#ffffff', 0.05);
  const paper3 = '#ffffff';

  const resetOffsets = () =>
    setPaperOffsets(Array.from({ length: MAX_ITEMS }, () => ({ x: 0, y: 0 })));

  const activate = () => {
    if (onActivate) {
      onActivate();
      return;
    }
    setOpen((prev) => {
      if (prev) resetOffsets();
      return !prev;
    });
  };

  const handlePaperMouseMove = (e: MouseEvent<HTMLDivElement>, index: number) => {
    if (!open) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const offsetX = (e.clientX - centerX) * 0.15;
    const offsetY = (e.clientY - centerY) * 0.15;
    setPaperOffsets((prev) => {
      const next = [...prev];
      next[index] = { x: offsetX, y: offsetY };
      return next;
    });
  };

  const handlePaperMouseLeave = (index: number) => {
    setPaperOffsets((prev) => {
      const next = [...prev];
      next[index] = { x: 0, y: 0 };
      return next;
    });
  };

  const folderStyle = {
    '--folder-color': color,
    '--folder-back-color': folderBackColor,
    '--paper-1': paper1,
    '--paper-2': paper2,
    '--paper-3': paper3,
  } as React.CSSProperties;

  return (
    <div style={{ transform: `scale(${size})` }} className={className}>
      <div
        className={cn('rbf', open && 'open')}
        style={folderStyle}
        onClick={activate}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activate();
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={onActivate ? undefined : open}
        aria-label={ariaLabel ?? (open ? 'Close folder' : 'Open folder')}
      >
        <div className="rbf__back">
          {papers.map((item, i) => (
            <div
              key={i}
              className="rbf-paper"
              onMouseMove={(e) => handlePaperMouseMove(e, i)}
              onMouseLeave={() => handlePaperMouseLeave(i)}
              style={
                open
                  ? ({
                      '--magnet-x': `${paperOffsets[i]?.x ?? 0}px`,
                      '--magnet-y': `${paperOffsets[i]?.y ?? 0}px`,
                    } as React.CSSProperties)
                  : undefined
              }
            >
              {item}
            </div>
          ))}
          <div className="rbf__front" />
          <div className="rbf__front rbf__front--right" />
        </div>
      </div>
    </div>
  );
}
