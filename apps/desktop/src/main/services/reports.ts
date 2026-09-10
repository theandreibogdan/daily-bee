import { EventEmitter } from 'node:events';
import { CATEGORIES, type Category } from '@dailybee/tracker';
import type { Checkin, DaySummary, Entry, ReportDraft, ReportHistoryItem, Settings } from '../../shared/types';
import { atTime, dayKey, dayLabel, formatDurationShort, roundEntrySeconds } from '../../shared/time';
import type { Repo } from '../repo';
import type { CheckinService } from './checkins';
import type { SessionService } from './session';
import type { SettingsService } from './settings';
import type { TrackerService } from './tracker';

export interface ReportHost {
  demo: boolean;
  log: (m: string) => void;
  toast: (text: string, tone?: 'neutral' | 'success' | 'warning' | 'danger') => void;
}

const CAT_LABEL: Record<Category, string> = { work: 'Work', research: 'Research', learning: 'Learning', communication: 'Communication', distraction: 'Distraction' };
const ANSWER_LABEL: Record<string, string> = { back: 'back to it', break: 'taking a break', relevant: 'this is work' };

/**
 * Daily report: template first (entries, outcomes, mix, blockers, check-in answers), optional LLM
 * polish, delivery through a Slack incoming webhook and/or SMTP at policy time (18:00 default).
 */
