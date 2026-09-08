import { Toast } from '@dailybee/ui';
import { useEffect } from 'react';
import { AdminScreen } from './screens/Admin';
import { CheckinPopup, EndTaskDialog, GenerateReportDialog, StartTaskDialog } from './screens/Prompts';
import { ReportsScreen } from './screens/Reports';
import { SettingsScreen } from './screens/Settings';
import { Sidebar } from './screens/Shell';
import { TasksScreen } from './screens/Tasks';
import { TeamScreen } from './screens/Team';
import { TodayScreen } from './screens/Today';
import { useStore } from './store';

export function App() {
  const ready = useStore((s) => s.ready);
  const screen = useStore((s) => s.screen);
  const running = useStore((s) => s.session.running);
  const prompt = useStore((s) => s.prompt);
  const resumeEntry = useStore((s) => s.resumeEntry);
  const activeCheckin = useStore((s) => s.activeCheckin);
  const toast = useStore((s) => s.toast);
  const { init, nav, openPrompt, answerCheckin, dismissToast } = useStore.getState();
  useEffect(() => { void init(); }, [init]);
  if (!ready) return <div style={{ minHeight: '100vh', background: 'var(--bg-app)' }} />;
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-app)' }}>
      <Sidebar active={screen} onNav={nav} running={running} />
      <main style={{ flex: 1, minWidth: 0 }}>
        {screen === 'today' && <TodayScreen />}
        {screen === 'reports' && <ReportsScreen />}
        {screen === 'team' && <TeamScreen />}
        {screen === 'tasks' && <TasksScreen />}
        {screen === 'admin' && <AdminScreen />}
        {screen === 'settings' && <SettingsScreen />}
      </main>
      <StartTaskDialog open={prompt === 'start'} onClose={() => openPrompt(null)} resume={resumeEntry} />
      <EndTaskDialog open={prompt === 'end'} onClose={() => openPrompt(null)} />
      <GenerateReportDialog open={prompt === 'report'} onClose={() => openPrompt(null)} />
      <CheckinPopup checkin={activeCheckin} onAnswer={(a) => activeCheckin && void answerCheckin(activeCheckin.id, a)} />
      {toast && (
        <div style={{ position: 'fixed', left: 'calc(var(--sidebar-w) + 24px)', bottom: 24, zIndex: 200 }}>
          <Toast tone={toast.tone ?? 'success'} onDismiss={dismissToast}>{toast.text}</Toast>
        </div>
      )}
    </div>
  );
}
