import { EventEmitter } from 'node:events';
import type { Entry, RecentTask, Session, SessionTask } from '../../shared/types';
import type { Repo } from '../repo';
import type { SessionService } from './session';

/** How far back "recent" reaches. */
const RECENT_DAYS = 14;

/**
 * Start, stop and resume without the window: what the tray menu and the global shortcut do
 * (index.ts). Resuming starts a recent task again as it was (project, size, goal, linked task);
 * stopping saves the entry as partly done with no questions, since it can be corrected later.
 */
export class QuickActions extends EventEmitter {
  constructor(private readonly repo: Repo, private readonly session: SessionService, private readonly now: () => number = Date.now) {
    super();
  }

  /** Distinct tasks by newest entry, newest first. */
  recent(limit = 6): RecentTask[] {
    return this.repo.recentTasks(this.now() - RECENT_DAYS * 86_400_000, limit);
  }

  last(): RecentTask | null {
    return this.recent(1)[0] ?? null;
  }

  start(t: RecentTask): Session {
    const task: SessionTask = { task: t.task, goal: t.goal, size: t.size, project: t.project, ref: t.ref, mood: 'Focused' };
    const s = this.session.start(task, this.now());
    this.emit('started', t);
    return s;
  }

  resumeLast(): Session | null {
    const t = this.last();
    return t ? this.start(t) : null;
  }

  stopNow(): { session: Session; entry: Entry } | null {
    const s = this.session.get();
    if (!s.running || !s.current) return null;
    const seconds = this.session.elapsedSeconds(this.now());
    const r = this.session.stop({ summary: '', outcome: 'Partly done', sizeCheck: s.current.size, blocker: false }, this.now());
    this.emit('stopped', { entry: r.entry, seconds });
    return r;
  }

  /** The shortcut's one key: stop when running, resume the last task when idle, or ask for the dialog when there is nothing to resume. */
  toggle(): 'stopped' | 'started' | 'dialog' {
    if (this.session.get().running) { this.stopNow(); return 'stopped'; }
    return this.resumeLast() ? 'started' : 'dialog';
  }
}
