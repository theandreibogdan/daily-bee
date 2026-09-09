import { EventEmitter } from 'node:events';
import type { PauseReason } from '../../shared/types';
import type { SettingsService } from './settings';

export interface PresenceHost {
  /** Seconds since the last keyboard or mouse input (Electron: powerMonitor.getSystemIdleTime) */
  getIdleSeconds(): number;
  /** Electron powerMonitor events */
  on(event: 'suspend' | 'resume' | 'lock-screen' | 'unlock-screen', listener: () => void): unknown;
}

export interface Away { reason: PauseReason; since: number }

/**
 * Is the user here? Polls the system idle time against the idle-detection setting and listens
 * for screen lock and sleep. Emits 'away' ({ reason, since }) and 'back' (epoch ms). Idle is only
 * known once the threshold has passed, so `since` is backdated to the last input.
 */
export class PresenceService extends EventEmitter {
  away: Away | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly settings: SettingsService, private readonly host: PresenceHost, private readonly pollMs = 5000) {
    super();
  }

  start(): void {
    if (this.timer) return;
    this.host.on('suspend', () => this.leave('sleep', Date.now()));
    this.host.on('lock-screen', () => this.leave('lock', Date.now()));
    this.host.on('resume', () => this.back(Date.now()));
    this.host.on('unlock-screen', () => this.back(Date.now()));
    this.timer = setInterval(() => this.poll(), this.pollMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  poll(now = Date.now()): void {
    const t = this.settings.get().tracking;
    if (!t.idleDetection) { if (this.away?.reason === 'idle') this.back(now); return; }
    const threshold = Math.max(60, t.idleMinutes * 60);
    const idle = this.host.getIdleSeconds();
    if (!this.away && idle >= threshold) this.leave('idle', now - idle * 1000);
    else if (this.away?.reason === 'idle' && idle < threshold) this.back(now - idle * 1000);
  }

  private leave(reason: PauseReason, since: number): void {
    if (this.away) return;
    this.away = { reason, since };
    this.emit('away', this.away);
  }

  private back(at: number): void {
    if (!this.away) return;
    this.away = null;
    this.emit('back', at);
  }
}
