import type { CategorisedSample, Category, Rule } from '@dailybee/tracker';
import type { Checkin, DayDigest, Entry, Project, ReportDraft, TaskRef, TaskSize, Outcome } from '../shared/types';
import { clock, dayKey } from '../shared/time';
import type { Db, Row } from './db';

/** Typed access to the local tables. Keeps SQL out of the services. */
export class Repo {
  constructor(private readonly db: Db) {}

  // ---- kv -------------------------------------------------------------
  getKv<T>(key: string, fallback: T): T {
    const r = this.db.get<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key]);
    if (!r) return fallback;
    try { return JSON.parse(r.value) as T; } catch { return fallback; }
  }
  setKv(key: string, value: unknown, priority: 'high' | 'low' = 'high'): void {
    this.db.run('INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, JSON.stringify(value)]);
    this.db.touch(priority);
  }

  // ---- samples --------------------------------------------------------
  insertSample(s: CategorisedSample, task: string | null): void {
    this.db.run(
      'INSERT INTO samples(ts, day, app, process, title, url, page_title, browser, url_source, idle, category, domain, matched, task) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [s.ts, dayKey(s.ts), s.app, s.process, s.title, s.url, s.pageTitle, s.browser, s.urlSource, s.idle ? 1 : 0, s.category, s.domain, s.matched ? 1 : 0, task],
    );
    this.db.touch('low');
  }
  samplesForDay(day: string): CategorisedSample[] {
    return this.db.all<Row>('SELECT * FROM samples WHERE day = ? ORDER BY ts', [day]).map(rowToSample);
  }
  sampleCount(day: string): number {
    return Number(this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM samples WHERE day = ?', [day])?.n ?? 0);
  }
  /** Timestamp of the newest stored sample: the last moment the app was known to be tracking. */
  lastSampleTs(): number | null {
    const ts = this.db.get<{ ts: number | null }>('SELECT MAX(ts) AS ts FROM samples')?.ts;
    return ts == null ? null : Number(ts);
  }
  recategoriseSamples(day: string, target: { kind: 'domain' | 'app'; value: string }, cat: Category): number {
    if (target.kind === 'domain') {
      this.db.run("UPDATE samples SET category = ?, matched = 1 WHERE day = ? AND (domain = ? OR domain LIKE ?)", [cat, day, target.value, '%.' + target.value]);
    } else {
      this.db.run('UPDATE samples SET category = ?, matched = 1 WHERE day = ? AND app = ? AND domain IS NULL', [cat, day, target.value]);
    }
    this.db.touch('high');
    return 1;
  }
  /** Distinct app names today (for sync: names only, never titles/URLs). */
  appNamesForDay(day: string, limit = 5): string[] {
    return this.db.all<{ app: string }>('SELECT app, COUNT(*) AS n FROM samples WHERE day = ? AND idle = 0 GROUP BY app ORDER BY n DESC LIMIT ?', [day, limit]).map((r) => r.app);
  }
  pruneSamplesBefore(day: string): void {
    this.db.run('DELETE FROM samples WHERE day < ?', [day]);
    this.db.touch('low');
  }
  deleteSamplesForDay(day: string): void {
    this.db.run('DELETE FROM samples WHERE day = ?', [day]);
    this.db.touch('low');
  }

  // ---- rules ----------------------------------------------------------
  rules(): Rule[] {
    return this.db.all<{ id: number; match: string; pattern: string; category: string }>('SELECT id, match, pattern, category FROM rules ORDER BY created_at DESC').map((r) => ({ id: r.id, match: r.match as Rule['match'], pattern: r.pattern, category: r.category as Category, source: 'user' as const }));
  }
  upsertRule(match: Rule['match'], pattern: string, category: Category): void {
    this.db.run('INSERT INTO rules(match, pattern, category, created_at) VALUES(?,?,?,?) ON CONFLICT(match, pattern) DO UPDATE SET category = excluded.category, created_at = excluded.created_at', [match, pattern, category, Date.now()]);
    this.db.touch('high');
  }
  removeRule(id: number): void {
    this.db.run('DELETE FROM rules WHERE id = ?', [id]);
    this.db.touch('high');
  }

  // ---- entries --------------------------------------------------------
  entriesForDay(day: string): Entry[] {
    return this.db.all<Row>('SELECT * FROM entries WHERE day = ? ORDER BY start_ts', [day]).map(rowToEntry);
  }
  entriesBetween(fromTs: number, toTs: number): Entry[] {
    return this.db.all<Row>('SELECT * FROM entries WHERE start_ts >= ? AND start_ts < ? ORDER BY start_ts', [fromTs, toTs]).map(rowToEntry);
  }
  upsertEntry(e: Entry): void {
    this.db.run(
      `INSERT INTO entries(id, day, task, ref, project, start_ts, seconds, done, outcome, summary, blocker, size_check, size, goal, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET day=excluded.day, task=excluded.task, ref=excluded.ref, project=excluded.project, start_ts=excluded.start_ts, seconds=excluded.seconds, done=excluded.done, outcome=excluded.outcome, summary=excluded.summary, blocker=excluded.blocker, size_check=excluded.size_check, size=excluded.size, goal=excluded.goal, updated_at=excluded.updated_at`,
      [e.id, e.day, e.task, e.ref, e.project, e.startTs, e.seconds, e.done ? 1 : 0, e.outcome ?? null, e.summary ?? null, e.blocker ? 1 : 0, e.sizeCheck ?? null, e.size ?? null, e.goal ?? null, Date.now()],
    );
    this.db.touch('high');
  }
  entry(id: string): Entry | undefined {
    const r = this.db.get<Row>('SELECT * FROM entries WHERE id = ?', [id]);
    return r ? rowToEntry(r) : undefined;
  }
  entryCount(): number {
    return Number(this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM entries')?.n ?? 0);
  }

  // ---- checkins -------------------------------------------------------
  checkinsForDay(day: string): Checkin[] {
    return this.db.all<Row>('SELECT * FROM checkins WHERE day = ? ORDER BY ts', [day]).map(rowToCheckin);
  }
  upsertCheckin(c: Checkin): void {
    this.db.run('INSERT INTO checkins(id, day, ts, kind, text, answer, task, domain) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET day = excluded.day, ts = excluded.ts, kind = excluded.kind, answer = excluded.answer, text = excluded.text, task = excluded.task, domain = excluded.domain', [c.id, c.day, c.ts, c.kind, c.text, c.answer, c.task, c.domain]);
    this.db.touch('high');
  }
  checkin(id: string): Checkin | undefined {
    const r = this.db.get<Row>('SELECT * FROM checkins WHERE id = ?', [id]);
    return r ? rowToCheckin(r) : undefined;
  }

  // ---- reports --------------------------------------------------------
  report(day: string): ReportDraft | null {
    const r = this.db.get<{ json: string }>('SELECT json FROM reports WHERE day = ?', [day]);
    if (!r) return null;
    try { return JSON.parse(r.json) as ReportDraft; } catch { return null; }
  }
  saveReport(d: ReportDraft): void {
    this.db.run('INSERT INTO reports(day, json, status, sent_at, updated_at) VALUES(?,?,?,?,?) ON CONFLICT(day) DO UPDATE SET json = excluded.json, status = excluded.status, sent_at = excluded.sent_at, updated_at = excluded.updated_at', [d.day, JSON.stringify(d), d.status, d.sentAt, Date.now()]);
    this.db.touch('high');
  }
  reportDays(limit = 60): Array<{ day: string; status: string; json: string }> {
    return this.db.all<{ day: string; status: string; json: string }>('SELECT day, status, json FROM reports ORDER BY day DESC LIMIT ?', [limit]);
  }

  // ---- projects (registry in kv; a live profile starts empty, demo mode seeds the kit's three) ----
  projects(): Project[] {
    return this.getKv<Project[]>('projects', []).map((p) => ({ ...p, budgetHours: typeof p.budgetHours === 'number' ? p.budgetHours : 40 }));
  }
  saveProjects(list: Project[]): void { this.setKv('projects', list); }
  /** How many tasks and entries still reference a project (a project in use is archived, not deleted). */
  projectUsage(id: string): { tasks: number; entries: number } {
    const entries = Number(this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM entries WHERE project = ?', [id])?.n ?? 0);
    return { tasks: this.tasks().filter((t) => t.project === id).length, entries };
  }

  // ---- day digests (the breakdown of a finished day, kept after its samples are pruned) ----
  digest(day: string): DayDigest | null {
    const r = this.db.get<{ json: string }>('SELECT json FROM day_digest WHERE day = ?', [day]);
    if (!r) return null;
    try { return JSON.parse(r.json) as DayDigest; } catch { return null; }
  }
  saveDigest(day: string, d: DayDigest): void {
    this.db.run('INSERT INTO day_digest(day, json, updated_at) VALUES(?,?,?) ON CONFLICT(day) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at', [day, JSON.stringify(d), Date.now()]);
    this.db.touch('low');
  }
  daysWithSamples(): string[] {
    return this.db.all<{ day: string }>('SELECT DISTINCT day FROM samples ORDER BY day').map((r) => r.day);
  }
  /** Every day that has entries, a digest, a report or samples — newest first. */
  daysWithData(limit = 60): string[] {
    return this.db.all<{ day: string }>('SELECT day FROM (SELECT day FROM entries UNION SELECT day FROM day_digest UNION SELECT day FROM reports UNION SELECT DISTINCT day FROM samples) ORDER BY day DESC LIMIT ?', [limit]).map((r) => r.day);
  }

  // ---- tasks ----------------------------------------------------------
  tasks(): TaskRef[] {
    return this.db.all<{ json: string }>('SELECT json FROM tasks ORDER BY updated_at DESC').map((r) => JSON.parse(r.json) as TaskRef);
  }
  saveTask(t: TaskRef): void {
    this.db.run('INSERT INTO tasks(id, json, updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at', [t.id, JSON.stringify(t), Date.now()]);
    this.db.touch('high');
  }
  taskCount(): number {
    return Number(this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM tasks')?.n ?? 0);
  }
}

function rowToSample(r: Row): CategorisedSample {
  return {
    ts: Number(r.ts), app: String(r.app), process: r.process == null ? null : String(r.process), title: String(r.title ?? ''), url: r.url == null ? null : String(r.url), pageTitle: r.page_title == null ? null : String(r.page_title),
    browser: (r.browser as CategorisedSample['browser']) ?? null, urlSource: String(r.url_source) as CategorisedSample['urlSource'], idle: Number(r.idle) === 1,
    category: String(r.category) as Category, domain: r.domain == null ? null : String(r.domain), matched: Number(r.matched) === 1,
    tracked: r.task != null,
  };
}

function rowToEntry(r: Row): Entry {
  return {
    id: String(r.id), day: String(r.day), task: String(r.task), ref: r.ref == null ? null : String(r.ref), project: String(r.project), startTs: Number(r.start_ts), start: clock(Number(r.start_ts)),
    seconds: Number(r.seconds), done: Number(r.done) === 1, outcome: (r.outcome as Outcome) ?? undefined, summary: r.summary == null ? undefined : String(r.summary), blocker: Number(r.blocker ?? 0) === 1,
    sizeCheck: (r.size_check as TaskSize) ?? undefined, size: (r.size as TaskSize) ?? undefined, goal: r.goal == null ? undefined : String(r.goal),
  };
}

function rowToCheckin(r: Row): Checkin {
  return { id: String(r.id), day: String(r.day), ts: Number(r.ts), at: clock(Number(r.ts)), kind: String(r.kind) as Checkin['kind'], text: String(r.text), answer: r.answer == null ? null : String(r.answer), task: r.task == null ? null : String(r.task), domain: r.domain == null ? null : String(r.domain) };
}
