import {describe, expect, it, vi} from 'vitest';
import {readAccount, STORAGE_KEY, writeAccount} from './storage';
import type {Account, AccountStorage} from './storage';

const account: Account = {
  revision: 2,
  balance: 253_600,
  holdings: {QST: {quantity: 3, cost: 74_400}},
  operations: [{id: 'purchase-one', kind: 'buy', symbol: 'QST', quantity: 3, date: 1_795_340_000_000, amount: 74_400}],
  claimedOn: null,
};

describe('versioned demo storage', () => {
  it('round-trips integrations independently and reads accounts without that section', () => {
    let raw: string | null = null;
    const storage: AccountStorage = {getItem: () => raw, setItem: (_key, value) => { raw = value; }};
    writeAccount(storage, account);
    expect(readAccount(storage)).toEqual(account);
    const saved: Account = {...account, extras: {payments: {status: 'paid'}, integrations: {api: {connected: false, scopes: ['quotes']}, mcp: {connected: true}}}};
    writeAccount(storage, saved);
    expect(readAccount(storage)).toEqual(saved);
  });
  it('retains Study holdings and listing alongside existing account sections', () => {
    let raw: string | null = null;
    const storage: AccountStorage = {getItem: () => raw, setItem: (_key, value) => { raw = value; }};
    const saved: Account = {...account, holdings: {...account.holdings, STUDY: {quantity: 2, cost: 20_000}},
      extras: {listings: {id: 'study-bot', status: 'approved', input: {price: 10_000, quantity: 10_000}, requestId: 'one'}, future: {value: 1}}};
    writeAccount(storage, saved);
    expect(readAccount(storage)).toEqual(saved);
  });
  it('reads payment history and preserves the payments section alongside older operations', () => {
    const payment = {id: 'payment-one', kind: 'payment', date: 1_795_340_000_000, amount: 10_050};
    const payments = {requests: [{id: 'request-one', status: 'paid'}]};
    const raw = JSON.stringify({version: 2, ...account, operations: [...account.operations, payment], extras: {payments, future: {value: 1}}});
    const storage: AccountStorage = {getItem: (key) => key === STORAGE_KEY ? raw : null, setItem: () => {}};
    expect(readAccount(storage)).toMatchObject({operations: [...account.operations, payment], extras: {payments, future: {value: 1}}});
  });
  it('migrates a legacy account without discarding history and retains unknown extras', () => {
    const entries = new Map<string, string>([['botx.demo.v1', JSON.stringify({version: 1, ...account})]]);
    const storage: AccountStorage = {getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); }};
    expect(readAccount(storage)).toEqual(account);
    writeAccount(storage, {...account, extras: {future: {value: 1}, fees: 'damaged'} as unknown as NonNullable<Account['extras']>});
    expect(readAccount(storage)?.extras).toEqual({future: {value: 1}, fees: 'damaged'});
    expect(entries.get('botx.demo.v1')).toBeTruthy();
    entries.set('botx.demo.v1', JSON.stringify({version: 1, ...account, balance: 1}));
    expect(readAccount(storage)?.balance).toBe(account.balance);
    entries.set(STORAGE_KEY, '{broken');
    expect(() => readAccount(storage)).toThrow();
  });
  it('round-trips a complete account with the current version', () => {
    let raw: string | null = null;
    const storage = {
      getItem: vi.fn(() => raw),
      setItem: vi.fn((_key: string, value: string) => { raw = value; }),
    } satisfies AccountStorage;

    writeAccount(storage, account);
    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEY, expect.any(String));
    expect(JSON.parse(raw ?? '{}')).toMatchObject({version: 2});
    expect(readAccount(storage)).toEqual(account);
  });

  it.each([
    null, '{truncated', '[]',
    JSON.stringify({version: 7, ...account}),
    JSON.stringify({version: 1, ...account, balance: -1}),
    JSON.stringify({version: 1, ...account, holdings: {ABCD: {quantity: 1, cost: 0}}}),
    JSON.stringify({version: 1, ...account, operations: [...account.operations, ...account.operations]}),
    JSON.stringify({version: 1, ...account, claimedOn: 'bad date'}),
  ])('ignores missing or invalid accounts (%s)', (value) => {
    const storage = {getItem: (key: string) => key === STORAGE_KEY ? null : value, setItem: () => {}};
    expect(readAccount(storage)).toBeUndefined();
  });
});
