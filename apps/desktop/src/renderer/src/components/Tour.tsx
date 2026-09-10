import { Button } from '@dailybee/ui';
import type { AccountStatus, ScreenId } from '@shared/types';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api } from '../bridge';
import { useStore } from '../store';

interface TourStep {
  id: string;
  title: string;
  text: string;
  /** Element with this data-tour attribute gets the spotlight; none = centred card */
  target?: string;
  /** Screen to show first */
  screen?: ScreenId;
}

/** The first-run tour, adapted to the profile: Solo gets Projects, team accounts get Team (and Admin for admins). */
function buildSteps(a: AccountStatus | null): TourStep[] {
  const first = a?.name?.trim().split(/\s+/)[0];
  const admin = a?.role === 'admin';
  return [
    { id: 'welcome', screen: 'today', title: `Welcome to DailyBee${first ? `, ${first}` : ''}`, text: 'Two minutes through the basics: how tracking starts, where your day shows up and where the report comes from. You can replay this any time from Settings.' },
    { id: 'start', screen: 'today', target: 'start-task', title: 'Everything starts with a task', text: 'Press Start a task, say what you are working on and how big it is. The timer and the app tracking start together.' },
    { id: 'session', screen: 'today', target: 'session', title: 'Your active task', text: 'The timer counts active time only: it pauses when you step away, lock the screen or sleep, and resumes when you are back, asking what to do with the time away. Press Stop when you are done and say how it went; that becomes an entry, which you can correct later.' },
    { id: 'tracking', screen: 'today', target: 'tracking', title: 'What is being recorded', text: 'This line says whether apps and browser tabs are being read and whether the system permission is in place. Pause tracking here or from the tray whenever you need privacy; the timer keeps counting. Apps that must never be recorded are listed in Settings › Tracking.' },
    { id: 'kpis', screen: 'today', target: 'kpis', title: 'Tracked time, focus and check-ins', text: 'Tracked today adds up your entries against the daily goal. Focus is the share of work, research and learning. Check-ins are the moments DailyBee asked whether you were still on task.' },
    { id: 'activity', screen: 'today', target: 'activity', title: 'Where the time actually went', text: 'DailyBee samples the app or browser tab in front every few seconds and sorts it into Work, Research, Learning, Communication or Distraction. Wrong category? Use the tag button on a row and it remembers.' },
    { id: 'report', screen: 'today', target: 'generate-report', title: 'The daily report', text: 'At the end of the day, generate the report: what shipped, what is in progress, where the time went. Review it on Reports, then send it to Slack or email, or copy it as markdown.' },
    { id: 'reports', target: 'nav-reports', title: 'Reports and past days', text: 'Every day with tracked time is kept. History opens any day with the same breakdown you see on Today.' },
    { id: 'tasks', target: 'nav-tasks', title: 'Tasks', text: 'Tasks keep logged time against your estimate. Switch to the board to drag them from backlog through in progress to done.' },
    a?.mode === 'solo'
      ? { id: 'projects', target: 'nav-projects', title: 'Projects', text: 'Projects group tasks and entries and carry a weekly budget, so you can see where the hours go.' }
      : { id: 'team', target: 'nav-team', title: admin ? 'Team and Admin' : 'Team', text: admin ? 'Team shows who is tracking now and who has sent their report. Admin adds projects, budgets and the workspace policy and shows everyone’s focus. Only aggregates leave each device, never pages or URLs.' : 'Team shows who is tracking now and who has sent their report. Only aggregates leave your device, never pages or URLs.' },
    { id: 'settings', target: 'nav-settings', title: 'Settings, and the tray', text: 'Idle detection, check-ins, report delivery and your account live here. Closing the window keeps DailyBee tracking in the tray; quit from the tray icon. Ctrl+K opens search from anywhere.' },
  ];
}

const PAD = 8;
const CARD_W = 372;

/**
 * Guided first run: dims the app, spotlights one real control at a time and explains it in a callout,
 * switching screens as it goes. Finishing or skipping marks the profile's tour as done.
 */
