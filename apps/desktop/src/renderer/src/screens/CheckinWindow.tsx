import type { Checkin } from '@shared/types';
import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../bridge';
import { CheckinPopup } from './Prompts';

/** Content of the floating always-on-top check-in window (renderer?view=checkin). */
export function CheckinWindow() {
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  useEffect(() => {
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
    const off = api.checkins.onPrompt(setCheckin);
    return off;
  }, []);
  if (!checkin) return null;
  // The frameless window is dragged by its card; buttons stay clickable.
  return (
    <div data-checkin-window style={{ padding: 0, WebkitAppRegion: 'drag' } as CSSProperties}>
      <style>{'[data-checkin-window] button, [data-checkin-window] [role=button] { -webkit-app-region: no-drag; }'}</style>
      <CheckinPopup checkin={checkin} fixed={false} onAnswer={(a) => { void api.checkins.answer(checkin.id, a); setCheckin(null); }} />
    </div>
  );
}
