import type {ReactElement} from 'react';
import {Navigate, Route, Routes} from 'react-router-dom';

export const tabs = [
  {path: '/', label: 'Биржа', icon: 'chart-line'},
  {path: '/portfolio', label: 'Портфель', icon: 'briefcase'},
  {path: '/balance', label: 'Баланс', icon: 'wallet'},
  {path: '/profile', label: 'Профиль', icon: 'user-circle'},
] as const;

export function AppRoutes(): ReactElement {
  return (
    <Routes>
      {tabs.map(({path, label}) => (
        <Route key={path} path={path} element={<main><h1>{label}</h1></main>} />
      ))}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