export function Tour() {
  const open = useStore((s) => s.tourOpen);
  const account = useStore((s) => s.account);
  const screen = useStore((s) => s.screen);
  const { setTour, nav } = useStore.getState();
  const steps = useMemo(() => buildSteps(account), [account]);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [card, setCard] = useState({ w: CARD_W, h: 220 });
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[Math.min(i, steps.length - 1)]!;
  const last = i === steps.length - 1;

  // Each step opens on its screen first.
  useEffect(() => { if (open && step.screen && screen !== step.screen) nav(step.screen); }, [open, step, screen, nav]);

  // Find and follow the target: poll until the screen has rendered it, re-measure on scroll and resize.
  useEffect(() => {
    if (!open) return;
    let raf = 0, tries = 0, scrolled = false, cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
      if (el) {
        if (!scrolled) { scrolled = true; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
        const r = el.getBoundingClientRect();
        setRect(r.width && r.height ? r : null);
      } else {
        setRect(null);
        if (step.target && tries++ < 40) raf = requestAnimationFrame(measure);
      }
    };
    measure();
    const again = () => { scrolled = true; measure(); };
    window.addEventListener('resize', again);
    const scrollers = Array.from(document.querySelectorAll('.db-scroll'));
    scrollers.forEach((s) => s.addEventListener('scroll', again));
    return () => { cancelled = true; cancelAnimationFrame(raf); window.removeEventListener('resize', again); scrollers.forEach((s) => s.removeEventListener('scroll', again)); };
  }, [open, step, screen]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (el) setCard({ w: el.offsetWidth, h: el.offsetHeight });
  }, [i, rect, open]);

  const finish = async () => { setTour(false); setI(0); await api.account.finishTour(); };
  const next = () => { if (last) void finish(); else setI(i + 1); };
  const back = () => setI(Math.max(0, i - 1));

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); void finish(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  });

  if (!open || !account) return null;

  // Callout placement: beside the target when there is room (sidebar items), else below, else above.
  const vw = window.innerWidth, vh = window.innerHeight, gap = 16;
  let pos: CSSProperties;
  if (!rect) pos = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  else if (rect.right + gap + card.w + 16 < vw) pos = { left: rect.right + gap, top: Math.min(Math.max(16, rect.top), vh - card.h - 16) };
  else if (rect.bottom + gap + card.h + 16 < vh) pos = { left: Math.min(Math.max(16, rect.left), vw - card.w - 16), top: rect.bottom + gap };
  else pos = { left: Math.min(Math.max(16, rect.left), vw - card.w - 16), top: Math.max(16, rect.top - gap - card.h) };

  return (
    <div role="dialog" aria-modal="true" aria-label="DailyBee tour" style={{ position: 'fixed', inset: 0, zIndex: 400 }}>
      {rect
        ? <div aria-hidden="true" style={{ position: 'fixed', left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, borderRadius: 'var(--radius-lg)', boxShadow: '0 0 0 9999px var(--scrim), 0 0 0 3px var(--honey-500)', transition: 'left var(--dur-slow) var(--ease-out), top var(--dur-slow) var(--ease-out), width var(--dur-slow) var(--ease-out), height var(--dur-slow) var(--ease-out)', pointerEvents: 'none' }} />
        : <div aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'var(--scrim)' }} />}
      <div ref={cardRef} data-tour-card style={{ position: 'fixed', width: CARD_W, maxWidth: 'calc(100vw - 32px)', ...pos, background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', padding: 20, display: 'grid', gap: 10, animation: 'db-rise var(--dur-slow) var(--ease-out)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ font: 'var(--type-overline)', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{i === 0 ? 'Tour' : `Step ${i} of ${steps.length - 1}`}</span>
          <span style={{ flex: 1 }} />
          <span aria-hidden="true" style={{ display: 'flex', gap: 4 }}>{steps.map((s, j) => <span key={s.id} style={{ width: j === i ? 16 : 6, height: 6, borderRadius: 'var(--radius-full)', background: j <= i ? 'var(--honey-500)' : 'var(--hive-200)', transition: 'width var(--dur-fast) var(--ease-out)' }} />)}</span>
        </div>
        <div style={{ font: 'var(--type-h4)', letterSpacing: 'var(--tracking-tight)' }}>{step.title}</div>
        <div style={{ font: 'var(--type-body-sm)', color: 'var(--text-secondary)', textWrap: 'pretty' }}>{step.text}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Button size="sm" variant="ghost" onClick={() => void finish()}>{i === 0 ? 'Skip' : 'Skip tour'}</Button>
          <span style={{ flex: 1 }} />
          {i > 0 && <Button size="sm" variant="secondary" icon="arrow-left" onClick={back}>Back</Button>}
          <Button size="sm" icon={last ? 'check' : 'arrow-right'} autoFocus onClick={next}>{i === 0 ? 'Start the tour' : last ? 'Done' : 'Next'}</Button>
        </div>
      </div>
    </div>
  );
}
