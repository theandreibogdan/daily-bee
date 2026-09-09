import '@dailybee/ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CheckinWindow } from './screens/CheckinWindow';
import { WarningWindow } from './screens/WarningWindow';
import { WidgetWindow } from './screens/WidgetWindow';

const view = new URLSearchParams(window.location.search).get('view');
const Root = view === 'checkin' ? CheckinWindow : view === 'widget' ? WidgetWindow : view === 'warning' ? WarningWindow : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode><Root /></StrictMode>,
);
