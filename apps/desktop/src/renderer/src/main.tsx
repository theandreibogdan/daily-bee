import '@dailybee/ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CheckinWindow } from './screens/CheckinWindow';
import { WidgetWindow } from './screens/WidgetWindow';

const view = new URLSearchParams(window.location.search).get('view');

createRoot(document.getElementById('root')!).render(
  <StrictMode>{view === 'checkin' ? <CheckinWindow /> : view === 'widget' ? <WidgetWindow /> : <App />}</StrictMode>,
);
