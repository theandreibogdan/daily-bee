import { Badge, Button, Card, Dialog, Input, Radio, Select, Tabs, Tag, Td, Th } from '@dailybee/ui';
import { PersonAvatar } from '../components/PersonAvatar';
import { SIZE_HOURS, TASK_PRIORITIES, TASK_SIZES, TASK_STATUSES, type TaskPriority, type TaskRef, type TaskSize, type TaskStatus } from '@shared/types';
import { useEffect, useState, type DragEvent } from 'react';
import { EmptyState } from '../components/EmptyState';
import { FilterMenu } from '../components/FilterMenu';
import { ProjectRef } from '../components/ProjectRef';
import { useStore } from '../store';
import { nextTaskId } from './Prompts';
import { ScrollArea, Topbar } from './Shell';

/** Full names for the kit's sample owners; unknown initials are shown as they are. */
const KNOWN_NAMES: Record<string, string> = { ML: 'Mara Lindqvist', JK: 'Jonas Kaur', SO: 'Sena Okafor', RA: 'Rui Almeida', TN: 'Tomas Novak', PB: 'Priya Bhatt' };
const PRIORITY_TONE: Record<TaskPriority, 'danger' | 'warning' | 'neutral'> = { Urgent: 'danger', High: 'warning', Normal: 'neutral', Low: 'neutral' };
const priorityOf = (t: TaskRef): TaskPriority => t.priority ?? 'Normal';
const STATUS_DOT: Record<TaskStatus, string> = { Backlog: 'var(--hive-400)', 'In progress': 'var(--honey-500)', Done: 'var(--success)', Overdue: 'var(--danger)' };
const PRIORITY_DOT: Record<TaskPriority, string> = { Urgent: 'var(--danger)', High: 'var(--warning)', Normal: 'var(--hive-400)', Low: 'var(--hive-300)' };

/** Median of the hours actually logged on your tasks of this size (only tasks with time on them). */
function loggedMedian(tasks: TaskRef[], size: TaskSize): number | null {
  const v = tasks.filter((t) => t.size === size && t.logged > 0).map((t) => t.logged).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return Math.round((v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2) * 10) / 10;
}

type Quick = 'all' | 'mine' | 'over';
const ANY = 'all';

