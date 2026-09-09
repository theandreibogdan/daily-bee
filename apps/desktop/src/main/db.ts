import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import initSqlJs, { type Database, type SqlValue } from 'sql.js';

/**
 * Local store: SQLite via sql.js (WebAssembly — no native build step), persisted to a file in
 * userData. Everything the tracker sees stays in this file; sync only ever reads aggregates.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, day TEXT NOT NULL,
  app TEXT NOT NULL, process TEXT, title TEXT NOT NULL, url TEXT, page_title TEXT, browser TEXT,
  url_source TEXT NOT NULL, idle INTEGER NOT NULL, category TEXT NOT NULL, domain TEXT, matched INTEGER NOT NULL, task TEXT);
CREATE INDEX IF NOT EXISTS samples_day ON samples(day, ts);
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY, day TEXT NOT NULL, task TEXT NOT NULL, ref TEXT, project TEXT NOT NULL, start_ts INTEGER NOT NULL,
  seconds INTEGER NOT NULL, done INTEGER NOT NULL, outcome TEXT, summary TEXT, blocker INTEGER, size_check TEXT, size TEXT, goal TEXT, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS entries_day ON entries(day, start_ts);
CREATE TABLE IF NOT EXISTS checkins (id TEXT PRIMARY KEY, day TEXT NOT NULL, ts INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, answer TEXT, task TEXT, domain TEXT);
CREATE TABLE IF NOT EXISTS rules (id INTEGER PRIMARY KEY AUTOINCREMENT, match TEXT NOT NULL, pattern TEXT NOT NULL, category TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(match, pattern));
CREATE TABLE IF NOT EXISTS reports (day TEXT PRIMARY KEY, json TEXT NOT NULL, status TEXT NOT NULL, sent_at INTEGER, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at INTEGER NOT NULL);
`;

export type Row = Record<string, SqlValue>;

export class Db {
  private db!: Database;
  private timer: NodeJS.Timeout | null = null;
  private dueAt = 0;
  closed = false;

  constructor(private readonly file: string, private readonly log: (m: string) => void = () => {}) {}

  async open(): Promise<void> {
    const wasmDir = dirname(require.resolve('sql.js/dist/sql-wasm.js'));
    const SQL = await initSqlJs({ locateFile: (f: string) => join(wasmDir, f) });
    if (existsSync(this.file)) {
      try {
        this.db = new SQL.Database(readFileSync(this.file));
      } catch (e) {
        this.log('[db] could not read ' + this.file + ': ' + String(e) + ' — starting fresh');
        this.db = new SQL.Database();
      }
    } else {
      mkdirSync(dirname(this.file), { recursive: true });
      this.db = new SQL.Database();
    }
    this.db.exec('PRAGMA journal_mode = MEMORY;');
    this.db.exec(SCHEMA);
  }

  run(sql: string, params: SqlValue[] = []): void {
    this.db.run(sql, params);
  }

  all<T extends Row = Row>(sql: string, params: SqlValue[] = []): T[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const out: T[] = [];
      while (stmt.step()) out.push(stmt.getAsObject() as T);
      return out;
    } finally {
      stmt.free();
    }
  }

  get<T extends Row = Row>(sql: string, params: SqlValue[] = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  /**
   * Schedule a write: 'high' within 1s (user data), 'low' within 5s (samples, heartbeat). A killed
   * process (Ctrl+C in the dev terminal, a dev-server restart, a crash) skips the exit flush, so
   * the window of loss is kept small.
   */
  touch(priority: 'high' | 'low' = 'high'): void {
    const delay = priority === 'high' ? 1000 : 5000;
    const at = Date.now() + delay;
    if (this.timer && this.dueAt <= at) return;
    if (this.timer) clearTimeout(this.timer);
    this.dueAt = at;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, delay);
  }

  flush(): void {
    if (this.closed) return;
    try {
      const data = this.db.export();
      const tmp = this.file + '.tmp';
      writeFileSync(tmp, Buffer.from(data));
      renameSync(tmp, this.file);
    } catch (e) {
      this.log('[db] flush failed: ' + String(e));
    }
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.flush();
    this.closed = true;
    this.db.close();
  }
}
