import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createDemoFixtures} from './demo-fixtures';
import {DAILY_BONUS, DemoDataSource, QUOTE_INTERVAL_MS} from './demo-source';
import type {OperationResult, TradeOrder} from './contracts';
import {readAccount, writeAccount} from './storage';
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
  const source = new DemoDataSource({
    storage,
    initial: createDemoFixtures,
    now: Date.now,
    random: seededRandom(),
    schedule: (tick, ms) => {
      const timer = setInterval(tick, ms);
      return () => clearInterval(timer);
    },
  });
  source.start();
  return source;
}

const order: TradeOrder = {id: 'buy-A', symbol: 'QST', quantity: 3, unitPrice: 24_800, feeBps: 500};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 22, 14, 40));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DemoDataSource', () => {
  it('persists API scopes and revocation without changing the account history', async () => {
    const storage = memory();
    const source = makeSource(storage);
    const before = source.getSnapshot();
    const scopes = ['quotes', 'history'] as const;
    expect(await source.saveApiAccess(scopes, 'api-save')).toMatchObject({ok: true, access: {connected: true, scopes}});
    expect(await source.saveApiAccess(scopes, 'api-save')).toMatchObject({ok: true});
    expect(await source.revokeApiAccess('api-revoke')).toMatchObject({ok: true, access: {connected: false}});
    expect(await source.revokeApiAccess('api-revoke')).toMatchObject({ok: true});
    const restored = makeSource(storage).getSnapshot();
    expect(restored.integrations.api.connected).toBe(false);
    expect(restored.operations).toEqual(before.operations);
    expect(restored.balance).toBe(before.balance);
  });

  it('preserves unrelated integrations and rejects mismatched replay or storage failure', async () => {
    const storage = memory();
    const initial = createDemoFixtures(Date.now());
    writeAccount(storage, {revision: 3, balance: initial.balance, holdings: initial.holdings, operations: initial.operations,
      claimedOn: null, extras: {integrations: {mcp: {connected: true}}, future: 42}});
    const source = makeSource(storage);
    expect(await source.saveApiAccess(['quotes'], 'save-id')).toMatchObject({ok: true});
    expect(await source.saveApiAccess(['history'], 'save-id')).toEqual({ok: false, reason: 'invalid'});
    expect(await source.revokeApiAccess('save-id')).toEqual({ok: false, reason: 'invalid'});
    expect(await source.checkApiAccess('save-id')).toMatchObject({ok: true, access: {scopes: ['quotes']}});
    expect(readAccount(storage)?.extras?.integrations).toMatchObject({mcp: {connected: true}});
    expect(readAccount(storage)?.extras?.future).toBe(42);
    const failing = makeSource({getItem: () => null, setItem: () => { throw new Error('unavailable'); }});
    expect(await failing.revokeApiAccess('failure')).toEqual({ok: false, reason: 'storage'});
    expect(failing.getSnapshot().integrations.api.connected).toBe(true);
  });

  it('saves and revokes MCP access independently of API and monetary history', async () => {
    const storage = memory();
    const source = makeSource(storage);
    const before = source.getSnapshot();
    const scopes = ['market', 'history'] as const;
    expect(await source.saveMcpAccess(scopes, 12_345, 'mcp-save')).toMatchObject({ok: true, access: {connected: true, scopes, limitMinor: 12_345}});
    expect(await source.saveMcpAccess(scopes, 12_345, 'mcp-save')).toMatchObject({ok: true});
    expect(await source.saveMcpAccess(scopes, 0, 'bad-limit')).toEqual({ok: false, reason: 'invalid'});
    expect(await source.revokeMcpAccess('mcp-revoke')).toMatchObject({ok: true, access: {connected: false}});
    const restored = makeSource(storage).getSnapshot();
    expect(restored.integrations.mcp).toMatchObject({connected: false, scopes, limitMinor: 12_345});
    expect(restored.integrations.api).toEqual(before.integrations.api);
    expect(restored.balance).toBe(before.balance);
    expect(restored.operations).toEqual(before.operations);
  });

  it('validates MCP input and preserves it after failed writes and repeated requests', async () => {
    const storage = memory();
    const source = makeSource(storage);
    expect(source.getSnapshot().integrations.mcp.limitMinor).toBe(50_000);
    for (const value of [-1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(await source.saveMcpAccess(['market'], value, `invalid-${value}`)).toEqual({ok: false, reason: 'invalid'});
    }
    expect(await source.saveMcpAccess(['trade'], 1, 'first')).toMatchObject({ok: true});
    expect(await source.saveMcpAccess(['trade'], 2, 'first')).toEqual({ok: false, reason: 'invalid'});
    expect(await source.checkMcpAccess('first')).toMatchObject({ok: true, access: {limitMinor: 1}});
    const failing = makeSource({getItem: () => null, setItem: () => { throw new Error('unavailable'); }});
    expect(await failing.revokeMcpAccess('failure')).toEqual({ok: false, reason: 'storage'});
    expect(failing.getSnapshot().integrations.mcp.connected).toBe(true);
  });

  it('saves fee settings without changing history and uses them for later trades and payments', async () => {
    const storage = memory();
    const source = makeSource(storage);
    const old = await source.buy({id: 'old-trade', symbol: 'QST', quantity: 1, unitPrice: 24_800, feeBps: 500});
    expect(old.ok).toBe(true);
    const before = source.getSnapshot();
    const settings = {buyBps: 100, sellBps: 0, transferBps: 10_000, serviceBps: 100};
    expect(await source.saveFeeSettings(settings, 'fee-save-1')).toMatchObject({ok: true, settings});
    expect(source.getSnapshot().operations).toEqual(before.operations);
    expect(await source.buy({id: 'new-trade', symbol: 'QST', quantity: 1, unitPrice: 24_800, feeBps: 100})).toMatchObject({ok: true, operation: {breakdown: {feeBps: 100}}});
    expect(await source.payService('study-bot', 'new-payment', 10_100)).toMatchObject({ok: true});
    const restored = makeSource(storage).getSnapshot();
    expect(restored.fees).toEqual(settings);
    expect(restored.operations.find(({id}) => id === 'old-trade')).toEqual(before.operations.find(({id}) => id === 'old-trade'));
  });

  it('validates fee boundaries and retains other account sections', async () => {
    const storage = memory();
    const initial = createDemoFixtures(Date.now());
    writeAccount(storage, {revision: 2, balance: initial.balance, holdings: initial.holdings, operations: initial.operations,
      claimedOn: null, extras: {future: {value: 42}}});
    const source = makeSource(storage);
    const settings = {buyBps: 0, sellBps: 50, transferBps: 500, serviceBps: 10_000};
    expect(await source.saveFeeSettings({...settings, buyBps: -1}, 'invalid-1')).toEqual({ok: false, reason: 'invalid'});
    expect(await source.saveFeeSettings({...settings, buyBps: 10_001}, 'invalid-2')).toEqual({ok: false, reason: 'invalid'});
    expect(await source.saveFeeSettings({...settings, buyBps: 0.5}, 'invalid-3')).toEqual({ok: false, reason: 'invalid'});
    expect(await source.saveFeeSettings(settings, 'valid')).toMatchObject({ok: true, settings});
    expect(await source.saveFeeSettings(settings, 'valid')).toMatchObject({ok: true, settings});
    expect(readAccount(storage)?.extras?.future).toEqual({value: 42});
    expect(source.getSnapshot().operations).toEqual(initial.operations);
  });

  it('recovers a known fee error and checks an unknown outcome using its original request', async () => {
    const settings = {buyBps: 0, sellBps: 50, transferBps: 500, serviceBps: 10_000};
    const create = (storage: AccountStorage, scenario: string): DemoDataSource => new DemoDataSource({storage, scenario,
      initial: createDemoFixtures, now: Date.now, random: () => 0.5, schedule: () => () => {}});
    const known = create(memory(), 'fees-save-error');
    expect(await known.saveFeeSettings(settings, 'failed')).toEqual({ok: false, reason: 'storage'});
    expect(known.getSnapshot().fees.buyBps).toBe(500);
    expect(await known.saveFeeSettings(settings, 'retry')).toMatchObject({ok: true, settings});
    const storage = memory();
    const unknown = create(storage, 'fees-save-unknown');
    expect(await unknown.saveFeeSettings(settings, 'original')).toEqual({ok: false, reason: 'unknown'});
    const restored = create(storage, 'fees-save-unknown');
    expect(restored.getSnapshot().fees.buyBps).toBe(500);
    expect(restored.getSnapshot().feeSave).toMatchObject({requestId: 'original', status: 'unknown'});
    expect(await restored.saveFeeSettings(settings, 'another')).toEqual({ok: false, reason: 'unknown'});
    expect(await restored.checkFeeSettings('another')).toEqual({ok: false, reason: 'invalid'});
    expect(await restored.checkFeeSettings('original')).toMatchObject({ok: true, settings});
    expect(restored.getSnapshot().fees).toEqual(settings);
  });

  it('restores an unconfirmed fee save after the response is lost', async () => {
    const storage = memory();
    const settings = {buyBps: 100, sellBps: 500, transferBps: 50, serviceBps: 50};
    const source = new DemoDataSource({storage, initial: createDemoFixtures, now: Date.now, random: () => 0.5,
      schedule: () => () => {}, waitForTrade: async () => { throw new Error('response lost'); }});
    expect(await source.saveFeeSettings(settings, 'lost-response')).toEqual({ok: false, reason: 'unknown'});
    const restored = makeSource(storage);
    expect(restored.getSnapshot().feeSave).toMatchObject({status: 'unknown', requestId: 'lost-response'});
    expect(restored.getSnapshot().fees.buyBps).toBe(500);
    expect(await restored.checkFeeSettings('lost-response')).toMatchObject({ok: true, settings});
    expect(restored.getSnapshot().fees.buyBps).toBe(100);
  });
  it('publishes an approved listing once and restores it without financial changes', async () => {
    const storage = memory();
    const source = makeSource(storage);
    const before = source.getSnapshot();
    expect(before.quotes.some(({symbol}) => symbol === 'STUDY')).toBe(false);
    const result = await source.approveListing('study-bot', {price: 10_000, quantity: 10_000}, 'listing-1');
    expect(result).toMatchObject({ok: true, application: {status: 'approved'}});
    expect(await source.approveListing('study-bot', {price: 10_000, quantity: 10_000}, 'listing-1')).toEqual(result);
    const restored = makeSource(storage).getSnapshot();
    expect(restored.quotes.filter(({symbol}) => symbol === 'STUDY')).toHaveLength(1);
    expect(restored.balance).toEqual(before.balance);
    expect(restored.holdings).toEqual(before.holdings);
    expect(restored.operations).toEqual(before.operations);
  });

  it('rejects once with a nonempty reason and preserves other account data', async () => {
    const storage = memory();
    const initial = createDemoFixtures(Date.now());
    writeAccount(storage, {revision: 2, balance: initial.balance, holdings: initial.holdings, operations: initial.operations,
      claimedOn: null, extras: {future: {value: 42}, fees: initial.fees}});
    const source = makeSource(storage);
    expect(await source.rejectListing('study-bot', '  ', 'reject-1')).toEqual({ok: false, reason: 'invalid'});
    const result = await source.rejectListing('study-bot', '  Недостаточно данных  ', 'reject-1');
    expect(result).toMatchObject({ok: true, application: {status: 'rejected', reason: 'Недостаточно данных'}});
    expect(await source.rejectListing('study-bot', 'Недостаточно данных', 'reject-1')).toEqual(result);
    expect(await source.approveListing('study-bot', {price: 10_000, quantity: 10_000}, 'another')).toEqual({ok: false, reason: 'invalid'});
    const restored = makeSource(storage).getSnapshot();
    expect(restored.listings[0]).toMatchObject({status: 'rejected', reason: 'Недостаточно данных'});
    expect(restored.quotes.some(({symbol}) => symbol === 'STUDY')).toBe(false);
    expect(restored.balance).toBe(initial.balance);
    expect(restored.holdings).toEqual(initial.holdings);
    expect(restored.operations).toEqual(initial.operations);
    expect(readAccount(storage)?.extras?.future).toEqual({value: 42});
  });

  it('retains the request identity when the response is lost after approval', async () => {
    const storage = memory();
    const source = new DemoDataSource({storage, initial: createDemoFixtures, now: Date.now, random: () => 0.5,
      schedule: () => () => {}, waitForTrade: async () => { throw new Error('response lost'); }});
    expect(await source.approveListing('study-bot', {price: 10_000, quantity: 10_000}, 'original')).toEqual({ok: false, reason: 'unknown'});
    const restored = makeSource(storage);
    expect(restored.getListingApplications().find(({requestId}) => requestId === 'original')).toMatchObject({status: 'approved'});
    expect(await restored.approveListing('study-bot', {price: 10_000, quantity: 10_000}, 'another')).toEqual({ok: false, reason: 'invalid'});
    expect(restored.getSnapshot().quotes.filter(({symbol}) => symbol === 'STUDY')).toHaveLength(1);
  });
  it('charges a service once and restores the original result', async () => {
    const storage = memory();
    const source = makeSource(storage);
    expect(source.getPaymentRequest('study-bot')).toMatchObject({status: 'open', amount: 10_000});
    const result = await source.payService('study-bot', 'payment-1', 10_050);
    expect(result).toMatchObject({ok: true, request: {requestId: 'payment-1', status: 'paid', total: 10_050}});
    expect(await source.payService('study-bot', 'payment-1', 10_050)).toEqual(result);
    expect(await source.checkTrade('payment-1')).toEqual({ok: false, reason: 'invalid'});
    const restored = makeSource(storage);
    expect(restored.getSnapshot().balance).toBe(317_950);
    expect(restored.getSnapshot().operations.filter(({id}) => id === 'payment-1')).toHaveLength(1);
    expect(restored.getPaymentRequest('study-bot')).toMatchObject({status: 'paid'});
  });

  it('charges the current account and preserves other stored sections', async () => {
    const storage = memory();
    const initial = createDemoFixtures(Date.now());
    writeAccount(storage, {revision: 5, balance: 50_000, holdings: initial.holdings, operations: initial.operations,
      claimedOn: null, extras: {future: {value: 42}}});
    const source = makeSource(storage);
    expect(await source.payService('study-bot', 'current-account-payment', 10_050)).toMatchObject({ok: true});
    expect(source.getSnapshot().balance).toBe(39_950);
    expect(readAccount(storage)?.extras?.future).toEqual({value: 42});
  });

  it('cancels or expires without charging and requires the confirmed amount', async () => {
    const source = makeSource();
    expect(await source.payService('study-bot', 'payment-1', 10_000)).toEqual({ok: false, reason: 'price-changed'});
    expect(source.getSnapshot().balance).toBe(328_000);
    expect(await source.cancelPayment('study-bot')).toMatchObject({ok: true, request: {status: 'canceled'}});
    expect(source.getSnapshot().operations.some(({kind}) => kind === 'payment')).toBe(false);
    expect(await source.payService('study-bot', 'payment-1', 10_050)).toEqual({ok: false, reason: 'invalid'});
    const expired = new DemoDataSource({storage: memory(), initial: createDemoFixtures, now: Date.now,
      random: () => 0.5, schedule: () => () => {}, scenario: 'payment-expired'});
    expect(expired.getPaymentRequest('study-bot')?.status).toBe('expired');
    expect(await expired.payService('study-bot', 'payment-2', 10_050)).toEqual({ok: false, reason: 'invalid'});
    expect(expired.getSnapshot().balance).toBe(328_000);
  });

  it('checks the original unknown payment after reload without creating a second charge', async () => {
    const storage = memory();
    const create = (): DemoDataSource => new DemoDataSource({storage, initial: createDemoFixtures, now: Date.now,
      random: () => 0.5, schedule: () => () => {}, scenario: 'payment-unknown'});
    const source = create();
    expect(await source.payService('study-bot', 'payment-unknown-1', 10_050)).toEqual({ok: false, reason: 'unknown'});
    const restored = create();
    expect(restored.getSnapshot().balance).toBe(328_000);
    expect(restored.getSnapshot().operations.some(({id}) => id === 'payment-unknown-1')).toBe(false);
    expect(await restored.payService('study-bot', 'another', 10_050)).toEqual({ok: false, reason: 'unknown'});
    expect(await restored.checkPayment('another')).toEqual({ok: false, reason: 'invalid'});
    expect(await restored.checkPayment('payment-unknown-1')).toMatchObject({ok: true, request: {status: 'paid'}});
    expect(restored.getSnapshot().balance).toBe(317_950);
    expect(restored.getSnapshot().operations.filter(({id}) => id === 'payment-unknown-1')).toHaveLength(1);
  });

  it('leaves the request and balance unchanged if payment storage fails', async () => {
    const storage: AccountStorage = {getItem: () => null, setItem: () => { throw new Error('unavailable'); }};
    const source = makeSource(storage);
    expect(await source.payService('study-bot', 'payment-1', 10_050)).toEqual({ok: false, reason: 'storage'});
    expect(source.getSnapshot().balance).toBe(328_000);
    expect(source.getPaymentRequest('study-bot')?.status).toBe('open');
  });

  it('expires at the configured deadline and retains an unknown outcome if status persistence fails', async () => {
    const source = makeSource();
    const expiry = source.getPaymentRequest('study-bot')?.expiresAt;
    expect(expiry).toBeDefined();
    if (expiry === undefined) throw new Error('missing deadline');
    vi.setSystemTime(expiry - 1);
    expect(source.getPaymentRequest('study-bot')?.status).toBe('open');
    vi.setSystemTime(expiry);
    expect(source.getPaymentRequest('study-bot')?.status).toBe('expired');
    expect(await source.payService('study-bot', 'late', 10_050)).toEqual({ok: false, reason: 'invalid'});
    vi.setSystemTime(new Date(2026, 10, 22, 14, 40));
    const backing = memory();
    let fail = false;
    const storage: AccountStorage = {getItem: backing.getItem, setItem: (key, value) => {
      if (fail) throw new Error('unavailable');
      backing.setItem(key, value);
    }};
    const unknown = new DemoDataSource({storage, initial: createDemoFixtures, now: Date.now,
      random: () => 0.5, schedule: () => () => {}, scenario: 'payment-unknown'});
    await unknown.payService('study-bot', 'original', 10_050);
    fail = true;
    expect(await unknown.checkPayment('original')).toEqual({ok: false, reason: 'storage'});
    expect(unknown.getPaymentRequest('study-bot')?.status).toBe('unknown');
    expect(unknown.getSnapshot().balance).toBe(328_000);
    fail = false;
    expect(await unknown.checkPayment('original')).toMatchObject({ok: true, request: {status: 'paid'}});
    expect(unknown.getSnapshot().balance).toBe(317_950);
  });
  it('restores only the repriced scenario quote and preserves its original operation on retry', async () => {
    const storage = memory();
    const create = (scenario?: string): DemoDataSource => new DemoDataSource({storage, initial: createDemoFixtures,
      now: Date.now, random: () => 0.5, schedule: () => () => {}, ...(scenario ? {scenario} : {})});
    const source = create('buy-repriced');
    expect(await source.buy(order)).toEqual({ok: false, reason: 'price-changed'});
    const repriced = {...order, unitPrice: 26_000};
    const result = await source.buy(repriced);
    expect(result).toMatchObject({ok: true, operation: {amount: 81_900, breakdown: {unitPrice: 26_000}}});
    const restored = create('buy-repriced');
    expect(restored.getSnapshot().quotes.find(({symbol}) => symbol === 'QST')?.price).toBe(26_000);
    expect(await restored.buy(repriced)).toEqual(result);
    expect(restored.getSnapshot().balance).toBe(246_100);
    expect(restored.getSnapshot().operations.filter(({id}) => id === order.id)).toHaveLength(1);
    expect(create().getSnapshot().quotes.find(({symbol}) => symbol === 'QST')?.price).toBe(24_800);
  });

  it('persists and resolves an unknown trade only by its original ID', async () => {
    const storage = memory();
    const create = (): DemoDataSource => new DemoDataSource({storage, initial: createDemoFixtures, now: Date.now,
      random: () => 0.5, schedule: () => () => {}, scenario: 'trade-unknown'});
    const source = create();
    expect(await source.buy(order)).toEqual({ok: false, reason: 'unknown'});
    const restored = create();
    expect(restored.getSnapshot().unknownTradeId).toBe(order.id);
    expect(await restored.buy({...order, id: 'other'})).toEqual({ok: false, reason: 'unknown'});
    expect(await restored.checkTrade('other')).toEqual({ok: false, reason: 'invalid'});
    expect(await restored.checkTrade(order.id)).toMatchObject({ok: true, operation: {id: order.id, amount: 78_120}});
    expect(restored.getSnapshot().balance).toBe(249_880);
    expect(restored.getSnapshot().operations.filter(({id}) => id === order.id)).toHaveLength(1);
  });

  it('retains an unknown request if saving its checked status fails', async () => {
    const backing = memory();
    let failWrites = false;
    const storage: AccountStorage = {getItem: (key) => backing.getItem(key), setItem: (key, value) => {
      if (failWrites) throw new Error('storage unavailable');
      backing.setItem(key, value);
    }};
    const source = new DemoDataSource({storage, initial: createDemoFixtures, now: Date.now,
      random: () => 0.5, schedule: () => () => {}, scenario: 'trade-unknown'});
    expect(await source.buy(order)).toEqual({ok: false, reason: 'unknown'});
    failWrites = true;
    expect(await source.checkTrade(order.id)).toEqual({ok: false, reason: 'storage'});
    expect(source.getSnapshot()).toMatchObject({unknownTradeId: order.id, balance: 328_000, holdings: {QST: {quantity: 20}}});
    expect(source.getSnapshot().operations.some(({id}) => id === order.id)).toBe(false);
    failWrites = false;
    expect(await source.checkTrade(order.id)).toMatchObject({ok: true, operation: {id: order.id}});
    expect(source.getSnapshot()).toMatchObject({balance: 249_880, holdings: {QST: {quantity: 23}}});
    expect(source.getSnapshot().operations.filter(({id}) => id === order.id)).toHaveLength(1);
  });

  it('keeps the original receipt and request parameters after fee changes', async () => {
    const storage = memory();
    const source = makeSource(storage);
    const original = {...order, feeBps: 500};
    const result = await source.buy(original);
    const account = readAccount(storage);
    if (!account) throw new Error('Missing account');
    writeAccount(storage, {...account, revision: account.revision + 1,
      extras: {fees: {buyBps: 1_000, sellBps: 500, transferBps: 50, serviceBps: 50}}});
    source.refreshAccount();
    expect(await source.buy(original)).toEqual(result);
    expect(await source.buy({...original, id: 'new-order'})).toEqual({ok: false, reason: 'price-changed'});
    expect(source.getSnapshot().balance).toBe(249_880);
    expect(source.getSnapshot().operations.find(({id}) => id === original.id)?.breakdown).toMatchObject({fee: 3_720, total: 78_120});
  });

  it('applies the sale commission and permits zero proceeds at 100 percent', async () => {
    const storage = memory();
    const initial = createDemoFixtures(Date.now());
    const source = new DemoDataSource({storage, initial: () => ({...initial, fees: {...initial.fees, sellBps: 10_000}}),
      now: Date.now, random: () => 0.5, schedule: () => () => {}});
    expect(await source.sell({...order, id: 'zero-sale', feeBps: 10_000})).toMatchObject({ok: true, operation: {amount: 0}});
    expect(source.getSnapshot().balance).toBe(initial.balance);
    expect(makeSource(storage).getSnapshot().operations[0]).toMatchObject({id: 'zero-sale', amount: 0});
  });
  it('starts and stops resources idempotently and can restart', () => {
    const unsubscribe = vi.fn();
    const onStart = vi.fn(() => unsubscribe);
    const cancel = vi.fn();
    const schedule = vi.fn(() => cancel);
    const source = new DemoDataSource({initial: createDemoFixtures, now: Date.now, random: () => 0.5, schedule, onStart});
    source.setActive(true);
    expect(schedule).not.toHaveBeenCalled();
    source.start();
    source.start();
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(1);
    source.stop();
    source.stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    source.start();
    expect(onStart).toHaveBeenCalledTimes(2);
    expect(schedule).toHaveBeenCalledTimes(2);
    source.stop();
  });

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
    expect(buy).toMatchObject({ok: true, operation: {kind: 'buy', quantity: 3, amount: 78_120}});
    expect(source.getSnapshot().balance).toBe(249_880);
    expect(source.getSnapshot().holdings.QST?.quantity).toBe(23);

    const sell = await source.sell({...order, id: 'sell-A', quantity: 23});
    expect(sell).toMatchObject({ok: true, operation: {kind: 'sell', quantity: 23, amount: 541_880}});
    expect(source.getSnapshot().balance).toBe(791_760);
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
    expect(source.getSnapshot().balance).toBe(249_880);

    const reloaded = makeSource(storage);
    expect(await reloaded.buy(order)).toEqual(first);
    expect(reloaded.getSnapshot().operations.filter(({id}) => id === order.id)).toHaveLength(1);
    expect(await reloaded.buy({...order, quantity: 2})).toEqual({ok: false, reason: 'invalid'});
    expect(reloaded.getSnapshot().balance).toBe(249_880);
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
    expect(setItem).not.toHaveBeenCalled();
  });
});
