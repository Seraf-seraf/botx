import type {ReactElement} from 'react';
import {HashRouter} from 'react-router-dom';
import {AppRoutes} from './routes';

export function App(): ReactElement {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
