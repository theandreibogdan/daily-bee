const pad2 = (n: number) => String(n).padStart(2, '0');

export function dayKey(ts: number | Date = Date.now()): string {
  const d = typeof ts === 'number' ? new Date(ts) : ts;
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function addDays(day: string, n: number): string {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return dayKey(d);
}

/** Monday of the ISO week containing `day`. */
export function weekStart(day: string): string {
  const d = new Date(day + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

export function weekday(day: string): number {
  return (new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7; // Mon=0
}

export function isWeekday(day: string): boolean {
  return weekday(day) < 5;
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
