export const pad2 = (n: number): string => String(n).padStart(2, '0');

export type DurationMode = 'clock' | 'short';

/** `clock` = 02:15:43 (live timer), `short` = 2h 15m — every duration in the product goes through here. */
export function formatDuration(sec: number, mode: DurationMode = 'clock'): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (mode === 'short') return h ? `${h}h ${pad2(m)}m` : m ? `${m}m` : total > 0 ? '<1m' : '0m';
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

/** "Mon 7 Sep" — the product's date format. */
export function formatDay(d: Date = new Date()): string {
  const wd = d.toLocaleDateString('en-GB', { weekday: 'short' });
  const mo = d.toLocaleDateString('en-GB', { month: 'short' });
  return `${wd} ${d.getDate()} ${mo}`;
}

/** "12:41" — 24h clock. */
export function formatClock(d: Date | number): string {
  const x = typeof d === 'number' ? new Date(d) : d;
  return `${pad2(x.getHours())}:${pad2(x.getMinutes())}`;
}
