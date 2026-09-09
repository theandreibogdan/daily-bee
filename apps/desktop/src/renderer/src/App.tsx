import { Toast } from '@dailybee/ui';
import { useEffect, type CSSProperties } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { TITLEBAR_HEIGHT, TitleBar, hasCustomTitleBar } from './components/TitleBar';
import { AdminScreen } from './screens/Admin';
import { CheckinPopup, EndTaskDialog, GenerateReportDialog, StartTaskDialog } from './screens/Prompts';
import { ReportsScreen } from './screens/Reports';
import { SettingsScreen } from './screens/Settings';
import { Sidebar } from './screens/Shell';
import { TasksScreen } from './screens/Tasks';
import { TeamScreen } from './screens/Team';
import { TodayScreen } from './screens/Today';
import { WarningCard } from './screens/WarningWindow';
import { isElectron } from './bridge';
import { useStore } from './store';

export function App() {
  const ready = useStore((s) => s.ready);
  const screen = useStore((s) => s.screen);
  const running = useStore((s) => s.session.running);
  const prompt = useStore((s) => s.prompt);
  const resumeEntry = useStore((s) => s.resumeEntry);
  const activeCheckin = useStore((s) => s.activeCheckin);
  const toast = useStore((s) => s.toast);
  const { init, nav, openPrompt, answerCheckin, dismissToast, setPalette } = useStore.getState();
  useEffect(() => { void init(); }, [init]);
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
        {screen === 'admin' && <AdminScreen />}
        {screen === 'settings' && <SettingsScreen />}
      </main>
      </div>
      <StartTaskDialog open={prompt === 'start'} onClose={() => openPrompt(null)} resume={resumeEntry} />
      <EndTaskDialog open={prompt === 'end'} onClose={() => openPrompt(null)} />
      <GenerateReportDialog open={prompt === 'report' || prompt === 'report-preview'} regenerate={prompt === 'report'} onClose={() => openPrompt(null)} />
      <CommandPalette />
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
