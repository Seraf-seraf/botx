import {useLayoutEffect, useRef} from 'react';
import type {CSSProperties, ReactElement, ReactNode} from 'react';
import {useLocation} from 'react-router-dom';
import {useTelegram, useTelegramBack} from '../telegram/useTelegram';
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
  const {state, visibleHeight} = useTelegram();
  useTelegramBack(onBack);
  const {insets, stableHeight} = state;
  const height = Math.min(stableHeight ?? Infinity, visibleHeight ?? Infinity);
  const viewportStyle = {
    '--botx-viewport': Number.isFinite(height) ? `${height}px` : undefined,
    '--botx-telegram-top': `${insets.top}px`,
    '--botx-telegram-right': `${insets.right}px`,
    '--botx-telegram-bottom': `${insets.bottom}px`,
    '--botx-telegram-left': `${insets.left}px`,
  } as CSSProperties;

  useLayoutEffect(() => {
    main.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className={styles.shell} style={viewportStyle} data-app-shell="" data-telegram-theme={state.theme}>
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
