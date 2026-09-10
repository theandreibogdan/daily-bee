import { Badge, Button, Card, Dialog, Input, Switch, Tag } from '@dailybee/ui';
import type { AdminProject } from '@shared/team';
import { PROJECT_COLORS, type Project } from '@shared/types';
import { useState } from 'react';
import { useStore } from '../store';
import { EmptyState } from './EmptyState';

type Range = 'week' | 'month' | 'quarter';
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
interface ProjectForm { name: string; color: string; budgetHours: string; archived: boolean }

/**
 * The project registry with usage against budgets: Admin › Projects (team) and the Solo Projects
 * screen share it. `stats` come from the admin overview for the period (local or workspace).
 */
export function ProjectsPanel({ stats, range, periodLabel }: { stats: AdminProject[]; range: Range; periodLabel: string }) {
  const projects = useStore((s) => s.projects);
  const showToast = useStore((s) => s.showToast);
  const { saveProject, removeProject } = useStore.getState();
  const [editing, setEditing] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ProjectForm>({ name: '', color: PROJECT_COLORS[0]!.token, budgetHours: '40', archived: false });
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);
  const shown = showArchived ? projects : active;
  const statsFor = (p: Project) => stats.find((x) => x.name === p.name);
  const startCreate = () => { setEditing(null); setForm({ name: '', color: PROJECT_COLORS[active.length % PROJECT_COLORS.length]!.token, budgetHours: '40', archived: false }); setCreating(true); };
  const startEdit = (p: Project) => { setCreating(false); setForm({ name: p.name, color: p.color, budgetHours: String(p.budgetHours), archived: !!p.archived }); setEditing(p); };
  const closeDialog = () => { setEditing(null); setCreating(false); };
  const uniqueSlug = (name: string) => { const base = slugify(name); let id = base; for (let n = 2; projects.some((p) => p.id === id); n++) id = `${base}-${n}`; return id; };
  const save = async () => {
    const name = form.name.trim();
    if (!name) return;
    if (projects.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== editing?.id)) { showToast('A project with that name already exists', 'warning'); return; }
    setBusy(true);
    try {
      const id = editing ? editing.id : uniqueSlug(name);
      await saveProject({ id, name, color: form.color, budgetHours: Math.max(0, Number(form.budgetHours) || 0), ...(form.archived ? { archived: true } : {}) });
      showToast(editing ? `${name} saved` : `${name} created`);
      closeDialog();
    } finally { setBusy(false); }
  };
  const del = async () => {
    if (!editing) return;
    setBusy(true);
    try { if (await removeProject(editing.id)) closeDialog(); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {(active.length > 0 || archived.length > 0) && <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>{active.length} project{active.length === 1 ? '' : 's'} · budgets are hours per week{range !== 'week' ? `, shown for the ${periodLabel}` : ''} · click a project to edit it</span>}
        <span style={{ flex: 1 }} />
        {archived.length > 0 && <Tag selected={showArchived} onClick={() => setShowArchived(!showArchived)}>Archived · {archived.length}</Tag>}
        <Button size="sm" icon="plus" onClick={startCreate}>New project</Button>
      </div>
      {shown.length === 0 && <EmptyState icon="folder" title={showArchived ? 'No archived projects' : 'No projects yet'} text={showArchived ? 'Archived projects would be listed here.' : 'Projects group tasks and entries and carry a weekly budget, so the hours have somewhere to go.'} action={showArchived ? undefined : { label: 'New project', icon: 'plus', onClick: startCreate }} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {shown.map((p) => {
          const st = statsFor(p);
          const hours = st?.hours ?? 0, budget = st?.budget ?? p.budgetHours;
          const used = budget > 0 ? Math.round((hours / budget) * 100) : 0;
          return (
            <Card key={p.id} interactive padding={16} onClick={() => startEdit(p)} title={p.name} style={p.archived ? { opacity: 0.6 } : undefined}
              actions={p.archived ? <Badge size="sm">Archived</Badge> : st?.overdue ? <Badge tone="danger" size="sm">{st.overdue} overdue</Badge> : hours > budget && budget > 0 ? <Badge tone="warning" size="sm">Over budget</Badge> : <Badge tone="success" size="sm">On track</Badge>}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color }} /><span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-2xl)', fontWeight: 500 }}>{hours}h</span><span style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}>of {budget}h budget</span></div>
              <div style={{ height: 8, background: 'var(--hive-100)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: Math.min(100, budget > 0 ? (hours / budget) * 100 : 0) + '%', height: '100%', background: hours > budget && budget > 0 ? 'var(--danger)' : 'var(--honey-500)' }} /></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--type-caption)', color: 'var(--text-tertiary)', marginTop: 8 }}><span>{st?.tasks ?? 0} task{(st?.tasks ?? 0) === 1 ? '' : 's'}</span><span>{used}% used</span></div>
            </Card>
          );
        })}
      </div>
      <Dialog open={creating || !!editing} onClose={closeDialog} title={creating ? 'New project' : editing?.name ?? ''} width={480}
        description={creating ? 'Groups tasks and entries; the budget is hours per week.' : editing ? `${editing.id} · used by ${statsFor(editing)?.tasks ?? 0} task${(statsFor(editing)?.tasks ?? 0) === 1 ? '' : 's'} ${periodLabel}` : ''}
        footer={<>
          {editing && <Button variant="ghost" disabled={busy} onClick={() => void del()}>Delete</Button>}
          <Button variant="secondary" onClick={closeDialog}>Cancel</Button>
          <Button icon={creating ? 'plus' : 'check'} disabled={busy || !form.name.trim()} onClick={() => void save()}>{creating ? 'Create project' : 'Save'}</Button>
        </>}>
        <div style={{ display: 'grid', gap: 16 }}>
          <Input label="Name" value={form.name} autoFocus placeholder="e.g. web-app" onChange={(e) => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && form.name.trim()) void save(); }} />
          <div>
            <div style={{ font: 'var(--type-label)', marginBottom: 8 }}>Colour</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {PROJECT_COLORS.map((c) => (
                <button key={c.token} type="button" aria-label={c.label} title={c.label} aria-pressed={form.color === c.token} onClick={() => setForm({ ...form, color: c.token })}
                  style={{ width: 28, height: 28, borderRadius: '50%', background: c.token, cursor: 'pointer', border: '2px solid ' + (form.color === c.token ? 'var(--text-primary)' : 'transparent'), boxShadow: '0 0 0 1px var(--border-subtle)', padding: 0 }} />
              ))}
            </div>
          </div>
          <Input label="Weekly budget" type="number" min={0} max={1000} mono value={form.budgetHours} hint="hours per week; usage is compared against it" onChange={(e) => setForm({ ...form, budgetHours: e.target.value })} />
          {editing && <Switch checked={form.archived} onChange={(v) => setForm({ ...form, archived: v })} label="Archived" description="Hidden from the task pickers; entries and history keep it. Delete is only possible while nothing uses the project." />}
        </div>
      </Dialog>
    </div>
  );
}
