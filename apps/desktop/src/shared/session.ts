import type { PauseReason, Session } from './types';

export const IDLE_SESSION: Session = { running: false, startedAt: null, current: null, banked: 0, activeSince: null, paused: null };

export const PAUSE_LABEL: Record<PauseReason, string> = { idle: 'idle', lock: 'screen locked', sleep: 'asleep' };

/**
 * Active seconds of the current run: banked stretches plus the live one. Time while idle, with the
 * screen locked or the machine asleep is not counted; closing the app stops the run (main/services/session.ts).
 */
export function elapsedSeconds(s: Session, now: number): number {
  if (!s.running) return 0;
  const live = s.activeSince ? Math.max(0, now - s.activeSince) / 1000 : 0;
  return Math.max(0, Math.floor((s.banked || 0) + live));
}
