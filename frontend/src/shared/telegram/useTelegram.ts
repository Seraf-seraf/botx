import {createContext, useContext, useEffect, useEffectEvent} from 'react';
import {bindTelegramBack, readTelegramSnapshot} from './bridge';
import type {TelegramApp, TelegramSnapshot} from './bridge';

export interface TelegramContextValue {
  readonly app: TelegramApp | null;
  readonly state: TelegramSnapshot;
  readonly visibleHeight: number | undefined;
}

export const TelegramContext = createContext<TelegramContextValue>({
  app: null,
  state: readTelegramSnapshot(null, true),
  visibleHeight: undefined,
});

export function useTelegram(): TelegramContextValue {
  return useContext(TelegramContext);
}

export function useTelegramBack(onBack: (() => void) | undefined): void {
  const {app} = useTelegram();
  const hasBackAction = onBack !== undefined;
  const back = useEffectEvent(() => onBack?.());
  useEffect(() => {
    if (hasBackAction) return bindTelegramBack(app, () => back());
    return undefined;
  }, [app, hasBackAction]);
}
