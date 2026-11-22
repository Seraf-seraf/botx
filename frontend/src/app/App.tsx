import type {ReactElement} from 'react';
import {HashRouter} from 'react-router-dom';
import {AppRoutes} from './routes';
import {TelegramLifecycle} from './TelegramLifecycle';

export function App(): ReactElement {
  return (
    <TelegramLifecycle>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </TelegramLifecycle>
  );
}
