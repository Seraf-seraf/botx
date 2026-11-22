import {useEffect, useState, useSyncExternalStore} from 'react';
import {useTelegram} from '../telegram/useTelegram';
import type {AppSnapshot, OperationResult, TradeOrder, TradeSide} from './contracts';
import {DemoDataSource} from './demo-source';
import {STORAGE_KEY} from './storage';
import type {AccountStorage} from './storage';

export interface DemoData {
  readonly snapshot: AppSnapshot;
  trade(side: TradeSide, order: TradeOrder): Promise<OperationResult>;
  claimBonus(): Promise<OperationResult>;
}

function getStorage(): AccountStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function useAppSnapshot(initial: (now: number) => AppSnapshot): DemoData {
  const {state: {active}} = useTelegram();
  const [source] = useState(() => {
    const storage = getStorage();
    return new DemoDataSource({
      initial,
      now: Date.now,
      random: Math.random,
      schedule: (tick, intervalMs) => {
        const timer = window.setInterval(tick, intervalMs);
        return () => window.clearInterval(timer);
      },
      ...(storage ? {storage} : {}),
      ...(window.navigator.locks ? {
        exclusive: (run): Promise<OperationResult> => window.navigator.locks.request(STORAGE_KEY, run),
      } : {}),
    });
  });

  useEffect(() => {
    source.setActive(active);
    return () => source.setActive(false);
  }, [active, source]);

  useEffect(() => {
    const refresh = (event: StorageEvent): void => {
      if (event.key === STORAGE_KEY || event.key === null) source.refreshAccount();
    };
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, [source]);

  return {
    snapshot: useSyncExternalStore(source.subscribe, source.getSnapshot),
    trade: (side, order) => side === 'buy' ? source.buy(order) : source.sell(order),
    claimBonus: source.claimBonus,
  };
}
