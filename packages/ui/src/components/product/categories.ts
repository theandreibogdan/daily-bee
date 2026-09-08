/** Activity categories of the desktop tracker (see readme "Activity categories"). */
export const CATEGORIES = ['work', 'research', 'learning', 'communication', 'distraction'] as const;
export type Category = (typeof CATEGORIES)[number];
/** Timeline segments may also be a break (no samples / idle). */
export type TimelineCategory = Category | 'break';

export const CAT_LABEL: Record<TimelineCategory, string> = {
  work: 'Work',
  research: 'Research',
  learning: 'Learning',
  communication: 'Communication',
  distraction: 'Distraction',
  break: 'Break',
};

export const catColor = (c: TimelineCategory): string => c === 'break' ? 'var(--hive-200)' : `var(--cat-${c})`;
export const catBg = (c: TimelineCategory): string => c === 'break' ? 'var(--hive-100)' : `var(--cat-${c}-bg)`;

const TEXT: Record<TimelineCategory, string> = {
  work: 'var(--honey-800)',
  research: 'var(--blue-700)',
  learning: 'var(--green-700)',
  communication: 'var(--hive-800)',
  distraction: 'var(--red-700)',
  break: 'var(--hive-600)',
};
export const catText = (c: TimelineCategory): string => TEXT[c];

/** "Focus" = work + research + learning share. */
export const isFocus = (c: Category): boolean => c === 'work' || c === 'research' || c === 'learning';
