import {createDemoFixtures} from './demo-fixtures';
import {DemoDataSource} from './demo-source';
import {readScenario} from './demo-scenarios';
import {STORAGE_KEY} from './storage';
import type {AccountStorage} from './storage';
import type {AppDataSource, AppSnapshot, OperationResult} from './contracts';

const SCENARIO_TIME_MS = new Date(2026, 10, 22, 14, 40).getTime();
const TRADE_RESPONSE_DELAY_MS = 350;

export function createAppDataSource(): AppDataSource {
  const url = new URL(window.location.href);
  const scenario = readScenario(url);
  let storage: AccountStorage | undefined;
  try {
    if (scenario) {
      const session = url.searchParams.get('session') || window.crypto.randomUUID();
      url.searchParams.set('scenario', scenario);
      url.searchParams.set('session', session);
      window.history.replaceState(window.history.state, '', url);
      const key = `botx.scenario.${session}`;
      storage = {getItem: (storageKey) => storageKey === STORAGE_KEY ? window.sessionStorage.getItem(key) : null,
        setItem: (_key, value) => window.sessionStorage.setItem(key, value)};
    } else storage = {getItem: (key) => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value)};
  } catch {
    storage = undefined;
  }
  const initial = (now: number): AppSnapshot => {
    const snapshot = createDemoFixtures(now);
    return {
      ...snapshot,
      ...(scenario === 'buy-insufficient' ? {initialTradeQuantity: 14} : {}),
      ...(scenario === 'portfolio-empty' ? {holdings: {}} : {}),
      quotes: scenario === 'market-empty' ? [] : snapshot.quotes.map((quote, index) => ({
        ...quote,
        tradingStatus: (scenario === 'market-paused' || scenario === 'trade-paused') && index === 0 ? 'paused' : 'active',
      })),
    };
  };
  return new DemoDataSource({
    initial,
    ...(scenario ? {scenario} : {}),
    waitForTrade: () => new Promise((resolve) => { window.setTimeout(resolve, TRADE_RESPONSE_DELAY_MS); }),
    now: scenario ? () => SCENARIO_TIME_MS : Date.now,
    random: scenario ? () => 0.5 : Math.random,
    schedule: (tick, intervalMs) => {
      const timer = window.setInterval(tick, intervalMs);
      return () => window.clearInterval(timer);
    },
    scheduleOnce: (tick, delayMs) => {
      const timer = window.setTimeout(tick, delayMs);
      return () => window.clearTimeout(timer);
    },
    marketStatus: scenario === 'market-loading' ? 'loading' : scenario === 'market-error' ? 'error' : 'ready',
    ...(storage ? {storage} : {}),
    ...(!scenario && window.navigator.locks ? {
      exclusive: (run: () => OperationResult): Promise<OperationResult> => window.navigator.locks.request(STORAGE_KEY, run),
    } : {}),
    ...(!scenario ? {onStart: (refresh: () => void) => {
      const listener = (event: StorageEvent): void => {
        if (event.key === STORAGE_KEY || event.key === null) refresh();
      };
      window.addEventListener('storage', listener);
      return () => window.removeEventListener('storage', listener);
    }} : {}),
  });
}
