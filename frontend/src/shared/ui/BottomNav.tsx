import {memo} from 'react';
import type {ReactElement} from 'react';
import {NavLink} from 'react-router-dom';
import {Icon} from './Icon';
import styles from './AppShell.module.css';

export const tabs = [
  {path: '/', label: 'Биржа', icon: 'chart-line'},
  {path: '/portfolio', label: 'Портфель', icon: 'briefcase'},
  {path: '/balance', label: 'Баланс', icon: 'wallet'},
  {path: '/profile', label: 'Профиль', icon: 'user-circle'},
] as const;

export const BottomNav = memo(function BottomNav(): ReactElement {
  return (
    <nav className={styles.navigation} aria-label="Разделы BOTX">
      {tabs.map(({path, label, icon}) => (
        <NavLink key={path} to={path} end className={() => styles.navLink}>
          <Icon name={icon} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
});
