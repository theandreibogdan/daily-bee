import { Avatar, Badge, Button, Card, Dialog, Input, Radio, Select, Tabs, Tag, Td, Th } from '@dailybee/ui';
import { SIZE_HOURS, TASK_SIZES, TASK_STATUSES, type TaskRef, type TaskSize, type TaskStatus } from '@shared/types';
import { useState } from 'react';
import { ProjectRef } from '../components/ProjectRef';
import { useStore } from '../store';
import { Topbar } from './Shell';

const TEAM_NAMES: Array<[string, string]> = [['ML', 'Mara Lindqvist'], ['JK', 'Jonas Kaur'], ['SO', 'Sena Okafor'], ['RA', 'Rui Almeida'], ['TN', 'Tomas Novak'], ['PB', 'Priya Bhatt']];

export function TasksScreen() {
  const [view, setView] = useState<'list' | 'board'>('list');
  const [filter, setFilter] = useState<'all' | 'mine' | 'over'>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<TaskRef | null>(null);
  const [size, setSize] = useState<TaskSize>('Medium');
  const [status, setStatus] = useState<TaskStatus>('Backlog');
  const [owner, setOwner] = useState('ML');
  const all = useStore((s) => s.tasks);
  const me = useStore((s) => s.settings?.profile.initials ?? 'ML');
  const { saveTask, showToast } = useStore.getState();
  const tasks = all.filter((t) => (filter === 'all' || (filter === 'mine' ? t.owner === me : t.status === 'Overdue')) && (!query || (t.title + ' ' + t.id).toLowerCase().includes(query.toLowerCase())));
  const tone = (s: TaskStatus) => (s === 'Done' ? 'success' : s === 'Overdue' ? 'danger' : s === 'In progress' ? 'honey' : 'neutral');
  const edit = (t: TaskRef) => { setOpen(t); setSize(t.size); setStatus(t.status); setOwner(t.owner); };
  const save = async () => {
    if (!open) return;
    await saveTask({ ...open, size, status, owner, estimate: SIZE_HOURS[size] });
    setOpen(null);
    showToast('Assessment saved · ' + size);
  };
  const Row = ({ t }: { t: TaskRef }) => (
    <tr onClick={() => edit(t)} style={{ cursor: 'pointer' }}>
      <Td mono style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>{t.id}</Td>
      <Td style={{ minWidth: 220 }}><span style={{ font: 'var(--type-label)' }}>{t.title}</span></Td>
      <Td><ProjectRef id={t.project} /></Td>
      <Td><Tag>{t.size}</Tag></Td>
      <Td style={{ whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 72, height: 6, background: 'var(--hive-100)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: Math.min(100, (t.logged / t.estimate) * 100) + '%', height: '100%', background: t.logged > t.estimate ? 'var(--danger)' : 'var(--honey-500)' }} /></div>
          <span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{t.logged}/{t.estimate}h</span>
        </div>
      </Td>
      <Td><Badge tone={tone(t.status)} size="sm">{t.status}</Badge></Td>
      <Td><Avatar initials={t.owner} size={24} /></Td>
    </tr>
  );
  return (
    <>
      <Topbar title="Tasks">
        <Tabs size="sm" variant="pill" tabs={[{ value: 'list', label: 'List', icon: 'list' }, { value: 'board', label: 'Board', icon: 'layout-grid' }]} value={view} onChange={setView} />
        <Button size="sm" icon="plus" onClick={() => showToast('New task created')}>New task</Button>
      </Topbar>
      <div style={{ padding: 24, display: 'grid', gap: 16, maxWidth: 'var(--content-max)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {([['all', 'All'], ['mine', 'Mine'], ['over', 'Overdue']] as Array<['all' | 'mine' | 'over', string]>).map(([v, l]) => <Tag key={v} selected={filter === v} onClick={() => setFilter(v)}>{l}</Tag>)}
          <span style={{ flex: 1 }} />
          <Input size="sm" icon="search" placeholder="Search tasks" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 220 }} />
        </div>
        {view === 'list'
          ? <Card padding={0}><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><Th w={80}>ID</Th><Th>Task</Th><Th>Project</Th><Th>Size</Th><Th>Logged / est.</Th><Th>Status</Th><Th w={48}></Th></tr></thead><tbody>{tasks.map((t) => <Row key={t.id} t={t} />)}</tbody></table></div></Card>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, alignItems: 'start' }}>
            {TASK_STATUSES.map((c) => (
              <div key={c} style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}><span style={{ font: 'var(--type-label)' }}>{c}</span><span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{tasks.filter((t) => t.status === c).length}</span></div>
                {tasks.filter((t) => t.status === c).map((t) => (
                  <Card key={t.id} interactive padding={12} onClick={() => edit(t)}>
                    <div style={{ font: 'var(--type-label)', marginBottom: 8 }}>{t.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ProjectRef id={t.project} /><span style={{ flex: 1 }} /><Tag>{t.size}</Tag><Avatar initials={t.owner} size={22} /></div>
                  </Card>
                ))}
              </div>
            ))}
          </div>}
      </div>
      <Dialog open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ''} description={open ? `${open.id} · ${open.logged}h logged of ${open.estimate}h` : ''} width={520}
        footer={<><Button variant="secondary" onClick={() => setOpen(null)}>Cancel</Button><Button onClick={() => void save()}>Save assessment</Button></>}>
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <div style={{ font: 'var(--type-label)', marginBottom: 10 }}>Size</div>
            <Radio<TaskSize> name="size" direction="row" value={size} onChange={setSize} options={TASK_SIZES} />
            <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', marginTop: 8 }}>≈ {SIZE_HOURS[size]}h · team median for {size.toLowerCase()} is {Math.round(SIZE_HOURS[size] * 1.2 * 10) / 10}h</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Select label="Status" options={TASK_STATUSES} value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} />
            <Select label="Owner" options={TEAM_NAMES.map(([v, l]) => ({ value: v, label: l }))} value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
        </div>
      </Dialog>
    </>
  );
}
