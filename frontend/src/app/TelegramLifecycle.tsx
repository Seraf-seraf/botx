import {useEffect, useState} from 'react';
import type {ReactElement, ReactNode} from 'react';
import {getTelegramApp, readTelegramSnapshot, setTelegramColors, startTelegram, subscribeTelegram} from '../shared/telegram/bridge';
import {TelegramContext} from '../shared/telegram/useTelegram';
import type {TelegramContextValue} from '../shared/telegram/useTelegram';

function readContext(): TelegramContextValue {
  const app = getTelegramApp(window);
  const viewport = window.visualViewport;
  return {
    app,
    state: readTelegramSnapshot(app, !document.hidden),
    visibleHeight: viewport?.height && viewport.scale === 1 ? viewport.height : undefined,
  };
}

export function TelegramLifecycle({children}: {children: ReactNode}): ReactElement {
  const [context, setContext] = useState(readContext);
  const {app} = context;

  useEffect(() => {
    const refresh = (): void => setContext(readContext());
    const viewport = window.visualViewport;
    const applyColors = (): void => {
      const color = getComputedStyle(document.documentElement).getPropertyValue('--botx-bg').trim();
      if (color) setTelegramColors(app, color);
    };
    const unsubscribe = subscribeTelegram(app, (event) => {
      refresh();
      if (event === 'themeChanged') applyColors();
    });

    document.addEventListener('visibilitychange', refresh);
    viewport?.addEventListener('resize', refresh);
    applyColors();
    startTelegram(app);
    refresh();

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', refresh);
      viewport?.removeEventListener('resize', refresh);
    };
  }, [app]);

  return <TelegramContext.Provider value={context}>{children}</TelegramContext.Provider>;
}