export class ReportService extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private autoAttempted = '';

  constructor(private readonly repo: Repo, private readonly settings: SettingsService, private readonly session: SessionService, private readonly tracker: TrackerService, private readonly checkins: CheckinService, private readonly host: ReportHost) {
    super();
  }

  current(day = dayKey()): ReportDraft | null { return this.repo.report(day); }
  get(day: string): ReportDraft | null { return this.repo.report(day); }

  /** Everything Today shows, for any saved day. */
  day(day = dayKey()): DaySummary {
    const today = day === dayKey();
    const s = this.tracker.summaryForDay(day);
    const entries = this.repo.entriesForDay(day);
    const tracked = entries.reduce((a, e) => a + e.seconds, 0) + (today ? this.session.elapsedSeconds() : 0);
    return { ...s, day, label: dayLabel(day), tracked, entries, checkins: this.repo.checkinsForDay(day), report: this.repo.report(day) };
  }

  async generate(day = dayKey()): Promise<ReportDraft> {
    const prev = this.repo.report(day);
    const entries = this.repo.entriesForDay(day);
    const checkins = this.repo.checkinsForDay(day);
    const sum = this.tracker.summaryForDay(day);
    const s = this.settings.get();
    // "Round entries to 5 min" applies here, to the report; the live view keeps exact seconds.
    const rounded = entries.map((e) => ({ ...e, seconds: roundEntrySeconds(e.seconds, s.tracking.roundTo5) }));
    const tracked = rounded.reduce((a, e) => a + e.seconds, 0) + (day === dayKey() ? this.session.elapsedSeconds() : 0);
    const shipped = rounded.filter((e) => e.done);
    const inProgress = rounded.filter((e) => !e.done);
    const answered = checkins.filter((c) => c.answer && c.answer !== 'dismiss');
    const mix = CATEGORIES.map((c) => sum.mix.percent[c]);
    const topApps = this.tracker.topAppsForDay(day, 3);
    const narrative = buildNarrative(topApps, checkins);
    const notes = prev?.notes ?? (this.host.demo ? 'Blocked on staging DB credentials until Rui is back tomorrow.' : '');
    const blockers = buildBlockers(entries, checkins, notes, s);
    const draft: ReportDraft = {
      day, label: dayLabel(day),
      summary: { tracked, focus: sum.mix.focus, done: shipped.length, total: entries.length, checkins: answered.length, distraction: sum.mix.percent.distraction },
      shipped, inProgress, mix, narrative, blockers, notes, markdown: '',
      status: prev?.status ?? 'draft', sentAt: prev?.sentAt ?? null, recipients: recipientsLabel(s, this.host.demo), topApps,
    };
    draft.markdown = renderMarkdown(draft, s);
    if (s.delivery.llmPolish && s.delivery.anthropicApiKey) {
      try { draft.markdown = await polishWithClaude(draft.markdown, s.delivery.anthropicApiKey); } catch (e) { this.host.log('[reports] polish skipped: ' + String(e)); }
    }
    this.repo.saveReport(draft);
    this.emit('change', draft);
    return draft;
  }

  save(patch: { notes?: string }, day = dayKey()): ReportDraft {
    const d = this.repo.report(day);
    const base: ReportDraft = d ?? { day, label: dayLabel(day), summary: { tracked: 0, focus: 0, done: 0, total: 0, checkins: 0, distraction: 0 }, shipped: [], inProgress: [], mix: [0, 0, 0, 0, 0], narrative: '', blockers: '', notes: '', markdown: '', status: 'draft', sentAt: null, recipients: '', topApps: [] };
    const next: ReportDraft = { ...base, notes: patch.notes ?? base.notes };
    next.blockers = buildBlockers(this.repo.entriesForDay(day), this.repo.checkinsForDay(day), next.notes, this.settings.get());
    next.markdown = renderMarkdown(next, this.settings.get());
    this.repo.saveReport(next);
    this.emit('change', next);
    return next;
  }

  async send(day = dayKey()): Promise<{ ok: boolean; message: string; draft: ReportDraft }> {
    const draft = this.repo.report(day) ?? (await this.generate(day));
    const s = this.settings.get();
    const targets: string[] = [];
    try {
      if (s.delivery.slackWebhookUrl) { await sendSlack(s.delivery.slackWebhookUrl, draft.markdown); targets.push(s.delivery.slackChannel || 'Slack'); }
      if (s.delivery.emailTo && s.delivery.smtpUrl) { await sendEmail(s, draft); targets.push(s.delivery.emailTo); }
    } catch (e) {
      const message = "Report didn't send — " + (e instanceof Error ? e.message : String(e)) + '. Check your connection and try again.';
      this.host.toast(message, 'danger');
      this.emit('failed', message);
      return { ok: false, message, draft };
    }
    if (!targets.length && !this.host.demo) {
      const message = 'Add a Slack webhook or email address in Settings › Delivery to send reports';
      this.host.toast(message, 'warning');
      return { ok: false, message, draft };
    }
    const sent: ReportDraft = { ...draft, status: 'sent', sentAt: Date.now(), recipients: targets.length ? targets.join(', ') : draft.recipients };
    this.repo.saveReport(sent);
    this.emit('change', sent);
    const message = targets.length ? `Report sent to ${targets.join(', ')}` : 'Report sent to 4 teammates';
    this.host.toast(message, 'success');
    this.emit('sent', sent);
    return { ok: true, message, draft: sent };
  }

  /** Every day with entries, captured activity or a report — not only days a report was generated for. */
  history(): ReportHistoryItem[] {
    const today = dayKey();
    return this.repo.daysWithData(60).map((day) => {
      const entries = this.repo.entriesForDay(day);
      const r = this.repo.report(day);
      const tracked = entries.reduce((a, e) => a + e.seconds, 0) + (day === today ? this.session.elapsedSeconds() : 0);
      return { day, label: dayLabel(day), tracked, entries: entries.length, status: r ? (r.status === 'sent' ? 'Sent' : 'Draft') : 'None' };
    });
  }

  /** Auto-generate (and auto-send when configured) at the policy time on weekdays. */
  startScheduler(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), 60_000);
  }
  stopScheduler(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  private async tick(now = Date.now()): Promise<void> {
    const day = dayKey(now);
    if (this.autoAttempted === day) return;
    const p = this.settings.get().policy;
    const dow = new Date(now).getDay();
    if (dow === 0 || dow === 6) return;
    if (now < atTime(p.reportTime, day)) return;
    this.autoAttempted = day;
    const existing = this.repo.report(day);
    if (existing?.status === 'sent') return;
    try {
      await this.generate(day);
      const s = this.settings.get();
      if (p.autoSend && (s.delivery.slackWebhookUrl || (s.delivery.emailTo && s.delivery.smtpUrl))) await this.send(day);
      else { this.host.toast('Daily report drafted — review it in Reports', 'neutral'); this.emit('drafted', day); }
    } catch (e) {
      this.host.log('[reports] auto: ' + String(e));
    }
  }
}

function recipientsLabel(s: Settings, demo: boolean): string {
  const t: string[] = [];
  if (s.delivery.slackWebhookUrl) t.push(s.delivery.slackChannel || 'Slack');
  if (s.delivery.emailTo) t.push(s.delivery.emailTo);
  return t.length ? t.join(' · ') : demo ? '#eng-daily · 4 teammates' : 'Not configured';
}

