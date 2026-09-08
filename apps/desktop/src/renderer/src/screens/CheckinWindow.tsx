import type { Checkin } from '@shared/types';
import { useEffect, useState } from 'react';
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
  return <div style={{ padding: 0 }}><CheckinPopup checkin={checkin} fixed={false} onAnswer={(a) => { void api.checkins.answer(checkin.id, a); setCheckin(null); }} /></div>;
}
