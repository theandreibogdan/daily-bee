import { Badge, Button, Card, Icon, IconButton, Switch, Tabs, Td, Textarea, Th, formatDuration } from '@dailybee/ui';
import { dayLabel, floorHour, startOfDay } from '@shared/time';
import type { DaySummary, Entry, ReportDraft, ReportHistoryItem } from '@shared/types';
import { useEffect, useState } from 'react';
import { api } from '../bridge';
import { ActivityCard, EntriesCard, KpiCards, TimelineCard } from '../components/DayCards';
import { ProjectRef } from '../components/ProjectRef';
import { selectTrackedToday, useStore } from '../store';
import { EmptyState } from '../components/EmptyState';
import { ScrollArea, Topbar } from './Shell';

const SOURCE_META: Record<DaySummary['source'], string> = {
  live: 'apps & tabs · read from the system, no extension',
  samples: 'apps & tabs · from the captures stored for that day',
  digest: 'apps & tabs · saved breakdown of that day',
  none: 'nothing was captured that day',
};

export function ReportsScreen() {
  const [tab, setTab] = useState<'today' | 'history'>('today');
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [history, setHistory] = useState<ReportHistoryItem[]>([]);
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  /** A saved day opened from History: the full breakdown Today shows, for that day */
  const [day, setDay] = useState<DaySummary | null>(null);
  const entries = useStore((s) => s.entries);
  const total = useStore(selectTrackedToday);
  const settings = useStore((s) => s.settings);
  const projects = useStore((s) => s.projects);
  const reportsView = useStore((s) => s.reportsView);
  const { openPrompt, updateSettings, showToast } = useStore.getState();
  const prompt = useStore((s) => s.prompt);
  const goalHours = settings?.dailyGoalHours ?? 8;

  const load = async () => {
    const [d, h] = await Promise.all([api.reports.current(), api.reports.history()]);
    setDraft(d);
    setNotes(d?.notes ?? (api.demo ? 'Blocked on staging DB credentials until Rui is back tomorrow.' : ''));
    setHistory(h);
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (prompt === null) void load(); }, [prompt]);
  // Hand-off from Admin › Open reports or the palette: pick the tab.
  useEffect(() => { if (reportsView) { setTab(reportsView); setDay(null); useStore.setState({ reportsView: null }); } }, [reportsView]);

  const sent = draft?.status === 'sent';
  const saveNotes = async () => { if (draft?.notes === notes) return; setDraft(await api.reports.save({ notes })); };
  const send = async () => {
    setSending(true);
    try { await saveNotes(); const r = await api.reports.send(); setDraft(r.draft); setHistory(await api.reports.history()); } finally { setSending(false); }
  };
  const openDay = async (d: string) => {
    setBusy(true);
    try { setDay(await api.reports.day(d)); setTab('today'); } finally { setBusy(false); }
  };
  const regenerate = async (d: string) => {
    setBusy(true);
    try { await api.reports.generate(d); setDay(await api.reports.day(d)); setHistory(await api.reports.history()); showToast('Report rebuilt for ' + dayLabel(d)); } finally { setBusy(false); }
  };
  const toggleInDay = async (id: string) => { await api.entries.toggleDone(id); if (day) setDay(await api.reports.day(day.day)); };
  const projectCount = new Set(entries.map((e) => e.project)).size;
  // Where a sent report goes: only destinations that are actually set up (demo mode pretends its channel is).
  const d = settings?.delivery;
  const configured = d ? [(d.slackWebhookUrl || api.demo) && d.slackChannel ? d.slackChannel : null, d.emailTo || null].filter(Boolean).join(' · ') : '';
  const recipients = draft?.recipients || configured || 'nowhere yet · set up Slack or email in Settings › Delivery';
  const streak = computeStreak(history);
  const line = (e: Entry) => (
    <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
      <Icon name={e.done ? 'check-circle-2' : 'circle'} size={16} style={{ color: e.done ? 'var(--success)' : 'var(--text-tertiary)' }} />
      <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.task}</span>
      <ProjectRef id={e.project} />
      <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', minWidth: 56, textAlign: 'right' }}>{formatDuration(e.seconds, 'short')}</span>
    </div>
  );

  // ---- A saved day: the Today layout for that day, plus its report -------------------------
  if (day) {
    const r = day.report;
    const dayStart = startOfDay(new Date(day.day + 'T12:00:00').getTime());
    const from = floorHour(day.firstTs ?? dayStart + 9 * 3600_000);
    const to = day.lastTs !== null ? day.lastTs + day.intervalSec * 1000 : from + 3600_000;
    const isToday = day.day === dayLabelKey(new Date());
    return (
      <>
        <Topbar title="Reports">
          <Tabs size="sm" variant="pill" tabs={[{ value: 'today', label: 'Today' }, { value: 'history', label: 'History', count: history.length }]} value="history" onChange={(v) => { setDay(null); setTab(v); }} />
          <Button size="sm" icon="sparkles" onClick={() => openPrompt('report')}>Generate report</Button>
        </Topbar>
        <ScrollArea>
        <div style={{ padding: 24, display: 'grid', gap: 24, maxWidth: 'var(--content-max)' }}>
          <Card padding={20}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <IconButton icon="arrow-left" label="Back to history" onClick={() => { setDay(null); setTab('history'); }} />
              <div style={{ display: 'grid', gap: 4, flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ font: 'var(--type-h3)', letterSpacing: 'var(--tracking-tight)' }}>{day.label}</span>
                  <Badge tone={r?.status === 'sent' ? 'success' : r ? 'neutral' : 'warning'}>{r?.status === 'sent' ? 'Sent' : r ? 'Draft' : 'No report'}</Badge>
                </div>
                <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>
                  {day.entries.length} {day.entries.length === 1 ? 'entry' : 'entries'} · {formatDuration(day.tracked, 'short')} tracked · {day.sampleCount ? `${day.sampleCount.toLocaleString()} captures` : 'no captures'}{r?.status === 'sent' && r.sentAt ? ` · sent to ${r.recipients}` : ''}
                </span>
              </div>
              {r && <Button variant="secondary" icon="copy" onClick={() => { void api.ui.copyText(r.markdown); showToast('Markdown copied'); }}>Copy markdown</Button>}
              <Button variant={r ? 'secondary' : 'primary'} icon="sparkles" disabled={busy} onClick={() => void regenerate(day.day)}>{r ? 'Rebuild report' : 'Generate report'}</Button>
            </div>
          </Card>

          <KpiCards tracked={day.tracked} goalHours={goalHours} mix={day.mix} checkins={day.checkins} today={isToday} emptyCheckins="No check-ins that day." />
          <TimelineCard segments={day.timeline} from={from} to={to} live={false} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 24, alignItems: 'start' }}>
            <ActivityCard rows={day.rows} mix={day.mix} meta={SOURCE_META[day.source]} empty="Nothing was captured that day." />
            <EntriesCard entries={day.entries} meta={`${day.entries.length} that day`} empty="No entries that day." onToggle={(id) => void toggleInDay(id)} onResume={(e) => openPrompt('start', e)} />
          </div>

          {r && (
            <Card title={`Daily report — ${r.label}`} actions={<Badge tone={r.status === 'sent' ? 'success' : 'neutral'}>{r.status === 'sent' ? 'Sent' : 'Draft'}</Badge>} padding={20}>
              <div style={{ display: 'grid', gap: 16 }}>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '12px 16px', background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)' }}>
                  {([['Tracked', formatDuration(r.summary.tracked, 'short')], ['Focus', r.summary.focus + '%'], ['Tasks', `${r.summary.done} of ${r.summary.total} done`], ['Check-ins', `${r.summary.checkins} answered`]] as Array<[string, string]>).map(([k, v]) => (
                    <div key={k}><div style={{ font: 'var(--type-overline)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{k}</div><div style={{ font: 'var(--type-mono)', fontSize: 'var(--text-lg)', fontWeight: 500, marginTop: 2 }}>{v}</div></div>
                  ))}
                </div>
                {r.narrative && <div><div style={{ font: 'var(--type-label)', marginBottom: 6 }}>Where the time went</div><div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>{r.narrative}</div></div>}
                {r.blockers && <div><div style={{ font: 'var(--type-label)', marginBottom: 6 }}>Blockers</div><div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>{r.blockers}</div></div>}
                {r.notes && <div><div style={{ font: 'var(--type-label)', marginBottom: 6 }}>Notes</div><div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>{r.notes}</div></div>}
                <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{r.status === 'sent' && r.sentAt ? `Sent to ${r.recipients}` : 'Never sent'} · report totals use the "Round entries to 5 min" setting; the cards above show exact time.</div>
              </div>
            </Card>
          )}
        </div>
        </ScrollArea>
      </>
    );
  }

  return (
    <>
      <Topbar title="Reports">
        <Tabs size="sm" variant="pill" tabs={[{ value: 'today', label: 'Today' }, { value: 'history', label: 'History', count: history.length }]} value={tab} onChange={setTab} />
        <Button size="sm" icon="sparkles" onClick={() => openPrompt('report')}>Generate report</Button>
      </Topbar>
      <ScrollArea>
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))', gap: 24, maxWidth: 'var(--content-max)', alignItems: 'start' }}>
        {tab === 'today'
          ? <Card title={`Daily report — ${dayLabel()}`} padding={20}
            actions={<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}><Button size="sm" variant="ghost" icon="layout-grid" onClick={() => void openDay(dayLabelKey(new Date()))}>Full breakdown</Button><Badge tone={sent ? 'success' : 'neutral'}>{sent ? 'Sent' : 'Draft'}</Badge></div>}>
            <div style={{ display: 'grid', gap: 20 }}>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '12px 16px', background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)' }}>
                {([['Tracked', formatDuration(total, 'short')], ['Entries', String(entries.length)], ['Closed', String(entries.filter((e) => e.done).length)], ['Projects', String(projectCount || projects.length)]] as Array<[string, string]>).map(([k, v]) => (
                  <div key={k}><div style={{ font: 'var(--type-overline)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{k}</div><div style={{ font: 'var(--type-mono)', fontSize: 'var(--text-xl)', fontWeight: 500, marginTop: 2 }}>{v}</div></div>
                ))}
              </div>
              <div>
                <div style={{ font: 'var(--type-label)', marginBottom: 8 }}>What I did</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {entries.length === 0 && <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-tertiary)' }}>No entries yet today. Start a task to begin tracking.</div>}
                  {entries.map(line)}
                </div>
              </div>
              <div>
                <div style={{ font: 'var(--type-label)', marginBottom: 8 }}>Notes & blockers</div>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => void saveNotes()} rows={3} placeholder="Anything your team should know" />
              </div>
              {/* Recipient on the left, actions on the right; on a narrow card the actions wrap as a block instead of squeezing the text. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>To: {recipients}</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto' }}>
                  <Button variant="secondary" icon="eye" onClick={() => openPrompt('report-preview')}>Preview</Button>
                  <Button icon="send" disabled={sent || sending} onClick={() => void send()}>Send report</Button>
                </div>
              </div>
            </div>
          </Card>
          : <Card title="History" meta="every day with tracked time" padding={0}>
            {history.length === 0 ? <div style={{ padding: '12px 20px 20px' }}><EmptyState compact icon="calendar-days" title="Nothing tracked yet" text="Days appear here as soon as they have entries or activity, together with the report you sent for them." /></div> : <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
                <thead><tr><Th>Date</Th><Th right>Tracked</Th><Th right>Entries</Th><Th>Report</Th><Th w={40}></Th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.day} onClick={() => void openDay(h.day)} style={{ cursor: 'pointer' }}>
                      <Td>{h.label}</Td>
                      <Td right mono>{formatDuration(h.tracked, 'short')}</Td>
                      <Td right mono>{h.entries}</Td>
                      <Td><Badge tone={h.status === 'Sent' ? 'success' : h.status === 'Draft' ? 'neutral' : 'warning'} size="sm">{h.status === 'None' ? 'No report' : h.status}</Badge></Td>
                      <Td><IconButton icon="chevron-right" label={`Open ${h.label}`} size="sm" onClick={() => void openDay(h.day)} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
          </Card>}
        <div style={{ display: 'grid', gap: 16 }}>
          <Card title="Delivery">
            <div style={{ display: 'grid', gap: 14 }}>
              <Switch checked={settings?.policy.autoSend ?? true} onChange={(v) => void updateSettings({ policy: { autoSend: v } })} label="Auto-send" description={`Weekdays at ${settings?.policy.reportTime ?? '18:00'}`} />
              <Switch checked={settings?.policy.includeBlockers ?? true} onChange={(v) => void updateSettings({ policy: { includeBlockers: v } })} label="Include blockers" />
              <Switch checked={settings?.policy.attachCsv ?? false} onChange={(v) => void updateSettings({ policy: { attachCsv: v } })} label="Attach CSV" description="Per-entry breakdown" />
            </div>
          </Card>
          <Card title="Streak">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-3xl)', fontWeight: 500 }}>{streak.count}</span>
              <span style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>reports in a row</span>
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
              {streak.bars.map((b, i) => <span key={i} style={{ flex: 1, height: 8, borderRadius: 2, background: b === 'sent' ? 'var(--honey-500)' : b === 'today' ? 'var(--honey-200)' : 'var(--hive-200)' }} />)}
            </div>
          </Card>
        </div>
      </div>
      </ScrollArea>
    </>
  );
}

/** YYYY-MM-DD in local time. */
function dayLabelKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Consecutive weekdays with a sent report, counted back from yesterday; 14 bars ending today. */
function computeStreak(history: ReportHistoryItem[]): { count: number; bars: Array<'sent' | 'missed' | 'today'> } {
  const sent = new Set(history.filter((h) => h.status === 'Sent').map((h) => h.day));
  const d = new Date();
  const bars: Array<'sent' | 'missed' | 'today'> = [];
  const todayKey = dayLabelKey(d);
  bars.unshift(sent.has(todayKey) ? 'sent' : 'today');
  let count = sent.has(todayKey) ? 1 : 0;
  let counting = true;
  for (let i = 0; bars.length < 14 && i < 60; i++) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const k = dayLabelKey(d);
    const ok = sent.has(k);
    bars.unshift(ok ? 'sent' : 'missed');
    if (counting) { if (ok) count++; else counting = false; }
  }
  // Demo/fresh installs: the kit shows 23 — keep the honest local count.
  return { count, bars };
}
