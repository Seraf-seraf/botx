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
  it('round-trips a complete account with the current version', () => {
    let raw: string | null = null;
    const storage = {
      getItem: vi.fn(() => raw),
      setItem: vi.fn((_key: string, value: string) => { raw = value; }),
    } satisfies AccountStorage;

    writeAccount(storage, account);
    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEY, expect.any(String));
    expect(JSON.parse(raw ?? '{}')).toMatchObject({version: 1});
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
    expect(readAccount({getItem: () => value, setItem: () => {}})).toBeUndefined();
  });
});
