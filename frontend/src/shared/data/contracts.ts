export type Symbol = 'QST' | 'DICE' | 'MUSE' | 'NEKO';
export type TradeSide = 'buy' | 'sell';

// Monetary values are integer hundredths of a BC.
export interface PricePoint {
  readonly at: number;
  readonly price: number;
}

export interface Quote {
  readonly symbol: Symbol;
  readonly name: string;
  readonly icon: 'robot' | 'dice-5' | 'brain' | 'cat';
  readonly price: number;
  readonly priorPrice: number;
  readonly isNew: boolean;
  readonly history: readonly PricePoint[];
}

export interface Holding {
  readonly quantity: number;
  readonly cost: number;
}

export interface Operation {
  readonly id: string;
  readonly kind: TradeSide | 'bonus';
  readonly date: number;
  readonly amount: number;
  readonly symbol?: Symbol;
  readonly quantity?: number;
}

export interface AppSnapshot {
  readonly quotes: readonly Quote[];
  readonly balance: number;
  readonly holdings: Readonly<Partial<Record<Symbol, Holding>>>;
  readonly operations: readonly Operation[];
  readonly bonusClaimed: boolean;
}

export interface TradeOrder {
  readonly id: string;
  readonly symbol: Symbol;
  readonly quantity: number;
  readonly unitPrice: number;
}

export type OperationResult =
  | {readonly ok: true; readonly operation: Operation}
  | {readonly ok: false; readonly reason: 'invalid' | 'funds' | 'shares' | 'price-changed' | 'claimed' | 'storage'};

export interface AppDataSource {
  getSnapshot(): AppSnapshot;
  subscribe(listener: () => void): () => void;
  buy(order: TradeOrder): OperationResult;
  sell(order: TradeOrder): OperationResult;
  claimBonus(): OperationResult;
}
