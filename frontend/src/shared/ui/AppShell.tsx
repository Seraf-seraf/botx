import {useLayoutEffect, useRef} from 'react';
import type {CSSProperties, ReactElement, ReactNode} from 'react';
import {useLocation, useNavigationType} from 'react-router-dom';
import {useTelegram, useTelegramBack} from '../telegram/useTelegram';
import {BottomNav, tabs} from './BottomNav';
import {Icon} from './Icon';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
  title?: string;
  onBack?: () => void;
  backInDialog?: boolean;
  pausedAsset?: boolean;
  brand?: string;
  compactHeader?: boolean;
}

export function AppShell({children, title = 'BOTX', onBack, backInDialog = false, pausedAsset = false, brand = 'BOTX', compactHeader = false}: AppShellProps): ReactElement {
  const {pathname} = useLocation();
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);
  const navigationType = useNavigationType();
  const {state, visibleHeight} = useTelegram();
  useTelegramBack(backInDialog ? undefined : onBack);
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
    const element = main.current;
    if (!element) return;
    const previous = previousPath.current;
    previousPath.current = pathname;
    if (previous === pathname) return;
    element.scrollTo(0, 0);
    const screen = (path: string): string => path.replace(/\/(buy|sell)$/, '');
    if (screen(previous) === screen(pathname)) return;
    const tabPaths: readonly string[] = tabs.map(({path}) => path);
    const back = navigationType === 'POP' ||
      navigationType === 'REPLACE' && (previous.startsWith('/asset/') && tabPaths.includes(pathname) ||
        previous.startsWith('/payments/') && pathname === '/balance' ||
        (previous.startsWith('/admin/listings/') || previous === '/admin/fees') && pathname === '/admin/listings');
    const transition = tabPaths.includes(previous) && tabPaths.includes(pathname)
      ? 'tab' : back ? 'back' : 'forward';
    delete element.dataset.transition;
    void element.offsetWidth;
    element.dataset.transition = transition;
  }, [pathname, navigationType]);

  return (
    <div className={styles.shell} style={viewportStyle} data-app-shell="" data-telegram-theme={state.theme}>
      <header className={`${styles.header} ${pausedAsset ? styles.pausedHeader : ''} ${compactHeader ? styles.compactHeader : ''}`} aria-hidden={backInDialog || undefined}>
        {onBack && !backInDialog && (
          <button type="button" className={styles.back} aria-label="Назад" onClick={onBack}>
            <Icon name="arrow-left" size={20} />
          </button>
        )}
        <span>{title}</span>
        {pausedAsset && <span className={styles.brand}>{brand}</span>}
      </header>
      <main ref={main} className={styles.main} id="main-content">
        {children}
      </main>
      {!onBack && <BottomNav />}
    </div>
  );
}
