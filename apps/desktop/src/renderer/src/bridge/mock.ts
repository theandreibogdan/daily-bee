import type { ActivityRow, Category, CategoryMix, PermissionStatus, Rule, TimelineSegment } from '@dailybee/tracker/types';
import type { DailyBeeApi, WindowState } from '@shared/api';
import { KIT_CURRENT_TASK, KIT_ENTRIES, KIT_TIMELINE, PROJECTS, TASKS } from '@shared/fake';
import type { AdminData, TeamData } from '@shared/team';
import { atTime, clock, dayKey, dayLabel, uid } from '@shared/time';
import type { ActivitySummary, Checkin, Entry, ReportDraft, ReportHistoryItem, Session, Settings, SyncStatus, TaskRef, ToastMessage } from '@shared/types';

/** Browser-only stand-in for the main process. Fake data mirrors design_system/ui_kits/app/data.js. */
export function createMockApi(): DailyBeeApi {
  type Listener<T> = (v: T) => void;
  const listeners = new Map<string, Set<Listener<unknown>>>();
  const on = <T,>(ev: string) => (cb: Listener<T>) => {
    const set = listeners.get(ev) ?? new Set();
    set.add(cb as Listener<unknown>);
    listeners.set(ev, set);
    return () => { set.delete(cb as Listener<unknown>); };
  };
  const emit = (ev: string, v: unknown) => listeners.get(ev)?.forEach((cb) => cb(v));

  const day = dayKey();
  let session: Session = { running: true, startedAt: Date.now() - 4863 * 1000, current: KIT_CURRENT_TASK };
  let entries: Entry[] = KIT_ENTRIES.map(([task, ref, project, start, seconds, done]) => ({ id: 'mock-' + ref, day, task, ref, project, startTs: atTime(start, day), start, seconds, done, size: TASKS.find((t) => t.id === ref)?.size }));
  let checkins: Checkin[] = [
    { id: 'c1', day, ts: atTime('10:33', day), at: '10:33', kind: 'drift', text: 'You have been on youtube.com for 9 minutes. Still on “Timer sync across devices”?', answer: 'break', task: KIT_CURRENT_TASK.task, domain: 'youtube.com' },
    { id: 'c2', day, ts: atTime('11:00', day), at: '11:00', kind: 'pulse', text: 'Halfway through your estimate. How is it going?', answer: 'On track', task: KIT_CURRENT_TASK.task, domain: null },
  ];
  let active: Checkin | null = null;
  const rules: Rule[] = [];

  const activityRows: ActivityRow[] = [
    { key: 'code', app: 'VS Code', icon: 'code-2', detail: 'timer-sync.ts — api-gateway', cat: 'work', seconds: 2580, tabs: null, tracked: true },
    { key: 'chrome-work', app: 'Google Chrome', icon: 'globe', detail: 'github.com · PR #412 rate limiter', cat: 'work', seconds: 840, tabs: [{ url: 'github.com/dailybee/api/pull/412', label: 'github.com/dailybee/api/pull/412', fullUrl: 'https://github.com/dailybee/api/pull/412', title: 'PR #412 rate limiter · dailybee/api', seconds: 720, cat: 'work' }, { url: 'github.com/dailybee/api/actions', label: 'github.com/dailybee/api/actions', fullUrl: 'https://github.com/dailybee/api/actions', title: 'Actions · dailybee/api', seconds: 120, cat: 'work' }], tracked: true },
    { key: 'chrome-research', app: 'Google Chrome', icon: 'globe', detail: 'developer.mozilla.org · Web Locks API', cat: 'research', seconds: 660, tabs: [{ url: 'developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API', label: 'developer.mozilla.org/en-US/docs/Web/AP…', fullUrl: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API', title: 'Web Locks API - Web APIs | MDN', seconds: 420, cat: 'research' }, { url: 'stackoverflow.com/q/71882', label: 'stackoverflow.com/q/71882', fullUrl: 'https://stackoverflow.com/q/71882', title: 'Coordinating tabs with Web Locks - Stack Overflow', seconds: 240, cat: 'research' }], tracked: true },
    { key: 'slack', app: 'Slack', icon: 'message-square', detail: '#eng-daily, DM Jonas', cat: 'communication', seconds: 420, tabs: null, tracked: true },
    { key: 'chrome-distraction', app: 'Google Chrome', icon: 'globe', detail: 'youtube.com · 2 videos', cat: 'distraction', seconds: 540, tabs: [{ url: 'youtube.com/watch?v=wvaY5bG5p7A', label: 'youtube.com/watch?v=wvaY5bG5p7A', fullUrl: 'https://www.youtube.com/watch?v=wvaY5bG5p7A', title: 'Rust for TS devs — talk - YouTube', seconds: 540, cat: 'distraction' }], tracked: true },
    { key: 'terminal', app: 'Terminal', icon: 'terminal', detail: 'pnpm test --watch', cat: 'work', seconds: 780, tabs: null, tracked: true },
    { key: 'chrome-learning', app: 'Google Chrome', icon: 'globe', detail: 'frontendmasters.com · Rust for TS devs', cat: 'learning', seconds: 300, tabs: [{ url: 'frontendmasters.com/courses/rust-ts', label: 'frontendmasters.com/courses/rust-ts', fullUrl: 'https://frontendmasters.com/courses/rust-ts', title: 'Rust for TypeScript Developers - Frontend Masters', seconds: 300, cat: 'learning' }], tracked: true },
    // Captured while no task was running (shown gray, not part of the focus mix)
    { key: 'u|chrome-research', app: 'Google Chrome', icon: 'globe', detail: 'news.ycombinator.com · 3 pages', cat: 'research', seconds: 780, tabs: [{ url: 'news.ycombinator.com', label: 'news.ycombinator.com', fullUrl: 'https://news.ycombinator.com/', title: 'Hacker News', seconds: 780, cat: 'research' }], tracked: false },
    { key: 'u|spotify', app: 'Spotify', icon: 'music', detail: 'Lunch playlist', cat: 'distraction', seconds: 1500, tabs: null, tracked: false },
  ];
  const mix = (): CategoryMix => {
    const seconds = { work: 0, research: 0, learning: 0, communication: 0, distraction: 0 } as Record<Category, number>;
    for (const r of activityRows) if (r.tracked) seconds[r.cat] += r.seconds;
    const total = Object.values(seconds).reduce((a, b) => a + b, 0);
    const cats: Category[] = ['work', 'research', 'learning', 'communication', 'distraction'];
    const raw = cats.map((c) => (seconds[c] / total) * 100);
    const floors = raw.map(Math.floor);
    let rem = 100 - floors.reduce((a, b) => a + b, 0);
    raw.map((v, i) => ({ i, f: v - floors[i]! })).sort((a, b) => b.f - a.f).forEach(({ i }) => { if (rem > 0) { floors[i]!++; rem--; } });
    const percent = Object.fromEntries(cats.map((c, i) => [c, floors[i]])) as Record<Category, number>;
    return { seconds, percent, focus: percent.work + percent.research + percent.learning, total };
  };
  const timeline = (): TimelineSegment[] => [
    // 08:20–08:58: at the computer before starting a task → gray "no task" segments
    { start: atTime('08:20', day), end: atTime('08:45', day), cat: 'distraction', tracked: false },
    { start: atTime('08:45', day), end: atTime('08:58', day), cat: 'research', tracked: false },
    ...KIT_TIMELINE.map(([t, c, m]) => ({ start: atTime(t, day), end: atTime(t, day) + m * 60000, cat: c as TimelineSegment['cat'], tracked: true })),
  ];
  const summary = (): ActivitySummary => ({ rows: activityRows, mix: mix(), timeline: timeline(), current: { app: 'VS Code', detail: 'timer-sync.ts', icon: 'code-2', cat: 'work', tracked: true }, sampleCount: 2040, intervalSec: 3, firstTs: atTime('08:20', day), live: false });

  let settings: Settings = {
    profile: { name: 'Mara Lindqvist', email: 'mara@dailybee.dev', initials: 'ML', role: 'Lead engineer', timezone: 'Europe/Stockholm' },
    tracking: { enabled: true, idleDetection: true, idleMinutes: 10, roundTo5: true, captureBrowser: true, startOnCommit: false, intervalSec: 3 },
    policy: { driftMinutes: 8, halfwayCheckin: true, reportTime: '18:00', autoSend: true, includeBlockers: true, attachCsv: false, managersSeeUrls: false, shareFocusWithTeam: false },
    delivery: { slackWebhookUrl: '', slackChannel: '#eng-daily', emailTo: '', smtpUrl: '', emailFrom: '', llmPolish: false, anthropicApiKey: '' },
    workspace: { apiUrl: '', token: '', teamName: 'Platform' },
    widget: { enabled: false },
    dailyGoalHours: 8,
  };
  const permissions: PermissionStatus[] = [
    { id: 'accessibility', name: 'Accessibility', description: 'Active window and address bar', state: 'granted', requestable: true },
    { id: 'automation:chrome', name: 'Automation · Google Chrome', description: 'Active tab URL and title', state: 'granted', requestable: true },
    { id: 'automation:safari', name: 'Automation · Safari', description: 'Active tab URL and title', state: 'denied', requestable: true },
    { id: 'screen', name: 'Screen Recording', description: 'Window titles for non-browser apps', state: 'granted', requestable: true },
  ];
  let report: ReportDraft | null = null;
  const history: ReportHistoryItem[] = [3, 4, 5, 6].map((d, i) => ({ day: dayKey(Date.now() - d * 86400000), label: dayLabel(Date.now() - d * 86400000), tracked: [28500, 29400, 23100, 28200][i]!, entries: [5, 6, 4, 5][i]!, status: 'Sent' as const }));
  const syncStatus: SyncStatus = { configured: false, connected: false, lastPushAt: null, lastError: null, shares: 'Entries, outcomes, check-in answers, app names and category mix. Never URLs or window titles.' };
  const tasks: TaskRef[] = [...TASKS];
  let toastSeq = 0;
  const toast = (text: string, tone: ToastMessage['tone'] = 'success') => emit('toast', { id: ++toastSeq, text, tone } satisfies ToastMessage);
  let winState: WindowState = { maximized: false, focused: true };

  const makeReport = (): ReportDraft => {
    const total = entries.reduce((a, e) => a + e.seconds, 0) + (session.running && session.startedAt ? Math.floor((Date.now() - session.startedAt) / 1000) : 0);
    const shipped = entries.filter((e) => e.done), inProgress = entries.filter((e) => !e.done);
    const r: ReportDraft = { day, label: dayLabel(day), summary: { tracked: total, focus: 71, done: shipped.length, total: entries.length, checkins: 2, distraction: 6 }, shipped, inProgress, mix: [62, 12, 7, 13, 6], narrative: 'Mostly VS Code and GitHub. 9 min on youtube.com at 10:33 — you said “taking a break”.', blockers: 'Staging DB credentials — waiting on Rui, expected tomorrow.', notes: report?.notes ?? 'Blocked on staging DB credentials until Rui is back tomorrow.', markdown: '', status: report?.status ?? 'draft', sentAt: report?.sentAt ?? null, recipients: '#eng-daily · 4 teammates', topApps: ['VS Code', 'GitHub'] };
    r.markdown = `# Daily report — ${r.label}\n\n## Shipped\n${shipped.map((e) => '- ' + e.task).join('\n')}\n\n## In progress\n${inProgress.map((e) => '- ' + e.task).join('\n')}\n\n## Blockers\n${r.blockers}`;
    return r;
  };

  const FAKE_TEAM: TeamData = { members: [
    { initials: 'ML', name: 'Mara Lindqvist', today: 19860, week: 121500, report: 'Draft', tracking: true }, { initials: 'JK', name: 'Jonas Kaur', today: 25200, week: 134400, report: 'Sent', tracking: true }, { initials: 'SO', name: 'Sena Okafor', today: 14400, week: 108000, report: 'Sent', tracking: false }, { initials: 'RA', name: 'Rui Almeida', today: 0, week: 96300, report: 'Missing', tracking: false }, { initials: 'TN', name: 'Tomas Novak', today: 21600, week: 127800, report: 'Sent', tracking: true }, { initials: 'PB', name: 'Priya Bhatt', today: 9000, week: 88200, report: 'Draft', tracking: false },
  ], hoursByDay: [38, 41, 36, 44, 31, 4, 0], weekDeltaPct: 6, goalHours: 40, fetchedAt: null };
  const FAKE_ADMIN: AdminData = { orgs: ['Engineering', 'Platform', 'Product'], kpis: { focus: 71, tracked: 178.5, reports: 92, distraction: 6 }, deltas: { focus: '+3 pts', tracked: '+6%', reports: '−4 pts', distraction: '−1 pt' }, categoryMix: { work: 62, research: 12, learning: 7, communication: 13, distraction: 6 },
    people: [
      { initials: 'ML', name: 'Mara Lindqvist', team: 'Platform', week: 33.75, focus: 78, distraction: 4, reports: 5, mix: [68, 12, 5, 11, 4], top: 'VS Code · GitHub' }, { initials: 'JK', name: 'Jonas Kaur', team: 'Engineering', week: 37.3, focus: 74, distraction: 5, reports: 5, mix: [61, 14, 8, 12, 5], top: 'VS Code · Linear' }, { initials: 'SO', name: 'Sena Okafor', team: 'Product', week: 30.0, focus: 58, distraction: 9, reports: 4, mix: [45, 18, 6, 22, 9], top: 'Figma · Slack' }, { initials: 'RA', name: 'Rui Almeida', team: 'Platform', week: 26.75, focus: 66, distraction: 3, reports: 2, mix: [70, 10, 4, 13, 3], top: 'Terminal · Grafana' }, { initials: 'TN', name: 'Tomas Novak', team: 'Engineering', week: 35.5, focus: 80, distraction: 7, reports: 5, mix: [66, 9, 9, 9, 7], top: 'IntelliJ · GitHub' }, { initials: 'PB', name: 'Priya Bhatt', team: 'Product', week: 24.5, focus: 52, distraction: 12, reports: 3, mix: [40, 20, 10, 18, 12], top: 'Notion · Zoom' },
    ],
    projects: [{ name: 'api-gateway', color: 'var(--blue-500)', hours: 64.5, budget: 80, tasks: 14, overdue: 1 }, { name: 'web-app', color: 'var(--green-500)', hours: 71.0, budget: 70, tasks: 22, overdue: 3 }, { name: 'infra', color: 'var(--orange-500)', hours: 43.0, budget: 60, tasks: 9, overdue: 1 }],
    alerts: [['danger', 'Rui Almeida has not sent a report for 3 days'], ['warning', 'web-app is 1h over its weekly budget'], ['warning', 'Priya Bhatt: distraction share 12% (team avg 6%)'], ['info', '3 tasks re-assessed from Medium to Large this week']],
    policy: [['Managers see categories and app names, not URLs', true], ['Distraction check-ins after 8 min on a distraction site', true], ['Halfway check-in on every task with a size', true], ['Auto-generate daily report at 18:00', true], ['Share individual focus % with the whole team', false]],
    fetchedAt: null };

  return {
    platform: 'darwin',
    demo: true,
    session: {
      get: async () => session,
      start: async (t) => { session = { running: true, startedAt: Date.now(), current: t }; emit('session', session); return session; },
      stop: async (r) => {
        const cur = session.current!;
        const seconds = session.startedAt ? Math.floor((Date.now() - session.startedAt) / 1000) : 0;
        const i = entries.findIndex((e) => e.task === cur.task && !e.done);
        const base = i >= 0 ? entries[i]! : { id: uid(), day, task: cur.task, ref: cur.ref, project: cur.project, startTs: session.startedAt ?? Date.now(), start: clock(session.startedAt ?? Date.now()), seconds: 0, done: false };
        const entry: Entry = { ...base, seconds: base.seconds + seconds, done: r.outcome === 'Done', outcome: r.outcome, summary: r.summary, blocker: r.blocker, sizeCheck: r.sizeCheck };
        entries = i >= 0 ? entries.map((e, j) => (j === i ? entry : e)) : [entry, ...entries];
        session = { running: false, startedAt: null, current: null };
        emit('session', session); emit('entries', entries);
        return { session, entry };
      },
      onChange: on<Session>('session'),
    },
    entries: {
      list: async () => entries,
      toggleDone: async (id) => { entries = entries.map((e) => (e.id === id ? { ...e, done: !e.done } : e)); emit('entries', entries); return entries; },
      onChange: on<Entry[]>('entries'),
    },
    activity: {
      summary: async () => summary(),
      onChange: on<ActivitySummary>('activity'),
      recategorise: async (target, cat) => {
        for (const r of activityRows) for (const t of r.tabs ?? []) if (target.kind === 'domain' && t.url.startsWith(target.value)) t.cat = cat;
        rules.push({ id: rules.length + 1, match: target.kind, pattern: target.value, category: cat, source: 'user' });
        const s = summary(); emit('activity', s); return s;
      },
      rules: async () => rules,
      removeRule: async (id) => { const i = rules.findIndex((r) => r.id === id); if (i >= 0) rules.splice(i, 1); return rules; },
    },
    checkins: {
      list: async () => checkins,
      trigger: async (kind) => {
        const k = kind ?? (active ? 'pulse' : Math.random() < 0.5 ? 'drift' : 'pulse');
        const c: Checkin = { id: uid(), day, ts: Date.now(), at: clock(Date.now()), kind: k, text: k === 'drift' ? 'You have been on youtube.com for 9 minutes. Still on “Timer sync across devices”?' : 'Halfway through your estimate. How is it going?', answer: null, task: session.current?.task ?? null, domain: k === 'drift' ? 'youtube.com' : null };
        checkins = [...checkins, c]; active = c; emit('checkinPrompt', c); emit('checkins', checkins); return c;
      },
      answer: async (id, answer) => { checkins = checkins.map((c) => (c.id === id ? { ...c, answer } : c)); if (active?.id === id) { active = null; emit('checkinPrompt', null); } emit('checkins', checkins); return checkins; },
      onPrompt: on<Checkin | null>('checkinPrompt'),
      onChange: on<Checkin[]>('checkins'),
    },
    reports: {
      generate: async () => { await new Promise((r) => setTimeout(r, 200)); report = makeReport(); return report; },
      current: async () => report,
      save: async (patch) => { report = { ...(report ?? makeReport()), ...patch }; return report; },
      send: async () => { report = { ...(report ?? makeReport()), status: 'sent', sentAt: Date.now() }; toast('Report sent to 4 teammates'); return { ok: true, message: 'Report sent to 4 teammates', draft: report }; },
      history: async () => history,
      get: async (d) => (d === day ? report : null),
    },
    settings: {
      get: async () => settings,
      update: async (patch) => { settings = deepMerge(settings, patch as Partial<Settings>); emit('settings', settings); return settings; },
      onChange: on<Settings>('settings'),
      permissions: async () => permissions,
      requestPermission: async (id) => { const p = permissions.find((x) => x.id === id); if (p) p.state = 'granted'; return permissions; },
      testCapture: async () => ({ app: 'VS Code', title: 'timer-sync.ts — api-gateway', url: null, urlSource: 'none' }),
    },
    data: {
      projects: async () => PROJECTS,
      tasks: async () => tasks,
      saveTask: async (t) => { const i = tasks.findIndex((x) => x.id === t.id); if (i >= 0) tasks[i] = t; else tasks.unshift(t); return tasks; },
    },
    team: {
      data: async () => FAKE_TEAM,
      admin: async () => FAKE_ADMIN,
      nudge: async () => undefined,
    },
    sync: { status: async () => syncStatus, pushNow: async () => syncStatus, onChange: on<SyncStatus>('sync') },
    ui: {
      onToast: on<ToastMessage>('toast'),
      onNavigate: on<string>('navigate'),
      copyText: async (text) => { try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable */ } },
      openExternal: async (url) => { window.open(url, '_blank', 'noopener'); },
    },
    window: {
      minimize: async () => undefined,
      toggleMaximize: async () => { winState = { ...winState, maximized: !winState.maximized }; emit('windowState', winState); },
      close: async () => undefined,
      state: async () => winState,
      onState: on<WindowState>('windowState'),
      showMain: async () => undefined,
    },
  };
}

function deepMerge<T>(base: T, patch: Partial<T>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const cur = out[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' ? deepMerge(cur, v as Partial<typeof cur>) : v;
  }
  return out as T;
}
