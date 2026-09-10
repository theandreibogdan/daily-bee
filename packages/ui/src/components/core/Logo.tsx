import type { CSSProperties } from 'react';

/** A flat-top hexagon with 44 px rounded corners around (512, 512), circumradius about 451; the app icon uses the same path (assets/dailybee-logo.svg). */
export const LOGO_PATH = 'M950.1,490 A44,44 0 0 1 950.1,534 L750.1,880.4 A44,44 0 0 1 712,902.4 L312,902.4 A44,44 0 0 1 273.9,880.4 L73.9,534 A44,44 0 0 1 73.9,490 L273.9,143.6 A44,44 0 0 1 312,121.6 L712,121.6 A44,44 0 0 1 750.1,143.6 Z';

export interface LogoProps {
  /** Rendered size in px (the mark is square) */
  size?: number;
  /** Fill; the honey token by default, `currentColor` to follow the text */
  color?: string;
  style?: CSSProperties;
  title?: string;
}

/**
 * The DailyBee mark: one honeycomb cell, a flat-top hexagon with rounded corners, one filled path. The same shape is the application icon (assets/dailybee-logo.svg,
 * rendered to PNG by scripts/render-icons.cjs).
 */
export function Logo({ size = 20, color = 'var(--honey-500)', style, title }: LogoProps) {
  return (
    <svg viewBox="0 0 1024 1024" width={size} height={size} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} style={{ display: 'block', flexShrink: 0, ...style }}>
      {title && <title>{title}</title>}
      <path d={LOGO_PATH} fill={color} />
    </svg>
  );
}
