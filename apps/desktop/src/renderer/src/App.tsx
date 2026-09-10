import { Toast } from '@dailybee/ui';
import { useEffect, type CSSProperties, useRef } from 'react';
import { AwayCard } from './components/AwayCard';
import { CommandPalette } from './components/CommandPalette';
import { EntryDialogs } from './components/EntryDialogs';
import { WhatsNewDialog } from './components/WhatsNewDialog';
import { TITLEBAR_HEIGHT, TitleBar, hasCustomTitleBar } from './components/TitleBar';
import { Tour } from './components/Tour';
import { AdminScreen } from './screens/Admin';
import { LockScreen } from './screens/Lock';
import { Onboarding } from './screens/Onboarding';
import { ProfilesScreen } from './screens/Profiles';
import { ProjectsScreen } from './screens/Projects';
import { CheckinPopup, EndTaskDialog, GenerateReportDialog, StartTaskDialog } from './screens/Prompts';
import { ReportsScreen } from './screens/Reports';
import { SettingsScreen } from './screens/Settings';
import { Sidebar, navFor } from './screens/Shell';
import { TasksScreen } from './screens/Tasks';
import { TeamScreen } from './screens/Team';
import { TodayScreen } from './screens/Today';
import { WarningCard } from './screens/WarningWindow';
import { api, isElectron } from './bridge';
import { useStore } from './store';

export function App() {
  const ready = useStore((s) => s.ready);
  const screen = useStore((s) => s.screen);
  const running = useStore((s) => s.session.running);
  const prompt = useStore((s) => s.prompt);
  const resumeEntry = useStore((s) => s.resumeEntry);
  const activeCheckin = useStore((s) => s.activeCheckin);
  const toast = useStore((s) => s.toast);
  const account = useStore((s) => s.account);
  const profiles = useStore((s) => s.profiles);
  const converting = useStore((s) => s.converting);
  const away = useStore((s) => s.away);
  const { init, nav, openPrompt, answerCheckin, dismissToast, setPalette, setConverting, setTour, chooseAway } = useStore.getState();
  useEffect(() => { void init(); }, [init]);
  // A screen the current mode does not offer (Admin for a member, Team in Solo) falls back to Today.
  useEffect(() => {
    if (!account?.setupDone) return;
    if (screen !== 'settings' && !navFor(account).some((n) => n.id === screen)) nav('today');
  }, [account, screen, nav]);
  // Finishing the wizard lands on Today, whatever screen was open before.
  const setupDone = account?.setupDone;
  const wasSetUp = useRef<boolean | undefined>(undefined);
  useEffect(() => { if (setupDone && wasSetUp.current === false) nav('today'); wasSetUp.current = setupDone; }, [setupDone, nav]);
  // The guided first run: once per profile, as soon as the app is usable (not locked, not signing in, not demo).
  const tourDue = !!account?.setupDone && !account.locked && !account.needsLogin && !account.tourDone && !converting && !api.demo;
  useEffect(() => { if (tourDue) setTour(true); }, [tourDue, setTour]);
  // Ctrl/⌘K opens the search palette from anywhere.
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(!useStore.getState().paletteOpen); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [setPalette]);
  if (!ready) return <div style={{ minHeight: '100vh', background: 'var(--bg-app)' }} />;
  // --titlebar-h lets the sticky sidebar and top bar sit below the custom title bar.
  // Fixed-height shell: only each screen's content area scrolls (see ScrollArea), never the window.
  const root = { height: '100vh', overflow: 'hidden', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', '--titlebar-h': `${hasCustomTitleBar ? TITLEBAR_HEIGHT : 0}px` } as CSSProperties;
  const floatingToast = toast && <div style={{ position: 'fixed', left: 24, bottom: 24, zIndex: 200 }}><Toast tone={toast.tone ?? 'success'} onDismiss={dismissToast}>{toast.text}</Toast></div>;
  const others = profiles?.profiles.filter((p) => p.setupDone && p.id !== profiles.open).length ?? 0;
  const switchProfile = { label: 'Switch profile', icon: 'users', onClick: () => void api.profiles.close() };
  // Signed out: pick a profile. First run (or a new profile): the wizard. Solo profiles: the lock
  // screen until the password is entered. A team profile signed out on this device: its sign-in form.
  if (profiles && !profiles.open) return <div style={root}><TitleBar /><ProfilesScreen />{floatingToast}</div>;
  if (account && !account.setupDone) {
    return <div style={root}><TitleBar /><Onboarding escape={others > 0 ? { label: 'Back to profiles', icon: 'users', onClick: () => void api.profiles.discard() } : undefined} />{floatingToast}</div>;
  }
  if (account?.locked) return <div style={root}><TitleBar /><LockScreen />{floatingToast}</div>;
  if (account?.needsLogin) return <div style={root}><TitleBar /><Onboarding start="team" role={account.role ?? 'member'} email={account.email} escape={switchProfile} />{floatingToast}</div>;
  if (converting) return <div style={root}><TitleBar /><Onboarding escape={{ label: 'Cancel', icon: 'x', onClick: () => setConverting(false) }} />{floatingToast}</div>;
  return (
    <div style={root}>
      <TitleBar />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <Sidebar active={screen} onNav={nav} running={running} />
      <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {screen === 'today' && <TodayScreen />}
        {screen === 'reports' && <ReportsScreen />}
        {screen === 'team' && <TeamScreen />}
        {screen === 'tasks' && <TasksScreen />}
        {screen === 'projects' && <ProjectsScreen />}
        {screen === 'admin' && <AdminScreen />}
        {screen === 'settings' && <SettingsScreen />}
      </main>
      </div>
      <StartTaskDialog open={prompt === 'start'} onClose={() => openPrompt(null)} resume={resumeEntry} />
      <EndTaskDialog open={prompt === 'end'} onClose={() => openPrompt(null)} />
      <GenerateReportDialog open={prompt === 'report' || prompt === 'report-preview'} regenerate={prompt === 'report'} onClose={() => openPrompt(null)} />
      <CommandPalette />
      <EntryDialogs />
      <WhatsNewDialog />
      <Tour />
      {/* The time-away question, below the check-in popup when both are up; hidden behind an open dialog. */}
      {away && prompt === null && <AwayCard prompt={away} offset={activeCheckin && activeCheckin.kind !== 'warning' ? 250 : 0} onChoose={(c) => void chooseAway(c)} />}
      {activeCheckin?.kind === 'warning'
        ? (!isElectron && <div style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 300 }}><WarningCard checkin={activeCheckin} onAnswer={(a) => void answerCheckin(activeCheckin.id, a)} /></div>)
        : <CheckinPopup checkin={activeCheckin} onAnswer={(a) => activeCheckin && void answerCheckin(activeCheckin.id, a)} />}
      {toast && (
        <div style={{ position: 'fixed', left: 'calc(var(--sidebar-w) + 24px)', bottom: 24, zIndex: 200 }}>
          <Toast tone={toast.tone ?? 'success'} onDismiss={dismissToast}>{toast.text}</Toast>
        </div>
      )}
    </div>
  );
}
