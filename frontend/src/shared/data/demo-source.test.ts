import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createDemoFixtures} from './demo-fixtures';
import {DAILY_BONUS, DemoDataSource, QUOTE_INTERVAL_MS} from './demo-source';
import type {OperationResult, TradeOrder} from './contracts';
import type {AccountStorage} from './storage';

function seededRandom(): () => number {
  let seed = 731;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function memory(): AccountStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

function makeSource(storage: AccountStorage = memory()): DemoDataSource {
  return new DemoDataSource({
    storage,
    initial: createDemoFixtures,
    now: Date.now,
    random: seededRandom(),
    schedule: (tick, ms) => {
      const timer = setInterval(tick, ms);
      return () => clearInterval(timer);
    },
  });
}

const order: TradeOrder = {id: 'buy-A', symbol: 'QST', quantity: 3, unitPrice: 24_800};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 22, 14, 40));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DemoDataSource', () => {
  it('updates all readers of a quote after exactly 12 seconds', () => {
    const source = makeSource();
    const a = vi.fn(source.getSnapshot);
    const b = vi.fn(source.getSnapshot);
    const stopA = source.subscribe(a);
    const stopB = source.subscribe(b);
    const original = source.getSnapshot();
    source.setActive(true);

    vi.advanceTimersByTime(QUOTE_INTERVAL_MS - 1);
    expect(source.getSnapshot()).toBe(original);
    vi.advanceTimersByTime(1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a.mock.results[0]?.value).toBe(b.mock.results[0]?.value);
    expect(source.getSnapshot().quotes.map(({price}) => price)).not.toEqual(original.quotes.map(({price}) => price));
    expect(source.getSnapshot().quotes.every(({price, history}) => history.at(-1)?.price === price)).toBe(true);
    stopA();
    stopB();
    source.setActive(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps positive, bounded price histories during continuous ticks', () => {
    const source = makeSource();
    source.setActive(true);
    vi.advanceTimersByTime(400 * QUOTE_INTERVAL_MS);
    for (const quote of source.getSnapshot().quotes) {
      expect(quote.price).toBeGreaterThan(0);
      expect(quote.history.length).toBeLessThanOrEqual(700);
      expect(quote.history.every(({price}) => price > 0)).toBe(true);
      expect(quote.history.at(-1)?.at).toBe(Date.now());
      expect(quote.history[0]?.at).toBeLessThan(Date.now() - 28 * 24 * 3600 * 1000);
    }
  });

  it('does not catch up after backgrounding or leak timers through 50 activation cycles', () => {
    const source = makeSource();
    const listener = vi.fn();
    source.subscribe(listener);
    for (let index = 0; index < 50; index++) {
      source.setActive(true);
      source.setActive(true);
      expect(vi.getTimerCount()).toBe(1);
      source.setActive(false);
      expect(vi.getTimerCount()).toBe(0);
    }
    vi.advanceTimersByTime(50 * QUOTE_INTERVAL_MS);
    expect(listener).not.toHaveBeenCalled();
    source.setActive(true);
    vi.advanceTimersByTime(QUOTE_INTERVAL_MS);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('buys, sells, keeps balances and holdings in sync and restores them after reload', async () => {
    const storage = memory();
    const source = makeSource(storage);
    const buy = await source.buy(order);
    expect(buy).toMatchObject({ok: true, operation: {kind: 'buy', quantity: 3, amount: 74_400}});
    expect(source.getSnapshot().balance).toBe(253_600);
    expect(source.getSnapshot().holdings.QST?.quantity).toBe(23);

    const sell = await source.sell({...order, id: 'sell-A', quantity: 23});
    expect(sell).toMatchObject({ok: true, operation: {kind: 'sell', quantity: 23, amount: 570_400}});
    expect(source.getSnapshot().balance).toBe(824_000);
    expect(source.getSnapshot().holdings.QST).toBeUndefined();
    const reloaded = makeSource(storage).getSnapshot();
    expect(reloaded.balance).toBe(source.getSnapshot().balance);
    expect(reloaded.holdings).toEqual(source.getSnapshot().holdings);
    expect(reloaded.operations).toEqual(source.getSnapshot().operations);
  });

  it('does not reapply duplicated orders, also after reload', async () => {
    const storage = memory();
    const source = makeSource(storage);
    const [first, second] = await Promise.all([source.buy(order), source.buy(order)]);
    expect(second).toEqual(first);
    expect(source.getSnapshot().balance).toBe(253_600);

    const reloaded = makeSource(storage);
    expect(await reloaded.buy(order)).toEqual(first);
    expect(reloaded.getSnapshot().operations.filter(({id}) => id === order.id)).toHaveLength(1);
    expect(await reloaded.buy({...order, quantity: 2})).toEqual({ok: false, reason: 'invalid'});
    expect(reloaded.getSnapshot().balance).toBe(253_600);
  });

  it('rejects overspending, overselling, invalid quantities and a stale displayed price', async () => {
    const source = makeSource();
    const initial = source.getSnapshot();
    const cases: readonly [Promise<OperationResult>, string][] = [
      [source.buy({...order, quantity: 14}), 'funds'],
      [source.sell({...order, quantity: 21}), 'shares'],
      [source.buy({...order, quantity: 0}), 'invalid'],
      [source.buy({...order, quantity: 0.5}), 'invalid'],
      [source.buy({...order, unitPrice: 24_799}), 'price-changed'],
    ];
    for (const [result, reason] of cases) expect(await result).toEqual({ok: false, reason});
    expect(source.getSnapshot()).toBe(initial);
  });

  it('renews the daily bonus on the next local calendar day', async () => {
    const storage = memory();
    const source = makeSource(storage);
    expect(await source.claimBonus()).toMatchObject({ok: true, operation: {amount: DAILY_BONUS}});
    expect(source.getSnapshot()).toMatchObject({bonusClaimed: true, balance: 338_000});
    const reloaded = makeSource(storage);
    expect(await reloaded.claimBonus()).toEqual({ok: false, reason: 'claimed'});
    vi.setSystemTime(new Date(2026, 10, 23, 0, 0));
    reloaded.setActive(true);
    expect(reloaded.getSnapshot().bonusClaimed).toBe(false);
    expect(await reloaded.claimBonus()).toMatchObject({ok: true});
    expect(reloaded.getSnapshot()).toMatchObject({bonusClaimed: true, balance: 348_000});
  });

  it('recovers from corrupt storage and leaves the previous balance intact if writing fails', async () => {
    const getItem = vi.fn(() => '{corrupt');
    const setItem = vi.fn(() => { throw new Error('quota'); });
    const source = makeSource({getItem, setItem});
    const initial = source.getSnapshot();
    expect(initial.balance).toBe(328_000);
    expect(await source.buy(order)).toEqual({ok: false, reason: 'storage'});
    expect(source.getSnapshot()).toBe(initial);
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});
