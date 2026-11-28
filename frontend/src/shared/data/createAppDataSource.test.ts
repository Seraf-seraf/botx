import {createElement} from 'react';
import {render, renderHook, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {App} from '../../app/App';
import {createDemoFixtures} from './demo-fixtures';
import type {AppDataSource} from './contracts';
import {createAppDataSource} from './createAppDataSource';
import {useAppSnapshot} from './useAppSnapshot';

const ordinaryKey = 'botx.demo.v1';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.useRealTimers();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});

describe('scenario data source', () => {
  it('preserves the receiver when invoking injected class-style source methods', async () => {
    const delegate = createAppDataSource();
    const source = new Proxy(delegate, {
      get(target, property, receiver) {
        if (property === 'payService' || property === 'cancelPayment' || property === 'checkPayment') {
          return function(this: AppDataSource, ...args: unknown[]): unknown {
            expect(this).toBe(source);
            return Reflect.apply(Reflect.get(target, property), target, args);
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const {result, unmount} = renderHook(() => useAppSnapshot(source));
    const {payService, checkPayment, cancelPayment} = result.current;
    expect(await payService('study-bot', 'class-adapter', 10_050)).toMatchObject({ok: true});
    expect(await checkPayment('class-adapter')).toMatchObject({ok: true});
    expect(await cancelPayment('study-bot')).toEqual({ok: false, reason: 'invalid'});
    unmount();
  });
  it('rejects trades while localStorage is unavailable and can recover without losing the order', async () => {
    const getter = vi.spyOn(window, 'localStorage', 'get');
    getter.mockImplementation(() => { throw new Error('storage unavailable'); });
    const source = createAppDataSource();
    const order = {id: 'storage-order', symbol: 'QST', quantity: 3, unitPrice: 24_800, feeBps: 500} as const;
    expect(await source.buy(order)).toEqual({ok: false, reason: 'storage'});
    expect(source.getSnapshot().balance).toBe(328_000);
    getter.mockRestore();
    expect(createAppDataSource().getSnapshot().balance).toBe(328_000);
    expect(await source.buy(order)).toMatchObject({ok: true, operation: {id: order.id}});
    expect(createAppDataSource().getSnapshot().balance).toBe(249_880);
  });
  it('renders an injected source and releases it on unmount', () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {configurable: true, value: vi.fn()});
    const snapshot = createDemoFixtures(Date.now());
    const source: AppDataSource = {
      saveMcpAccess: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)), revokeMcpAccess: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)), checkMcpAccess: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)),
      saveApiAccess: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)), revokeApiAccess: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)), checkApiAccess: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)),
      start: vi.fn(), stop: vi.fn(), setActive: vi.fn(), reloadMarket: vi.fn(),
      getSnapshot: () => snapshot,
      saveFeeSettings: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)), checkFeeSettings: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)),
      getListingApplications: () => snapshot.listings, approveListing: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)), rejectListing: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)),
      subscribe: vi.fn(() => vi.fn()),
      buy: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)),
      sell: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)),
      checkTrade: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)),
      claimBonus: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)),
      getPaymentRequest: vi.fn(), payService: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)),
      cancelPayment: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)), checkPayment: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)),
    };
    window.history.replaceState(null, '', '/#/');
    const view = render(createElement(App, {source}));
    expect(screen.getByRole('link', {name: /QuestBot/})).toBeVisible();
    expect(source.start).toHaveBeenCalledTimes(1);
    const unsubscribe = vi.mocked(source.subscribe).mock.results[0]?.value;
    view.unmount();
    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('does not open a trade receipt for a payment from an injected source', () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {configurable: true, value: vi.fn()});
    const initial = createDemoFixtures(Date.now());
    const snapshot = {...initial, operations: [{id: 'payment-one', kind: 'payment', symbol: 'QST', date: Date.now(), amount: 10_050} as const]};
    const source: AppDataSource = {
      saveMcpAccess: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)), revokeMcpAccess: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)), checkMcpAccess: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)),
      saveApiAccess: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)), revokeApiAccess: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)), checkApiAccess: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)),
      start: vi.fn(), stop: vi.fn(), setActive: vi.fn(), reloadMarket: vi.fn(),
      getSnapshot: () => snapshot, subscribe: vi.fn(() => vi.fn()),
      saveFeeSettings: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)), checkFeeSettings: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)),
      getListingApplications: () => snapshot.listings, approveListing: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)), rejectListing: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)),
      buy: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)),
      sell: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)),
      checkTrade: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)),
      claimBonus: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)),
      getPaymentRequest: vi.fn(), payService: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)),
      cancelPayment: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)), checkPayment: vi.fn(async () => ({ok: false, reason: 'invalid'} as const)),
    };
    window.history.replaceState(null, '', '/#/asset/QST/receipt?id=payment-one');
    const view = render(createElement(App, {source}));
    expect(screen.queryByText(/Продано|Куплено/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', {name: /QuestBot/})).toBeVisible();
    view.unmount();
  });

  it('isolates accounts and restores operation IDs in a session', async () => {
    window.localStorage.setItem(ordinaryKey, 'ordinary');
    window.localStorage.setItem('botx.demo.v2', 'ordinary-v2');
    window.history.replaceState(null, '', '/?scenario=market-paused#/');
    const first = createAppDataSource();
    const session = new URL(window.location.href).searchParams.get('session');
    expect(session).toBeTruthy();
    const quote = first.getSnapshot().quotes.find(({tradingStatus}) => tradingStatus === 'active');
    expect(quote).toBeDefined();
    if (!quote) throw new Error('active fixture missing');
    const order = {id: 'scenario-order', symbol: quote.symbol, quantity: 1, unitPrice: quote.price, feeBps: 500};
    const result = await first.buy(order);
    expect(result.ok).toBe(true);
    const restored = createAppDataSource();
    expect(await restored.buy(order)).toEqual(result);
    expect(restored.getSnapshot().balance).toBe(first.getSnapshot().balance);
    expect(window.localStorage.getItem(ordinaryKey)).toBe('ordinary');
    window.history.replaceState(null, '', '/?scenario=market-paused#/');
    const fresh = createAppDataSource();
    expect(new URL(window.location.href).searchParams.get('session')).not.toBe(session);
    expect(fresh.getSnapshot().balance).not.toBe(first.getSnapshot().balance);
    expect(window.localStorage.getItem(ordinaryKey)).toBe('ordinary');
    expect(window.localStorage.getItem('botx.demo.v2')).toBe('ordinary-v2');
  });

  it('normalizes legacy loading and completes it through the source', () => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/#/?demo=loading');
    const source = createAppDataSource();
    expect(new URL(window.location.href).searchParams.get('scenario')).toBe('market-loading');
    expect(new URL(window.location.href).searchParams.get('session')).toBeTruthy();
    expect(source.getSnapshot().marketStatus).toBe('loading');
    source.start();
    vi.runAllTimers();
    expect(source.getSnapshot().marketStatus).toBe('ready');
    source.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a paused asset visible but rejects its trade', async () => {
    window.history.replaceState(null, '', '/?scenario=market-paused#/');
    const source = createAppDataSource();
    const paused = source.getSnapshot().quotes.find(({tradingStatus}) => tradingStatus === 'paused');
    expect(paused).toBeDefined();
    if (!paused) throw new Error('paused fixture missing');
    const order = {id: 'paused-order', symbol: paused.symbol, quantity: 1, unitPrice: paused.price, feeBps: 500};
    expect(await source.buy(order)).toEqual({ok: false, reason: 'invalid'});
    expect(await source.sell(order)).toEqual({ok: false, reason: 'invalid'});
  });

  it('retries an error and cleans up the loading timer', () => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/?scenario=market-error#/');
    const source = createAppDataSource();
    source.start();
    expect(source.getSnapshot().marketStatus).toBe('error');
    source.reloadMarket();
    expect(source.getSnapshot().marketStatus).toBe('loading');
    vi.runAllTimers();
    expect(source.getSnapshot().marketStatus).toBe('ready');
    source.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
