import type { CSSProperties, ComponentType, SVGProps } from 'react';
import { icons, type LucideProps } from 'lucide-react';

/**
 * Thin wrapper over Lucide so screens never hand-roll SVGs. Accepts the kebab-case
 * names used throughout the design kits ("play", "file-text") and resolves them
 * against `lucide-react`, including names Lucide has since renamed.
 */
const RENAMED: Record<string, string[]> = {
  'code-2': ['code-xml'],
  'check-circle-2': ['circle-check-big', 'circle-check'],
  'check-circle': ['circle-check', 'circle-check-big'],
  'alert-circle': ['circle-alert'],
  'alert-triangle': ['triangle-alert'],
  'loader-2': ['loader-circle'],
  'message-circle-question': ['message-circle-question-mark'],
  'help-circle': ['circle-question-mark', 'circle-help'],
  'circle-help': ['circle-question-mark'],
  'x-circle': ['circle-x'],
  'more-horizontal': ['ellipsis'],
  'more-vertical': ['ellipsis-vertical'],
  'edit-3': ['pen-line'],
  'edit-2': ['pen'],
  'edit': ['square-pen'],
  'trash-2': ['trash'],
};

const toPascal = (s: string): string =>
  s.split('-').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');

type IconComponent = ComponentType<LucideProps>;
const registry = icons as unknown as Record<string, IconComponent | undefined>;
const cache = new Map<string, IconComponent | null>();
const warned = new Set<string>();

export function resolveIcon(name: string): IconComponent | null {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const candidates = [name, ...(RENAMED[name] ?? [])];
  let found: IconComponent | null = null;
  for (const c of candidates) {
    const C = registry[toPascal(c)];
    if (C) { found = C; break; }
  }
  cache.set(name, found);
  return found;
}

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'ref'> {
  /** Lucide icon name, kebab-case, e.g. "play", "file-text" */
  name: string;
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
}

export function Icon({ name, size = 16, strokeWidth = 1.5, style, ...rest }: IconProps) {
  const C = resolveIcon(name);
  const base: CSSProperties = { flexShrink: 0, display: 'inline-block', verticalAlign: 'middle', ...style };
  if (!C) {
    if (!warned.has(name)) { warned.add(name); console.warn(`[dailybee/ui] Unknown icon "${name}"`); }
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={base} {...rest}>
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  }
  return <C size={size} strokeWidth={strokeWidth} aria-hidden="true" style={base} {...(rest as LucideProps)} />;
}
