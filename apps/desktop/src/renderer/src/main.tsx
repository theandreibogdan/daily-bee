import '@dailybee/ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CheckinWindow } from './screens/CheckinWindow';

const view = new URLSearchParams(window.location.search).get('view');

createRoot(document.getElementById('root')!).render(
  <StrictMode>{view === 'checkin' ? <CheckinWindow /> : <App />}</StrictMode>,
);
