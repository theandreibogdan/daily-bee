import { EventEmitter } from 'node:events';
import type { DeepPartial, Settings } from '../../shared/types';
import type { Repo } from '../repo';

export const DEFAULT_SETTINGS: Settings = {
  // The wizard fills the profile; until then the kit's sample person stands in (demo mode).
  profile: { name: 'Mara Lindqvist', email: 'mara@dailybee.dev', initials: 'ML', role: 'Lead engineer', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' },
  tracking: { enabled: true, idleDetection: true, idleMinutes: 10, roundTo5: true, captureBrowser: true, startOnCommit: false, intervalSec: 3, awayPrompt: true, excludedApps: [] },
  policy: { driftMinutes: 8, halfwayCheckin: true, fullscreenWarning: true, warningSeconds: 20, snoozeMinutes: 15, reportTime: '18:00', autoSend: true, includeBlockers: true, attachCsv: false, managersSeeUrls: false, shareFocusWithTeam: false },
  delivery: { slackWebhookUrl: '', slackChannel: '', emailTo: '', smtpUrl: '', emailFrom: '', llmPolish: false, anthropicApiKey: '' },
  workspace: { apiUrl: '', token: '', teamName: '' },
  widget: { enabled: false },
  notifications: { desktop: true },
  startup: { launchAtLogin: false, startInTray: true },
  appearance: { reduceMotion: null },
  dailyGoalHours: 8,
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function deepMerge<T>(base: T, patch: DeepPartial<T> | undefined): T {
  if (!patch) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (v === undefined) continue;
    const cur = out[k];
    out[k] = isObj(v) && isObj(cur) ? deepMerge(cur, v as DeepPartial<typeof cur>) : v;
  }
  return out as T;
}

export class SettingsService extends EventEmitter {
  private state: Settings;
  constructor(private readonly repo: Repo) {
    super();
    this.state = deepMerge(DEFAULT_SETTINGS, repo.getKv<DeepPartial<Settings>>('settings', {}));
    // Privacy rule is not a preference.
    this.state.policy.managersSeeUrls = false;
    // Dev/test overrides (never persisted): point at a workspace API, shorten the drift threshold,
    // move the report time — see DEVELOPMENT.md.
    if (process.env.DAILYBEE_API_URL) this.state.workspace = { ...this.state.workspace, apiUrl: process.env.DAILYBEE_API_URL, token: process.env.DAILYBEE_API_TOKEN ?? this.state.workspace.token };
    if (process.env.DAILYBEE_DRIFT_MINUTES) this.state.policy.driftMinutes = Math.max(0.05, Number(process.env.DAILYBEE_DRIFT_MINUTES) || 8);
    if (process.env.DAILYBEE_WARNING_SECONDS) this.state.policy.warningSeconds = Math.max(3, Number(process.env.DAILYBEE_WARNING_SECONDS) || 20);
    if (process.env.DAILYBEE_REPORT_TIME) this.state.policy.reportTime = process.env.DAILYBEE_REPORT_TIME;
    if (process.env.DAILYBEE_WIDGET) this.state.widget = { enabled: process.env.DAILYBEE_WIDGET === '1' };
  }
  get(): Settings { return this.state; }
  update(patch: DeepPartial<Settings>): Settings {
    this.state = deepMerge(this.state, patch);
    this.state.policy.managersSeeUrls = false;
    this.repo.setKv('settings', this.state);
    this.emit('change', this.state);
    return this.state;
  }
}
