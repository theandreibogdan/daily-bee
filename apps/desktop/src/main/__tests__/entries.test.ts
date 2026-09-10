import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isEdited, type Entry } from '../../shared/types';
import { dayKey } from '../../shared/time';
import { Db } from '../db';
import { Repo } from '../repo';
import { EntryService } from '../services/entries';

const T0 = Date.parse('2026-09-08T09:00:00');
const DAY = dayKey(T0);
let dir: string;
let db: Db;
let repo: Repo;
let svc: EntryService;
let now = T0 + 8 * 3600_000;
const changed: string[][] = [];

const timerEntry = (id: string, task: string, startTs: number, seconds: number, ref: string | null = null): Entry => ({ id, day: dayKey(startTs), task, ref, project: 'api', startTs, start: '', seconds, done: false, outcome: 'Partly done', origin: 'timer' });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dailybee-entries-'));
  db = new Db(join(dir, 'test.sqlite'));
  await db.open();
  repo = new Repo(db);
  repo.saveProjects([{ id: 'api', name: 'api-gateway', color: 'var(--blue-500)', budgetHours: 40 }, { id: 'web', name: 'web-app', color: 'var(--green-500)', budgetHours: 40 }]);
  repo.saveTask({ id: 'DB-1', title: 'Timer sync', project: 'api', size: 'Large', estimate: 16, logged: 2, status: 'In progress', owner: 'FN' });
  svc = new EntryService(repo, { log: () => {}, now: () => now });
  svc.on('change', (c: { days: string[] }) => changed.push(c.days));
});
afterAll(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

describe('EntryService: hand corrections with an append-only change log', () => {
  it('edits an entry, counts the edit, logs what changed and keeps the linked task in step', () => {
    repo.upsertEntry(timerEntry('e1', 'Timer sync', T0, 2700, 'DB-1'));
    expect(isEdited(repo.entry('e1')!)).toBe(false);
    const e = svc.update('e1', { seconds: 1800, task: 'Timer sync (review)', project: 'web' }, 'forgot to stop at lunch');
    expect(e.edits).toBe(1);
    expect(e.editedAt).toBe(now);
    expect(e.origin).toBe('timer');
    expect(isEdited(e)).toBe(true);
    expect(e.seconds).toBe(1800);
    const log = svc.log(DAY);
    expect(log.items).toHaveLength(1);
    expect(log.items[0]).toMatchObject({ action: 'edit', entryId: 'e1', day: DAY, reason: 'forgot to stop at lunch' });
    expect(log.items[0]!.summary).toBe('Task “Timer sync” → “Timer sync (review)” · Project api-gateway → web-app · Duration 45m → 30m');
    expect(log.items[0]!.before).toMatchObject({ seconds: 2700, task: 'Timer sync' });
    expect(log.items[0]!.after).toMatchObject({ seconds: 1800, task: 'Timer sync (review)' });
    expect(repo.tasks().find((t) => t.id === 'DB-1')?.logged).toBe(1.75);
    expect(changed.at(-1)).toEqual([DAY]);
  });

  it('a patch that changes nothing is not an edit', () => {
    const before = repo.entry('e1')!;
    // The dialog edits start times to the minute: the seconds the timer recorded are not a difference.
    expect(svc.update('e1', { startTs: T0 + 30_000 })).toEqual(before);
    const e = svc.update('e1', { seconds: 1800 });
    expect(e.edits).toBe(1);
    expect(e).toEqual(before);
    expect(svc.log(DAY).items).toHaveLength(1);
  });

  it('refuses nonsense', () => {
    expect(() => svc.update('e1', { seconds: 30 })).toThrow('at least a minute');
    expect(() => svc.update('e1', { task: '  ' })).toThrow('name');
    expect(() => svc.update('e1', { seconds: 25 * 3600 })).toThrow('24 hours');
    expect(() => svc.update('nope', { seconds: 600 })).toThrow('no longer exists');
    expect(svc.log(DAY).items).toHaveLength(1);
  });

  it('adds an entry by hand, marked as such, on the day its start falls on', () => {
    now += 60_000;
    const e = svc.add({ task: 'Client call', project: '', startTs: T0 + 3600_000, seconds: 1500, outcome: 'Done', summary: 'Scope agreed', ref: null }, 'no laptop');
    expect(e.origin).toBe('manual');
    expect(e.day).toBe(DAY);
    expect(e.done).toBe(true);
    expect(isEdited(e)).toBe(true);
    expect(repo.entriesForDay(DAY).map((x) => x.id)).toEqual(['e1', e.id]);
    const line = svc.log(DAY).items.at(-1)!;
    expect(line).toMatchObject({ action: 'add', entryId: e.id, reason: 'no laptop' });
    expect(line.summary).toBe('Added “Client call” · 25m from 10:00');
  });

  it('splits an entry: the first part keeps its wrap-up, the second continues from where it ends', () => {
    repo.upsertEntry({ ...timerEntry('e2', 'Big task', T0 + 5 * 3600_000, 5400, 'DB-1'), summary: 'half done', outcome: 'Partly done' });
    const loggedBefore = repo.tasks().find((t) => t.id === 'DB-1')!.logged;
    const { first, second } = svc.split('e2', 3600, { task: 'Other task', reason: 'switched without restarting' });
    expect(first).toMatchObject({ id: 'e2', seconds: 3600, summary: 'half done', edits: 1, ref: 'DB-1' });
    expect(second).toMatchObject({ task: 'Other task', seconds: 1800, startTs: T0 + 5 * 3600_000 + 3600_000, origin: 'split', outcome: 'Partly done', done: false, ref: null, project: 'api' });
    expect(isEdited(second)).toBe(true);
    // The linked task loses the tail that now belongs to an unlinked entry.
    expect(repo.tasks().find((t) => t.id === 'DB-1')!.logged).toBe(loggedBefore - 0.5);
    const lines = svc.log(DAY).items.slice(-2);
    expect(lines.map((l) => l.action)).toEqual(['split', 'add']);
    expect(lines[0]!.summary).toContain('Split “Big task” after 1h 00m');
    expect(() => svc.split('e2', 3570)).toThrow('at least a minute');
  });

  it('deletes an entry and keeps what it was in the log', () => {
    const loggedBefore = repo.tasks().find((t) => t.id === 'DB-1')!.logged;
    const gone = svc.remove('e2', 'started by mistake');
    expect(repo.entry('e2')).toBeUndefined();
    expect(gone.task).toBe('Big task');
    expect(repo.tasks().find((t) => t.id === 'DB-1')!.logged).toBe(loggedBefore - 1);
    const line = svc.log(DAY).items.at(-1)!;
    expect(line).toMatchObject({ action: 'delete', entryId: 'e2', reason: 'started by mistake', after: null });
    expect(line.before).toMatchObject({ task: 'Big task', seconds: 3600 });
  });

  it('the done checkbox is a correction like any other', () => {
    const e = svc.toggleDone('e1');
    expect(e).toMatchObject({ done: true, outcome: 'Done', edits: 2 });
    expect(svc.log(DAY).items.at(-1)!.summary).toBe('Outcome Partly done → Done');
    expect(svc.toggleDone('e1')).toMatchObject({ done: false, outcome: 'Partly done', edits: 3 });
  });

  it('records what was decided about time away', () => {
    const line = svc.recordAway({ id: 'a1', task: 'Timer sync', startedAt: T0, reason: 'idle', since: T0 + 7200_000, until: T0 + 7200_000 + 25 * 60_000, seconds: 1500, activeSeconds: 7000 }, 'keep');
    expect(line).toMatchObject({ action: 'away', entryId: null, day: DAY });
    expect(line.summary).toBe('Counted 25m idle (11:00–11:25) as work on “Timer sync”');
    expect(repo.editedCountForDay(DAY)).toBe(3); // e1 edited, the manual one, the split-off one
  });

  it('chains every line to the one before and notices alteration', () => {
    const all = svc.log();
    expect(all.intact).toBe(true);
    expect(all.total).toBe(all.items.length);
    expect(all.items.map((l) => l.seq)).toEqual(all.items.map((_, i) => i + 1));
    // The table refuses changes outright.
    expect(() => db.run("UPDATE entry_log SET summary = 'nothing happened' WHERE seq = 1")).toThrow(/append-only/);
    expect(() => db.run('DELETE FROM entry_log WHERE seq = 1')).toThrow(/append-only/);
    expect(svc.log().intact).toBe(true);
    // Even with the guard removed (editing the file with another tool), the hashes give it away.
    db.run('DROP TRIGGER entry_log_no_update');
    db.run("UPDATE entry_log SET summary = 'nothing happened' WHERE seq = 1");
    expect(svc.log().intact).toBe(false);
  });

  it('a moved start changes the day and both days are reported', () => {
    const next = T0 + 24 * 3600_000;
    const e = svc.update('e1', { startTs: next });
    expect(e.day).toBe(dayKey(next));
    expect(changed.at(-1)).toEqual([DAY, dayKey(next)]);
    expect(repo.entriesForDay(DAY).map((x) => x.task)).toEqual(['Client call', 'Other task']);
  });
});
