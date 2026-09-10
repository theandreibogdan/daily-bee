import { EventEmitter } from 'node:events';
import type { AppNotification, NotificationKind, NotificationTone, ScreenId } from '../../shared/types';
import type { Repo } from '../repo';

export interface NotificationHost {
  /** System notification (Windows action centre, macOS banner); the host decides whether it is wanted right now */
  desktop(title: string, body?: string): void;
  log(m: string): void;
}

export interface NotifyInput {
  kind: NotificationKind;
  tone?: NotificationTone;
  title: string;
  text?: string;
  /** Screen to open when the notification is clicked */
  screen?: ScreenId;
  /** Also raise a desktop notification */
  desktop?: boolean;
  /** Replaces an earlier notification with the same key (one "sync failed" at a time) */
  key?: string;
}

const KEY = 'notifications';
const CAP = 200;
const KEEP_MS = 30 * 86_400_000;

/**
 * What the bell shows: a per-profile log of what happened (task starts and stops, pauses,
 * check-ins, reports, sync trouble) with unread state, kept in the profile's database for 30 days.
 */
export class NotificationService extends EventEmitter {
  private items: AppNotification[];

  constructor(private readonly repo: Repo, private readonly host: NotificationHost, private readonly now: () => number = Date.now) {
    super();
    const cutoff = this.now() - KEEP_MS;
    this.items = repo.getKv<AppNotification[]>(KEY, []).filter((n) => n && typeof n.ts === 'number' && n.ts >= cutoff).slice(0, CAP);
  }

  /** Newest first. */
  list(): AppNotification[] { return [...this.items].sort((a, b) => b.ts - a.ts); }
  unread(): number { return this.items.filter((n) => !n.read).length; }

  push(input: NotifyInput): AppNotification {
    const ts = this.now();
    const n: AppNotification = { id: 'n_' + ts.toString(36) + Math.random().toString(36).slice(2, 6), ts, kind: input.kind, tone: input.tone ?? 'neutral', title: input.title, read: false };
    if (input.text) n.text = input.text;
    if (input.screen) n.screen = input.screen;
    if (input.key) n.key = input.key;
    if (input.key) this.items = this.items.filter((x) => x.key !== input.key);
    this.items = [n, ...this.items].slice(0, CAP);
    this.save();
    if (input.desktop) this.host.desktop(input.title, input.text);
    return n;
  }

  /** Mark the given notifications read, or all of them. */
  markRead(ids?: string[]): AppNotification[] {
    const only = ids ? new Set(ids) : null;
    let changed = false;
    for (const n of this.items) if (!n.read && (!only || only.has(n.id))) { n.read = true; changed = true; }
    if (changed) this.save();
    return this.list();
  }

  clear(): AppNotification[] {
    this.items = [];
    this.save();
    return [];
  }

  private save(): void {
    this.repo.setKv(KEY, this.items);
    this.emit('change', this.list());
  }
}
