import {useLayoutEffect, useRef} from 'react';
import type {ReactElement, ReactNode} from 'react';
import {useLocation} from 'react-router-dom';
import {BottomNav} from './BottomNav';
import {Icon} from './Icon';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
  title?: string;
  onBack?: () => void;
}

export function AppShell({children, title = 'BOTX', onBack}: AppShellProps): ReactElement {
  const {pathname} = useLocation();
  const main = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    main.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        {onBack && (
          <button type="button" className={styles.back} aria-label="Назад" onClick={onBack}>
            <Icon name="arrow-left" size={20} />
          </button>
        )}
        <span>{title}</span>
      </header>
      <main ref={main} className={styles.main} id="main-content">
        {children}
      </main>
      {!onBack && <BottomNav />}
    </div>
  );
}
