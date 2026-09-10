import { Badge, Button, Card, Icon, Tag, Timer, formatClock } from '@dailybee/ui';
import { PAUSE_LABEL } from '@shared/session';
import { floorHour } from '@shared/time';
import { useStore } from '../store';
import { api } from '../bridge';
import { ActivityCard, EMPTY_MIX, EntriesCard, KpiCards, TimelineCard } from '../components/DayCards';
import { selectElapsed, selectTrackedToday } from '../store';
import { ScrollArea, Topbar } from './Shell';

export function TodayScreen() {
  const session = useStore((s) => s.session);
  const seconds = useStore(selectElapsed);
  const total = useStore(selectTrackedToday);
  const entries = useStore((s) => s.entries);
  const activity = useStore((s) => s.activity);
  const checkins = useStore((s) => s.checkins);
  const projects = useStore((s) => s.projects);
  const goalHours = useStore((s) => s.settings?.dailyGoalHours ?? 8);
  const policy = useStore((s) => s.settings?.policy);
  const now = useStore((s) => s.now);
  const { openPrompt, toggleEntry, triggerCheckin, recategorise } = useStore.getState();
  const running = session.running && !!session.current;
  const current = session.current;
  const project = projects.find((p) => p.id === current?.project);
  const timelineFrom = activity?.firstTs ?? activity?.timeline[0]?.start ?? now;
  // The bar starts at the top of the first sample's hour (09:00 on the kit's day, 19:00 for a 19:18 start).
  const timelineStart = floorHour(timelineFrom);

  return (
    <>
      <Topbar title="Today">
        <Button variant="secondary" size="sm" icon="sparkles" data-tour="generate-report" onClick={() => openPrompt('report')}>Generate report</Button>
      </Topbar>
      <ScrollArea>
      <div style={{ padding: 24, display: 'grid', gap: 24, maxWidth: 'var(--content-max)' }}>
        <div data-tour="session">
        <Card padding={20}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 24, alignItems: 'center' }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {running ? (session.paused ? <Badge dot>Paused</Badge> : <Badge tone="honey" dot pulse>Tracking</Badge>) : <Badge>Idle</Badge>}
                <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>
                  {running && session.startedAt
                    ? session.paused
                      ? `Paused · ${PAUSE_LABEL[session.paused.reason]} since ${formatClock(session.paused.since)} · timer stopped`
                      : `Started ${formatClock(session.startedAt)} · watching apps & browser tabs`
                    : 'Start a task to begin tracking'}
                </span>
              </div>
              <div style={{ font: 'var(--type-h3)', letterSpacing: 'var(--tracking-tight)' }}>{running ? current!.task : 'No active task'}</div>
              {running && current!.goal && <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)' }}><span style={{ color: 'var(--text-tertiary)' }}>Done means: </span>{current!.goal}</div>}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {running && <>
                  {project && <Tag color={project.color}>{project.name}</Tag>}
                  {current!.ref && <Tag>{current!.ref}</Tag>}
                  <Tag>{current!.size}</Tag>
                </>}
                <span style={{ flex: 1 }} />
                {activity?.current && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: 'var(--type-caption)', color: 'var(--text-secondary)' }}>
                    <Icon name={activity.current.icon} size={14} />Now in {activity.current.app}{activity.current.detail ? ` · ${activity.current.detail}` : ''}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Timer seconds={running ? seconds : 0} running={running && !session.paused} size="xl" style={{ fontSize: 44 }} />
              {running
                ? <Button size="lg" glow icon="square" onClick={() => openPrompt('end')}>Stop</Button>
                : <Button size="lg" icon="play" spring pulse data-tour="start-task" onClick={() => openPrompt('start')}>Start a task</Button>}
            </div>
          </div>
        </Card>
        </div>

        <div data-tour="kpis">
        <KpiCards tracked={total} goalHours={goalHours} mix={activity?.mix ?? EMPTY_MIX} checkins={checkins} today
          emptyCheckins={`No check-ins yet today. They appear after ${policy?.fullscreenWarning ? `${policy.warningSeconds} s` : `${policy?.driftMinutes ?? 8} min`} on a distraction site or halfway through a task.`}
          onTrigger={() => void triggerCheckin()} />
        </div>

        <TimelineCard segments={activity?.timeline ?? []} from={timelineStart} to={now} live />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 24, alignItems: 'start' }}>
          <div data-tour="activity" style={{ minWidth: 0 }}>
          <ActivityCard rows={activity?.rows ?? []} mix={activity?.mix ?? EMPTY_MIX}
            meta={activity?.live ? 'apps & tabs · read from the system, no extension' : api.demo ? 'sample day from the design kit' : 'apps & tabs · waiting for the first capture'}
            empty="No activity yet. DailyBee samples the app in front every few seconds once tracking has permission."
            onRecategorise={(target, cat) => void recategorise(target, cat)} />
          </div>
          <EntriesCard entries={entries} meta={`${entries.length} today`} empty="No entries yet today. Start a task to begin tracking."
            onToggle={(id) => void toggleEntry(id)} onResume={(e) => openPrompt('start', e)} />
        </div>
      </div>
      </ScrollArea>
    </>
  );
}
