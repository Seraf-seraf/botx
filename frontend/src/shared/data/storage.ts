import {MAX_FEE_BPS} from './contracts';
import type {AppSnapshot, FeeSettings, Holding, Operation, Symbol} from './contracts';

export const STORAGE_KEY = 'botx.demo.v2';
const LEGACY_STORAGE_KEY = 'botx.demo.v1';
const STORAGE_VERSION = 2;
const MAX_STORAGE_LENGTH = 1_000_000;
const symbols: readonly Symbol[] = ['QST', 'DICE', 'MUSE', 'NEKO', 'STUDY'];

export interface Account {
  readonly revision: number;
  readonly balance: number;
  readonly holdings: AppSnapshot['holdings'];
  readonly operations: AppSnapshot['operations'];
  readonly claimedOn: string | null;
  readonly extras?: Readonly<Record<string, unknown>> & {readonly fees?: FeeSettings};
}

export type AccountStorage = Pick<Storage, 'getItem' | 'setItem'>;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function whole(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function isHolding(value: unknown): value is Holding {
  return object(value) && whole(value.quantity, 1) && whole(value.cost);
}

function isSymbol(value: unknown): value is Symbol {
  return symbols.some((symbol) => symbol === value);
}

function isOperation(value: unknown): value is Operation {
  if (!object(value) || typeof value.id !== 'string' || !value.id || value.id.length > 128 ||
    !whole(value.date) || !Number.isFinite(new Date(value.date).getTime()) || !whole(value.amount)) {
    return false;
  }
  if (value.kind === 'bonus') return whole(value.amount, 1) && value.symbol === undefined && value.quantity === undefined;
  if (value.kind === 'payment') return whole(value.amount, 1) && value.symbol === undefined && value.quantity === undefined && value.breakdown === undefined;
  if (value.breakdown !== undefined) {
    const b = value.breakdown;
    if (!object(b) || !whole(b.quantity, 1) || !whole(b.unitPrice, 1) || !whole(b.feeBps) || b.feeBps > MAX_FEE_BPS ||
      !whole(b.gross) || !whole(b.fee) || !whole(b.total) || b.quantity !== value.quantity || b.total !== value.amount ||
      b.gross !== b.quantity * b.unitPrice || b.fee !== Math.round(b.gross * b.feeBps / MAX_FEE_BPS) ||
      b.total !== (value.kind === 'buy' ? b.gross + b.fee : b.gross - b.fee)) return false;
  } else if (!whole(value.amount, 1)) return false;
  return (value.kind === 'buy' || value.kind === 'sell') && isSymbol(value.symbol) && whole(value.quantity, 1);
}

function parseAccount(raw: string | null, version: number): Account | undefined {
  if (!raw || raw.length > MAX_STORAGE_LENGTH) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (!object(value) || value.version !== version || !whole(value.revision) || !whole(value.balance) ||
    !object(value.holdings) || !Array.isArray(value.operations) ||
    !value.operations.every(isOperation) ||
    new Set(value.operations.map(({id}) => id)).size !== value.operations.length ||
    !(value.claimedOn === null || typeof value.claimedOn === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value.claimedOn) && Number.isFinite(Date.parse(value.claimedOn)))) {
    return undefined;
  }

  const holdings: Partial<Record<Symbol, Holding>> = {};
  for (const [symbol, holding] of Object.entries(value.holdings)) {
    if (!isSymbol(symbol) || !isHolding(holding)) return undefined;
    holdings[symbol] = {quantity: holding.quantity, cost: holding.cost};
  }

  return {revision: value.revision, balance: value.balance, holdings, operations: value.operations, claimedOn: value.claimedOn,
    ...(object(value.extras) ? {extras: value.extras} : {})};
}

export function readAccount(storage: AccountStorage | undefined): Account | undefined {
  if (!storage) return undefined;
  const current = storage.getItem(STORAGE_KEY);
  if (current !== null) {
    const account = parseAccount(current, STORAGE_VERSION);
    if (!account) throw new Error('Invalid current account');
    return account;
  }
  return parseAccount(storage.getItem(LEGACY_STORAGE_KEY), 1);
}

export function writeAccount(storage: AccountStorage | undefined, account: Account): void {
  if (!storage) throw new Error('BOTX account storage is unavailable');
  const raw = JSON.stringify({version: STORAGE_VERSION, ...account});
  if (raw.length > MAX_STORAGE_LENGTH) throw new Error('BOTX account storage is full');
  storage.setItem(STORAGE_KEY, raw);
}
