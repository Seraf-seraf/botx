import {MAX_TRADE_QUANTITY} from './contracts';
import type {AppDataSource, AppSnapshot, Operation, OperationResult, PricePoint, Quote, TradeOrder, TradeSide} from './contracts';
import {readAccount, writeAccount} from './storage';
import type {Account, AccountStorage} from './storage';

export const QUOTE_INTERVAL_MS = 12_000;
export const DAILY_BONUS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_MS = 60 * 60 * 1000;
const ARCHIVE_BUCKET_MS = 2 * RECENT_WINDOW_MS;
const HISTORY_WINDOW_MS = 30 * DAY_MS;
const MAX_PRICE_MOVE = 0.02;
const MAX_QUOTE_PRICE = 100_000_000;
const MAX_PRICE_POINTS = 700;

interface DemoOptions {
  now: () => number;
  random: () => number;
  schedule: (tick: () => void, intervalMs: number) => () => void;
  initial: (now: number) => AppSnapshot;
  storage?: AccountStorage;
  exclusive?: (operation: () => OperationResult) => Promise<OperationResult>;
}

function localDay(at: number): string {
  const date = new Date(at);
  const digits = (part: number): string => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${digits(date.getMonth() + 1)}-${digits(date.getDate())}`;
}

function advanceHistory(previous: readonly PricePoint[], point: PricePoint): readonly PricePoint[] {
  const recentAt = point.at - RECENT_WINDOW_MS;
  const cutoff = point.at - HISTORY_WINDOW_MS;
  const history: PricePoint[] = [];
  let bucket: number | undefined;
  for (const entry of previous) {
    if (entry.at < cutoff || entry.at >= point.at) continue;
    if (entry.at >= recentAt) {
      history.push(entry);
      continue;
    }
    const nextBucket = Math.floor(entry.at / ARCHIVE_BUCKET_MS);
    if (nextBucket === bucket) {
      history[history.length - 1] = entry;
    } else {
      history.push(entry);
      bucket = nextBucket;
    }
  }
  history.push(point);
  return history.slice(-MAX_PRICE_POINTS);
}

function withAccount(quoteSnapshot: AppSnapshot, account: Account, now: number): AppSnapshot {
  return {
    ...quoteSnapshot,
    balance: account.balance,
    holdings: account.holdings,
    operations: account.operations,
    bonusClaimed: account.claimedOn === localDay(now),
  };
}

export class DemoDataSource implements AppDataSource {
  private snapshot: AppSnapshot;
  private account: Account;
  private readonly listeners = new Set<() => void>();
  private cancelTimer: (() => void) | undefined;

  constructor(private readonly options: DemoOptions) {
    const now = options.now();
    const initial = options.initial(now);
    const fallback = {
      revision: 0,
      balance: initial.balance,
      holdings: initial.holdings,
      operations: initial.operations,
      claimedOn: null,
    };
    try {
      this.account = readAccount(options.storage) ?? fallback;
    } catch {
      this.account = fallback;
    }
    this.snapshot = withAccount(initial, this.account, now);
  }

  readonly getSnapshot = (): AppSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  setActive(active: boolean): void {
    if (!active) {
      this.cancelTimer?.();
      this.cancelTimer = undefined;
    } else if (!this.cancelTimer) {
      this.refreshAccount();
      this.cancelTimer = this.options.schedule(() => this.tick(), QUOTE_INTERVAL_MS);
    }
  }

  refreshAccount(): void {
    let account: Account | undefined;
    try {
      account = readAccount(this.options.storage);
    } catch {
      // Continue displaying the last valid account without writing over it.
    }
    this.applyAccount(account);
  }

  private applyAccount(account: Account | undefined): void {
    const now = this.options.now();
    const current = this.account;
    if (account && account.revision > current.revision) this.account = account;
    if (current !== this.account || this.snapshot.bonusClaimed !== (this.account.claimedOn === localDay(now))) {
      this.publish(withAccount(this.snapshot, this.account, now));
    }
  }

  readonly buy = (order: TradeOrder): Promise<OperationResult> => this.transact(() => this.trade('buy', order));
  readonly sell = (order: TradeOrder): Promise<OperationResult> => this.transact(() => this.trade('sell', order));

  readonly claimBonus = (): Promise<OperationResult> => this.transact(() => {
    const now = this.options.now();
    const day = localDay(now);
    if (this.account.claimedOn === day) return {ok: false, reason: 'claimed'};

    const operation: Operation = {id: `bonus-${day}`, kind: 'bonus', date: now, amount: DAILY_BONUS};
    if (this.account.operations.some(({id}) => id === operation.id)) return {ok: false, reason: 'claimed'};
    return this.commit({...this.account, balance: this.account.balance + DAILY_BONUS, claimedOn: day}, operation);
  });

  private async transact(operation: () => OperationResult): Promise<OperationResult> {
    const run = (): OperationResult => {
      this.applyAccount(readAccount(this.options.storage));
      return operation();
    };
    try {
      return this.options.exclusive ? await this.options.exclusive(run) : run();
    } catch {
      return {ok: false, reason: 'storage'};
    }
  }

  private trade(side: TradeSide, order: TradeOrder): OperationResult {
    const {symbol, quantity, id, unitPrice} = order;
    if (!id || id.length > 128 || id.startsWith('bonus-') || id.startsWith('demo-') ||
      !Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_TRADE_QUANTITY ||
      !Number.isSafeInteger(unitPrice) || unitPrice < 1) {
      return {ok: false, reason: 'invalid'};
    }
    const previous = this.account.operations.find((operation) => operation.id === id);
    if (previous) {
      return previous.kind === side && previous.symbol === symbol && previous.quantity === quantity &&
        previous.amount === unitPrice * quantity
        ? {ok: true, operation: previous}
        : {ok: false, reason: 'invalid'};
    }
    const quote = this.snapshot.quotes.find((item) => item.symbol === symbol);
    if (!quote) return {ok: false, reason: 'invalid'};
    if (quote.price !== unitPrice) return {ok: false, reason: 'price-changed'};

    const {balance, holdings} = this.account;
    const held = holdings[symbol];
    const amount = quantity * quote.price;
    const next = {...holdings};
    const buying = side === 'buy';

    if (buying) {
      if (amount > balance) return {ok: false, reason: 'funds'};
      next[symbol] = {quantity: (held?.quantity ?? 0) + quantity, cost: (held?.cost ?? 0) + amount};
    } else {
      if (!held || quantity > held.quantity) return {ok: false, reason: 'shares'};
      const remaining = held.quantity - quantity;
      if (remaining > 0) next[symbol] = {quantity: remaining, cost: Math.round(held.cost * (remaining / held.quantity))};
      else delete next[symbol];
    }

    const operation: Operation = {id, kind: side, date: this.options.now(), amount, symbol, quantity};
    return this.commit({...this.account, balance: balance + (buying ? -amount : amount), holdings: next}, operation);
  }

  private commit(account: Account, operation: Operation): OperationResult {
    if (!Number.isSafeInteger(account.balance) || Object.values(account.holdings).some(({quantity, cost}) =>
      !Number.isSafeInteger(quantity) || !Number.isSafeInteger(cost))) {
      return {ok: false, reason: 'invalid'};
    }
    const next = {...account, revision: account.revision + 1, operations: [operation, ...account.operations]};
    writeAccount(this.options.storage, next);
    this.account = next;
    this.publish(withAccount(this.snapshot, next, operation.date));
    return {ok: true, operation};
  }

  private tick(): void {
    const now = this.options.now();
    const quotes = this.snapshot.quotes.map((quote) => {
      const lastAt = quote.history.at(-1)?.at ?? 0;
      if (now <= lastAt) return quote;
      const change = (this.options.random() * 2 - 1) * MAX_PRICE_MOVE;
      const price = Math.max(1, Math.min(MAX_QUOTE_PRICE, Math.round(quote.price * (1 + change))));
      const history = advanceHistory(quote.history, {at: now, price});
      const weekBefore = now - 7 * DAY_MS;
      let priorPrice = quote.priorPrice;
      for (let index = history.length - 1; index >= 0; index--) {
        const entry = history[index];
        if (entry && entry.at <= weekBefore) {
          priorPrice = entry.price;
          break;
        }
      }
      return {...quote, price, history, priorPrice} satisfies Quote;
    });
    this.publish(withAccount({...this.snapshot, quotes}, this.account, now));
  }

  private publish(snapshot: AppSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}