function buildNarrative(topApps: string[], checkins: Checkin[]): string {
  const parts: string[] = [];
  if (topApps.length >= 2) parts.push(`Mostly ${topApps[0]} and ${topApps[1]}.`);
  else if (topApps.length === 1) parts.push(`Mostly ${topApps[0]}.`);
  const drift = checkins.find((c) => (c.kind === 'drift' || c.kind === 'warning') && c.answer && c.answer !== 'dismiss');
  if (drift) {
    const m = /for (\d+) (minute|second)/.exec(drift.text);
    const span = m ? `${m[1]} ${m[2] === 'second' ? 's' : 'min'}` : 'Time';
    parts.push(`${span} on ${drift.domain ?? 'a distraction site'} at ${drift.at} — you said “${ANSWER_LABEL[drift.answer!] ?? drift.answer}”.`);
  }
  const warnings = checkins.filter((c) => c.kind === 'warning').length;
  if (warnings > 1) parts.push(`${warnings} distraction warnings today.`);
  const pulse = checkins.find((c) => c.kind === 'pulse' && c.answer && c.answer !== 'dismiss');
  if (pulse && pulse.answer !== 'On track') parts.push(`Halfway check-in at ${pulse.at}: ${pulse.answer!.toLowerCase()}.`);
  return parts.join(' ');
}

function buildBlockers(entries: Entry[], checkins: Checkin[], notes: string, s: Settings): string {
  const lines: string[] = [];
  for (const e of entries) if (e.blocker) lines.push(e.summary ? `${e.task}: ${e.summary}` : `${e.task} — hit a blocker`);
  for (const c of checkins) if (c.answer === 'Blocked') lines.push(`Blocked at ${c.at}${c.task ? ` on “${c.task}”` : ''}`);
  if (!s.policy.includeBlockers) return '';
  if (lines.length) return lines.join('\n');
  return notes.trim() || 'No blockers.';
}

export function renderMarkdown(d: ReportDraft, s: Settings): string {
  const line = (e: Entry) => `- ${e.task}${e.ref ? ` (${e.ref})` : ''} — ${formatDurationShort(e.seconds)}${e.summary ? `\n  ${e.summary}` : ''}`;
  const mix = CATEGORIES.map((c, i) => `${CAT_LABEL[c]} ${d.mix[i] ?? 0}%`).join(' · ');
  const out: string[] = [
    `# Daily report — ${d.label}`,
    `**Tracked** ${formatDurationShort(d.summary.tracked)} · **Focus** ${d.summary.focus}% · **Tasks** ${d.summary.done} of ${d.summary.total} done · **Check-ins** ${d.summary.checkins} answered`,
    '',
    '## Shipped',
    d.shipped.length ? d.shipped.map(line).join('\n') : '- Nothing closed today',
    '',
    '## In progress',
    d.inProgress.length ? d.inProgress.map(line).join('\n') : '- Nothing in progress',
    '',
    '## Where the time went',
    mix,
  ];
  if (d.narrative) out.push(d.narrative);
  if (s.policy.includeBlockers && d.blockers) out.push('', '## Blockers', d.blockers);
  if (d.notes && d.notes.trim() && d.notes.trim() !== d.blockers.trim()) out.push('', '## Notes', d.notes.trim());
  return out.join('\n');
}

/** Optional LLM polish: keeps every fact, tightens the prose. Template output is the fallback. */
async function polishWithClaude(markdown: string, apiKey: string): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey, timeout: 60_000 });
  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: [
      'You polish a software developer\'s end-of-day report for their team. Keep every fact, number, task name and duration exactly as given.',
      'Rewrite only the prose: make it read like a calm, dry, competent colleague. Sentence case. No emoji, no exclamation marks, no hype.',
      'Keep the markdown structure and headings. Return only the markdown document, nothing else.',
    ].join(' '),
    messages: [{ role: 'user', content: markdown }],
  });
  if (response.stop_reason === 'refusal') return markdown;
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  return text || markdown;
}

function toSlackMrkdwn(md: string): string {
  return md
    .replace(/^# (.*)$/gm, '*$1*')
    .replace(/^## (.*)$/gm, '*$1*')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^- /gm, '• ');
}

async function sendSlack(webhookUrl: string, markdown: string): Promise<void> {
  const res = await fetch(webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: toSlackMrkdwn(markdown) }) });
  if (!res.ok) throw new Error(`Slack webhook returned ${res.status}`);
}

async function sendEmail(s: Settings, d: ReportDraft): Promise<void> {
  const { default: nodemailer } = await import('nodemailer');
  const transport = nodemailer.createTransport(s.delivery.smtpUrl);
  const attachments = s.policy.attachCsv ? [{ filename: `dailybee-${d.day}.csv`, content: entriesCsv([...d.shipped, ...d.inProgress]) }] : [];
  await transport.sendMail({ from: s.delivery.emailFrom || s.profile.email, to: s.delivery.emailTo, subject: `Daily report — ${d.label}`, text: d.markdown, attachments });
}

export function entriesCsv(entries: Entry[]): string {
  const esc = (v: string | number | boolean | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return ['task,ref,project,start,seconds,done,outcome', ...entries.map((e) => [e.task, e.ref, e.project, e.start, e.seconds, e.done, e.outcome].map(esc).join(','))].join('\n');
}