export function TasksScreen() {
  const [view, setView] = useState<'list' | 'board'>('list');
  const [quick, setQuick] = useState<Quick>('all');
  const [query, setQuery] = useState('');
  const [fProject, setFProject] = useState(ANY);
  const [fStatus, setFStatus] = useState<TaskStatus | typeof ANY>(ANY);
  const [fPriority, setFPriority] = useState<TaskPriority | typeof ANY>(ANY);
  const [fSize, setFSize] = useState<TaskSize | typeof ANY>(ANY);
  const [open, setOpen] = useState<TaskRef | null>(null);
  const [size, setSize] = useState<TaskSize>('Medium');
  const [status, setStatus] = useState<TaskStatus>('Backlog');
  const [priority, setPriority] = useState<TaskPriority>('Normal');
  const [owner, setOwner] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newSize, setNewSize] = useState<TaskSize>('Medium');
  const [newPriority, setNewPriority] = useState<TaskPriority>('Normal');
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const all = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const account = useStore((s) => s.account);
  const me = useStore((s) => s.settings?.profile.initials ?? '');
  const tasksFocus = useStore((s) => s.tasksFocus);
  const { saveTask, showToast } = useStore.getState();
  // Solo: one person, so nothing is "mine" versus someone else's and owners are not shown.
  const solo = account?.mode === 'solo';
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? (id ? id : 'No project');
  const usedProjects = Array.from(new Set(all.map((t) => t.project)));
  const tasks = all.filter((t) =>
    (quick === 'all' || (quick === 'mine' ? t.owner === me : t.status === 'Overdue'))
    && (fProject === ANY || t.project === fProject)
    && (fStatus === ANY || t.status === fStatus)
    && (fPriority === ANY || priorityOf(t) === fPriority)
    && (fSize === ANY || t.size === fSize)
    && (!query || (t.title + ' ' + t.id).toLowerCase().includes(query.toLowerCase())));
  const filtering = quick !== 'all' || fProject !== ANY || fStatus !== ANY || fPriority !== ANY || fSize !== ANY || !!query;
  const clearFilters = () => { setQuick('all'); setFProject(ANY); setFStatus(ANY); setFPriority(ANY); setFSize(ANY); setQuery(''); };
  const tone = (s: TaskStatus) => (s === 'Done' ? 'success' : s === 'Overdue' ? 'danger' : s === 'In progress' ? 'honey' : 'neutral');
  const edit = (t: TaskRef) => { setOpen(t); setSize(t.size); setStatus(t.status); setPriority(priorityOf(t)); setOwner(t.owner); };
  // Hand-off from the search palette: open that task's dialog.
  useEffect(() => {
    if (!tasksFocus) return;
    const t = all.find((x) => x.id === tasksFocus);
    if (t) edit(t);
    useStore.setState({ tasksFocus: null });
  }, [tasksFocus, all]);
  const owners = Array.from(new Set([me, ...all.map((t) => t.owner)].filter(Boolean)));
  const save = async () => {
    if (!open) return;
    // A new size gets the standard estimate; otherwise the task's own estimate stays.
    await saveTask({ ...open, size, status, priority, owner: solo ? open.owner || me : owner, estimate: size === open.size ? open.estimate : SIZE_HOURS[size] });
    setOpen(null);
    showToast('Task updated · ' + size + ' · ' + priority);
  };
  const startCreate = () => { setNewTitle(''); setNewProject(projects.find((p) => !p.archived)?.id ?? ''); setNewSize('Medium'); setNewPriority('Normal'); setCreating(true); };
  const create = async () => {
    const title = newTitle.trim();
    if (!title) return;
    const id = nextTaskId(all);
    await saveTask({ id, title, project: newProject || projects.find((p) => !p.archived)?.id || '', size: newSize, priority: newPriority, estimate: SIZE_HOURS[newSize], logged: 0, status: 'Backlog', owner: me || '··' });
    setCreating(false);
    showToast(`${id} created`);
  };
  const drop = (e: DragEvent, to: TaskStatus) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData('text/plain');
    const t = all.find((x) => x.id === id);
    if (!t || t.status === to) return;
    void saveTask({ ...t, status: to }).then(() => showToast(`${t.id} → ${to}`));
  };
  const median = loggedMedian(all, size);
  const PriorityBadge = ({ p }: { p: TaskPriority }) => (
    <Badge tone={PRIORITY_TONE[p]} size="sm">{p}</Badge>
  );
  const Row = ({ t }: { t: TaskRef }) => (
    <tr onClick={() => edit(t)} style={{ cursor: 'pointer' }}>
      <Td mono style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>{t.id}</Td>
      <Td style={{ minWidth: 220 }}><span style={{ font: 'var(--type-label)' }}>{t.title}</span></Td>
      <Td><ProjectRef id={t.project} /></Td>
      <Td><PriorityBadge p={priorityOf(t)} /></Td>
      <Td><Tag>{t.size}</Tag></Td>
      <Td style={{ whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 72, height: 6, background: 'var(--hive-100)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: Math.min(100, (t.logged / t.estimate) * 100) + '%', height: '100%', background: t.logged > t.estimate ? 'var(--danger)' : 'var(--honey-500)' }} /></div>
          <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{t.logged}/{t.estimate}h</span>
        </div>
      </Td>
      <Td><Badge tone={tone(t.status)} size="sm">{t.status}</Badge></Td>
      {!solo && <Td><PersonAvatar initials={t.owner} size={24} /></Td>}
    </tr>
  );
  return (
    <>
      <Topbar title="Tasks">
        <Tabs size="sm" variant="pill" tabs={[{ value: 'list', label: 'List', icon: 'list' }, { value: 'board', label: 'Board', icon: 'layout-grid' }]} value={view} onChange={setView} />
        <Button size="sm" icon="plus" onClick={startCreate}>New task</Button>
      </Topbar>
      <ScrollArea>
      <div style={{ padding: 24, display: 'grid', gap: 16, maxWidth: 'var(--content-max)' }}>
        {all.length > 0 && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {(solo ? [['all', 'All'], ['over', 'Overdue']] : [['all', 'All'], ['mine', 'Mine'], ['over', 'Overdue']]).map(([v, l]) => <Tag key={v} selected={quick === v} onClick={() => setQuick(v as Quick)}>{l}</Tag>)}
              <span style={{ flex: 1 }} />
              <Input size="sm" icon="search" placeholder="Search tasks" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 220 }} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }} aria-label="Filters">
              <FilterMenu label="Project" icon="folder" allLabel="All projects" value={fProject} onChange={setFProject} options={usedProjects.map((id) => ({ value: id, label: projectName(id), dot: projects.find((p) => p.id === id)?.color ?? 'var(--hive-400)' }))} />
              <FilterMenu label="Status" icon="circle-dot" allLabel="All statuses" value={fStatus} onChange={(v) => setFStatus(v as TaskStatus | typeof ANY)} options={TASK_STATUSES.map((s) => ({ value: s, label: s, dot: STATUS_DOT[s] }))} />
              <FilterMenu label="Priority" icon="flag" allLabel="All priorities" value={fPriority} onChange={(v) => setFPriority(v as TaskPriority | typeof ANY)} options={TASK_PRIORITIES.map((p) => ({ value: p, label: p, dot: PRIORITY_DOT[p] }))} />
              <FilterMenu label="Size" icon="ruler" allLabel="All sizes" value={fSize} onChange={(v) => setFSize(v as TaskSize | typeof ANY)} options={TASK_SIZES.map((s) => ({ value: s, label: s }))} />
              {filtering && <Button size="sm" variant="ghost" icon="x" onClick={clearFilters}>Clear filters</Button>}
              <span style={{ flex: 1 }} />
              <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{filtering ? `${tasks.length} of ${all.length} tasks` : `${all.length} task${all.length === 1 ? '' : 's'}`}</span>
            </div>
          </div>
        )}
        {all.length === 0 && <EmptyState icon="list-checks" title="No tasks yet" text="Create one here, or type a new name when you start a task on Today. Each task keeps its logged time against the size you give it." action={{ label: 'New task', icon: 'plus', onClick: startCreate }} />}
        {all.length > 0 && tasks.length === 0 && <EmptyState compact icon="filter" title="No tasks match these filters" text="Try a wider filter, or clear them all." action={{ label: 'Clear filters', icon: 'x', onClick: clearFilters }} />}
        {tasks.length > 0 && (view === 'list'
          ? <Card padding={0}><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><Th w={80}>ID</Th><Th>Task</Th><Th>Project</Th><Th>Priority</Th><Th>Size</Th><Th>Logged / est.</Th><Th>Status</Th>{!solo && <Th w={48}></Th>}</tr></thead><tbody>{tasks.map((t) => <Row key={t.id} t={t} />)}</tbody></table></div></Card>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, alignItems: 'start' }}>
            {TASK_STATUSES.map((c) => (
              <div key={c} onDragOver={(e) => { e.preventDefault(); if (dragOver !== c) setDragOver(c); }} onDragLeave={() => setDragOver(null)} onDrop={(e) => drop(e, c)}
                style={{ display: 'grid', gap: 8, minHeight: 120, padding: 4, borderRadius: 'var(--radius-md)', background: dragOver === c ? 'var(--surface-accent-soft)' : 'transparent', transition: 'background var(--dur-fast) var(--ease-out)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}><span style={{ font: 'var(--type-label)' }}>{c}</span><span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{tasks.filter((t) => t.status === c).length}</span></div>
                {tasks.filter((t) => t.status === c).map((t) => (
                  <div key={t.id} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; }} title="Drag to another column to change the status">
                    <Card interactive padding={12} onClick={() => edit(t)}>
                      <div style={{ font: 'var(--type-label)', marginBottom: 8 }}>{t.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <ProjectRef id={t.project} />
                        {priorityOf(t) !== 'Normal' && <PriorityBadge p={priorityOf(t)} />}
                        <span style={{ flex: 1 }} />
                        <Tag>{t.size}</Tag>
                        {!solo && <PersonAvatar initials={t.owner} size={22} />}
                      </div>
                    </Card>
                  </div>
                ))}
              </div>
            ))}
          </div>)}
      </div>
      </ScrollArea>
      <Dialog open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ''} description={open ? `${open.id} · ${open.logged}h logged of ${open.estimate}h` : ''} width={520}
        footer={<><Button variant="secondary" onClick={() => setOpen(null)}>Cancel</Button><Button onClick={() => void save()}>Save</Button></>}>
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <div style={{ font: 'var(--type-label)', marginBottom: 10 }}>Size</div>
            <Radio<TaskSize> name="size" direction="row" value={size} onChange={setSize} options={TASK_SIZES} />
            <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', marginTop: 8 }}>≈ {SIZE_HOURS[size]}h{median !== null ? ` · your median for ${size.toLowerCase()} tasks is ${median}h` : ` · no finished ${size.toLowerCase()} tasks to compare with yet`}</div>
          </div>
          <div>
            <div style={{ font: 'var(--type-label)', marginBottom: 10 }}>Priority</div>
            <Radio<TaskPriority> name="priority" direction="row" value={priority} onChange={setPriority} options={TASK_PRIORITIES} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: solo ? '1fr' : '1fr 1fr', gap: 12 }}>
            <Select label="Status" options={TASK_STATUSES} value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} />
            {!solo && <Select label="Owner" options={owners.map((o) => ({ value: o, label: KNOWN_NAMES[o] ?? o }))} value={owner} onChange={(e) => setOwner(e.target.value)} />}
          </div>
        </div>
      </Dialog>
      <Dialog open={creating} onClose={() => setCreating(false)} title="New task" description="Goes to the backlog; start it from Today when you pick it up." width={520}
        footer={<><Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button><Button icon="plus" disabled={!newTitle.trim()} onClick={() => void create()}>Create task</Button></>}>
        <div style={{ display: 'grid', gap: 16 }}>
          <Input label="Title" value={newTitle} autoFocus placeholder="What needs doing?" onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newTitle.trim()) void create(); }} />
          {projects.some((p) => !p.archived)
            ? <Select label="Project" options={projects.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name }))} value={newProject} onChange={(e) => setNewProject(e.target.value)} />
            : <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>No projects yet, so this task gets none. {account?.mode === 'solo' ? 'Create projects on the Projects screen.' : account?.role === 'admin' ? 'Create projects in Admin › Projects.' : 'Your workspace admin adds projects.'}</div>}
          <div>
            <div style={{ font: 'var(--type-label)', marginBottom: 10 }}>Size</div>
            <Radio<TaskSize> name="new-size" direction="row" value={newSize} onChange={setNewSize} options={TASK_SIZES} />
            <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', marginTop: 8 }}>≈ {SIZE_HOURS[newSize]}h estimate</div>
          </div>
          <div>
            <div style={{ font: 'var(--type-label)', marginBottom: 10 }}>Priority</div>
            <Radio<TaskPriority> name="new-priority" direction="row" value={newPriority} onChange={setNewPriority} options={TASK_PRIORITIES} />
          </div>
        </div>
      </Dialog>
    </>
  );
}
