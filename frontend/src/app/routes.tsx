import type {ReactElement} from 'react';
import {Navigate, Route, Routes} from 'react-router-dom';
import {AppShell} from '../shared/ui/AppShell';
import {tabs} from '../shared/ui/BottomNav';

export function AppRoutes(): ReactElement {
  return (
    <AppShell>
      <Routes>
        {tabs.map(({path, label}) => (
          <Route key={path} path={path} element={<h1>{label}</h1>} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
