export const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Local calendar day key, YYYY-MM-DD. */
export function dayKey(ts: number | Date = Date.now()): string {
  const d = typeof ts === 'number' ? new Date(ts) : ts;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "09:05" */
export function clock(ts: number | Date): string {
  const d = typeof ts === 'number' ? new Date(ts) : ts;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "Mon 7 Sep" */
export function dayLabel(dayOrTs: string | number | Date = Date.now()): string {
  const d = typeof dayOrTs === 'string' ? new Date(dayOrTs + 'T12:00:00') : typeof dayOrTs === 'number' ? new Date(dayOrTs) : dayOrTs;
  const wd = d.toLocaleDateString('en-GB', { weekday: 'short' });
  const mo = d.toLocaleDateString('en-GB', { month: 'short' });
  return `${wd} ${d.getDate()} ${mo}`;
}

/** epoch ms for a "HH:MM" on a given day (today by default). */
export function atTime(hhmm: string, day: string = dayKey()): number {
  const [h = 0, m = 0] = hhmm.split(':').map((x) => parseInt(x, 10));
  const d = new Date(day + 'T00:00:00');
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

export function startOfDay(ts: number = Date.now()): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Monday 00:00 of the week containing ts. */
export function startOfWeek(ts: number = Date.now()): number {
  const d = new Date(startOfDay(ts));
  const dow = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

export function formatDurationShort(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60);
  return h ? `${h}h ${pad2(m)}m` : m ? `${m}m` : total > 0 ? '<1m' : '0m';
}

export const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
