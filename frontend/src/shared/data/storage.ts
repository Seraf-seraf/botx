import type {AppSnapshot, Holding, Operation, Symbol} from './contracts';

export const STORAGE_KEY = 'botx.demo.v1';
const STORAGE_VERSION = 1;
const MAX_STORAGE_LENGTH = 1_000_000;
const symbols: readonly Symbol[] = ['QST', 'DICE', 'MUSE', 'NEKO'];

export interface Account {
  readonly revision: number;
  readonly balance: number;
  readonly holdings: AppSnapshot['holdings'];
  readonly operations: AppSnapshot['operations'];
  readonly claimedOn: string | null;
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
    !whole(value.date) || !Number.isFinite(new Date(value.date).getTime()) || !whole(value.amount, 1)) {
    return false;
  }
  if (value.kind === 'bonus') return value.symbol === undefined && value.quantity === undefined;
  return (value.kind === 'buy' || value.kind === 'sell') && isSymbol(value.symbol) && whole(value.quantity, 1);
}

function parseAccount(raw: string | null): Account | undefined {
  if (!raw || raw.length > MAX_STORAGE_LENGTH) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (!object(value) || value.version !== STORAGE_VERSION || !whole(value.revision) || !whole(value.balance) ||
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

  return {revision: value.revision, balance: value.balance, holdings, operations: value.operations, claimedOn: value.claimedOn};
}

export function readAccount(storage: AccountStorage | undefined): Account | undefined {
  return storage ? parseAccount(storage.getItem(STORAGE_KEY)) : undefined;
}

export function writeAccount(storage: AccountStorage | undefined, account: Account): void {
  if (!storage) return;
  const raw = JSON.stringify({version: STORAGE_VERSION, ...account});
  if (raw.length > MAX_STORAGE_LENGTH) throw new Error('BOTX account storage is full');
  storage.setItem(STORAGE_KEY, raw);
}
