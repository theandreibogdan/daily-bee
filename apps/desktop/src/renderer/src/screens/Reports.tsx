import { Badge, Button, Card, Icon, IconButton, Switch, Tabs, Td, Textarea, Th, formatDuration } from '@dailybee/ui';
import { dayLabel } from '@shared/time';
import type { Entry, ReportDraft, ReportHistoryItem } from '@shared/types';
import { useEffect, useState } from 'react';
import { api } from '../bridge';
import { ProjectRef } from '../components/ProjectRef';
import { selectTrackedToday, useStore } from '../store';
import { ScrollArea, Topbar } from './Shell';

export function ReportsScreen() {
  const [tab, setTab] = useState<'today' | 'history'>('today');
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [history, setHistory] = useState<ReportHistoryItem[]>([]);
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  /** A past report opened from History (read-only) */
  const [viewing, setViewing] = useState<ReportDraft | null>(null);
  const entries = useStore((s) => s.entries);
  const total = useStore(selectTrackedToday);
  const settings = useStore((s) => s.settings);
  const projects = useStore((s) => s.projects);
  const reportsView = useStore((s) => s.reportsView);
  const { openPrompt, updateSettings, showToast } = useStore.getState();
  const prompt = useStore((s) => s.prompt);

  const load = async () => {
    const [d, h] = await Promise.all([api.reports.current(), api.reports.history()]);
    setDraft(d);
    setNotes(d?.notes ?? (api.demo ? 'Blocked on staging DB credentials until Rui is back tomorrow.' : ''));
    setHistory(h);
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (prompt === null) void load(); }, [prompt]);
  // Hand-off from Admin › Open reports or the palette: pick the tab.
  useEffect(() => { if (reportsView) { setTab(reportsView); setViewing(null); useStore.setState({ reportsView: null }); } }, [reportsView]);

  const sent = draft?.status === 'sent';
  const saveNotes = async () => { if (draft?.notes === notes) return; setDraft(await api.reports.save({ notes })); };
  const send = async () => {
    setSending(true);
    try { await saveNotes(); const r = await api.reports.send(); setDraft(r.draft); setHistory(await api.reports.history()); } finally { setSending(false); }
  };
  const openDay = async (day: string) => {
    const d = await api.reports.get(day);
    if (!d) { showToast('That report is no longer stored', 'warning'); return; }
    setViewing(d);
    setTab('today');
  };
  const projectCount = new Set(entries.map((e) => e.project)).size;
  const recipients = draft?.recipients || (settings?.delivery.slackChannel ? `${settings.delivery.slackChannel}` : 'Not configured');
  const streak = computeStreak(history);
  const line = (e: Entry) => (
    <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
      <Icon name={e.done ? 'check-circle-2' : 'circle'} size={16} style={{ color: e.done ? 'var(--success)' : 'var(--text-tertiary)' }} />
      <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.task}</span>
      <ProjectRef id={e.project} />
      <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', minWidth: 56, textAlign: 'right' }}>{formatDuration(e.seconds, 'short')}</span>
    </div>
  );

  return (
    <>
      <Topbar title="Reports">
        <Tabs size="sm" variant="pill" tabs={[{ value: 'today', label: 'Today' }, { value: 'history', label: 'History', count: history.length }]} value={tab} onChange={(v) => { setTab(v); if (v === 'today') setViewing(null); }} />
        <Button size="sm" icon="sparkles" onClick={() => openPrompt('report')}>Generate report</Button>
      </Topbar>
      <ScrollArea>
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))', gap: 24, maxWidth: 'var(--content-max)', alignItems: 'start' }}>
        {tab === 'today' && viewing
          ? <Card title={`Daily report — ${viewing.label}`} actions={<Badge tone={viewing.status === 'sent' ? 'success' : 'neutral'}>{viewing.status === 'sent' ? 'Sent' : 'Draft'}</Badge>} padding={20}>
            <div style={{ display: 'grid', gap: 20 }}>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '12px 16px', background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)' }}>
                {([['Tracked', formatDuration(viewing.summary.tracked, 'short')], ['Entries', String(viewing.summary.total)], ['Closed', String(viewing.summary.done)], ['Focus', viewing.summary.focus + '%']] as Array<[string, string]>).map(([k, v]) => (
                  <div key={k}><div style={{ font: 'var(--type-overline)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{k}</div><div style={{ font: 'var(--type-mono)', fontSize: 'var(--text-xl)', fontWeight: 500, marginTop: 2 }}>{v}</div></div>
                ))}
              </div>
              <div>
                <div style={{ font: 'var(--type-label)', marginBottom: 8 }}>What I did</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {viewing.shipped.length + viewing.inProgress.length === 0 && <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-tertiary)' }}>No entries that day.</div>}
                  {viewing.shipped.map(line)}{viewing.inProgress.map(line)}
                </div>
              </div>
              {viewing.narrative && <div><div style={{ font: 'var(--type-label)', marginBottom: 6 }}>Where the time went</div><div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>{viewing.narrative}</div></div>}
              {viewing.notes && <div><div style={{ font: 'var(--type-label)', marginBottom: 6 }}>Notes & blockers</div><div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>{viewing.notes}</div></div>}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{viewing.status === 'sent' && viewing.sentAt ? `Sent to ${viewing.recipients}` : 'Never sent'}</span>
                <span style={{ flex: 1 }} />
                <Button variant="secondary" icon="copy" onClick={() => { void api.ui.copyText(viewing.markdown); showToast('Markdown copied'); }}>Copy markdown</Button>
                <Button variant="secondary" icon="arrow-left" onClick={() => setViewing(null)}>Back to today</Button>
              </div>
            </div>
          </Card>
          : tab === 'today'
          ? <Card title={`Daily report — ${dayLabel()}`} actions={<Badge tone={sent ? 'success' : 'neutral'}>{sent ? 'Sent' : 'Draft'}</Badge>} padding={20}>
            <div style={{ display: 'grid', gap: 20 }}>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '12px 16px', background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)' }}>
                {([['Tracked', formatDuration(total, 'short')], ['Entries', String(entries.length)], ['Closed', String(entries.filter((e) => e.done).length)], ['Projects', String(projectCount || projects.length)]] as Array<[string, string]>).map(([k, v]) => (
                  <div key={k}><div style={{ font: 'var(--type-overline)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{k}</div><div style={{ font: 'var(--type-mono)', fontSize: 'var(--text-xl)', fontWeight: 500, marginTop: 2 }}>{v}</div></div>
                ))}
              </div>
              <div>
                <div style={{ font: 'var(--type-label)', marginBottom: 8 }}>What I did</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {entries.length === 0 && <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-tertiary)' }}>No entries yet today. Start the timer or log time manually.</div>}
                  {entries.map(line)}
                </div>
              </div>
              <div>
                <div style={{ font: 'var(--type-label)', marginBottom: 8 }}>Notes & blockers</div>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => void saveNotes()} rows={3} placeholder="Anything your team should know" />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>To: {recipients}</span>
                <span style={{ flex: 1 }} />
                <Button variant="secondary" icon="eye" onClick={() => openPrompt('report-preview')}>Preview</Button>
                <Button icon="send" disabled={sent || sending} onClick={() => void send()}>Send report</Button>
              </div>
            </div>
          </Card>
          : <Card title="History" padding={0}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
                <thead><tr><Th>Date</Th><Th right>Tracked</Th><Th right>Entries</Th><Th>Status</Th><Th w={40}></Th></tr></thead>
                <tbody>
                  {history.length === 0 && <tr><Td colSpan={5} style={{ color: 'var(--text-tertiary)', font: 'var(--type-body-sm)' }}>No reports yet. Generate one from Today.</Td></tr>}
                  {history.map((r) => (
                    <tr key={r.day} onClick={() => void openDay(r.day)} style={{ cursor: 'pointer' }}>
                      <Td>{r.label}</Td>
                      <Td right mono>{formatDuration(r.tracked, 'short')}</Td>
                      <Td right mono>{r.entries}</Td>
                      <Td><Badge tone={r.status === 'Sent' ? 'success' : 'neutral'}>{r.status}</Badge></Td>
                      <Td><IconButton icon="chevron-right" label={`Open ${r.label}`} size="sm" onClick={() => void openDay(r.day)} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

/** Consecutive weekdays with a sent report, counted back from yesterday; 14 bars ending today. */
function computeStreak(history: ReportHistoryItem[]): { count: number; bars: Array<'sent' | 'missed' | 'today'> } {
  const sent = new Set(history.filter((h) => h.status === 'Sent').map((h) => h.day));
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const d = new Date();
  const bars: Array<'sent' | 'missed' | 'today'> = [];
  const todayKey = key(d);
  bars.unshift(sent.has(todayKey) ? 'sent' : 'today');
  let count = sent.has(todayKey) ? 1 : 0;
  let counting = true;
  for (let i = 0; bars.length < 14 && i < 60; i++) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const k = key(d);
    const ok = sent.has(k);
    bars.unshift(ok ? 'sent' : 'missed');
    if (counting) { if (ok) count++; else counting = false; }
  }
  // Demo/fresh installs: the kit shows 23 — keep the honest local count.
  return { count, bars };
}
