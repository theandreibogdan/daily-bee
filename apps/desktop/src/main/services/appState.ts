import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** What the app remembers across profiles (userData/app-state.json): the version that last ran, and release notes waiting to be shown. */
export interface AppStateData {
  lastRunVersion: string | null;
  /** Release notes saved when an update finished downloading, shown once after the app comes back in that version */
  pendingNotes: { version: string; notes: string; at: number } | null;
}

const EMPTY: AppStateData = { lastRunVersion: null, pendingNotes: null };

export class AppState {
  private data: AppStateData;

  constructor(private readonly file: string, private readonly log: (m: string) => void = () => {}) {
    this.data = { ...EMPTY };
    if (existsSync(file)) {
      // A byte-order mark (a hand edit in Notepad or PowerShell) must not throw the state away.
      try { this.data = { ...EMPTY, ...(JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as Partial<AppStateData>) }; }
      catch (e) { log('[app-state] could not read ' + file + ': ' + String(e)); }
    }
  }

  get(): AppStateData { return this.data; }

  update(patch: Partial<AppStateData>): AppStateData {
    this.data = { ...this.data, ...patch };
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      renameSync(tmp, this.file);
    } catch (e) { this.log('[app-state] could not write ' + this.file + ': ' + String(e)); }
    return this.data;
  }
}
