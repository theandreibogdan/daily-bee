import type { AwayPrompt, Checkin } from '@shared/types';
import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../bridge';
import { AwayCard } from '../components/AwayCard';
import { CheckinPopup } from './Prompts';

/** Content of the floating always-on-top window (renderer?view=checkin): a check-in, or the time-away question. */
export function CheckinWindow() {
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [away, setAway] = useState<AwayPrompt | null>(null);
  useEffect(() => {
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
    const off = api.checkins.onPrompt(setCheckin);
    const offAway = api.session.onAway(setAway);
    return () => { off(); offAway(); };
  }, []);
  if (!checkin && !away) return null;
  // The frameless window is dragged by its card; buttons stay clickable.
  return (
    <div data-checkin-window style={{ padding: 0, WebkitAppRegion: 'drag' } as CSSProperties}>
      <style>{'[data-checkin-window] button, [data-checkin-window] [role=button] { -webkit-app-region: no-drag; }'}</style>
      {checkin
        ? <CheckinPopup checkin={checkin} fixed={false} onAnswer={(a) => { void api.checkins.answer(checkin.id, a); setCheckin(null); }} />
        : away && <AwayCard prompt={away} fixed={false} onChoose={(c) => { void api.session.chooseAway(away.id, c); if (c !== 'stop') setAway(null); }} />}
    </div>
  );
}
