export type McpScope = 'market' | 'trade' | 'history';
export interface McpAccess { readonly connected: boolean; readonly scopes: readonly McpScope[]; readonly limitMinor: number }
export type McpAccessResult = {readonly ok: true; readonly access: McpAccess} |
  {readonly ok: false; readonly reason: 'invalid' | 'storage' | 'unknown'};

export type ApiScope = 'quotes' | 'history' | 'rewards' | 'payments';
export interface ApiAccess { readonly connected: boolean; readonly scopes: readonly ApiScope[] }
export type ApiAccessResult = {readonly ok: true; readonly access: ApiAccess} |
  {readonly ok: false; readonly reason: 'invalid' | 'storage' | 'unknown'};

export type Symbol = 'QST' | 'DICE' | 'MUSE' | 'NEKO' | 'STUDY';
export interface ListingInput { readonly price: number; readonly quantity: number }
export interface ListingApplication {
  readonly id: string; readonly name: string; readonly username: string;
  readonly status: 'pending' | 'revision' | 'approved' | 'rejected';
  readonly input?: ListingInput; readonly reason?: string; readonly requestId?: string;
  readonly processing?: boolean;
}
export type ListingResult = {readonly ok: true; readonly application: ListingApplication} |
  {readonly ok: false; readonly reason: 'invalid' | 'storage' | 'unknown'};
export type TradeSide = 'buy' | 'sell';
export const MAX_TRADE_QUANTITY = 999;
export const MAX_FEE_BPS = 10_000;

export interface FeeSettings {
  readonly buyBps: number;
  readonly sellBps: number;
  readonly transferBps: number;
  readonly serviceBps: number;
}

export interface FeeSave {
  readonly requestId: string;
  readonly settings: FeeSettings;
  readonly previous: FeeSettings;
  readonly status: 'unknown' | 'saved';
}
export type FeeSaveResult = {readonly ok: true; readonly settings: FeeSettings} |
  {readonly ok: false; readonly reason: 'invalid' | 'storage' | 'unknown'};

export interface TradeBreakdown {
  readonly quantity: number;
  readonly unitPrice: number;
  readonly feeBps: number;
  readonly gross: number;
  readonly fee: number;
  readonly total: number;
}

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
  readonly tradingStatus: 'active' | 'paused';
  readonly history: readonly PricePoint[];
}

export interface Holding {
  readonly quantity: number;
  readonly cost: number;
}

export interface Operation {
  readonly id: string;
  readonly kind: TradeSide | 'bonus' | 'payment';
  readonly date: number;
  readonly amount: number;
  readonly symbol?: Symbol;
  readonly quantity?: number;
  readonly breakdown?: TradeBreakdown;
  readonly recipient?: string;
}

export interface PaymentRequest {
  readonly id: string;
  readonly recipient: string;
  readonly serviceName: string;
  readonly amount: number;
  readonly expiresAt: number;
  readonly status: 'open' | 'pending' | 'paid' | 'canceled' | 'expired' | 'unknown';
  readonly requestId?: string;
  readonly total?: number;
  readonly balanceAfter?: number;
}

export type PaymentResult =
  | {readonly ok: true; readonly request: PaymentRequest}
  | {readonly ok: false; readonly reason: 'blocked'; readonly blocker: PendingFinancialOperation}
  | {readonly ok: false; readonly reason: 'invalid' | 'funds' | 'price-changed' | 'storage' | 'unknown'};

export interface PendingFinancialOperation {
  readonly kind: 'trade' | 'payment';
  readonly id: string;
}

export interface AppSnapshot {
  readonly integrations: {readonly api: ApiAccess; readonly mcp: McpAccess};
  readonly listings: readonly ListingApplication[];
  readonly quotes: readonly Quote[];
  readonly marketStatus: 'loading' | 'ready' | 'error';
  readonly balance: number;
  readonly holdings: Readonly<Partial<Record<Symbol, Holding>>>;
  readonly operations: readonly Operation[];
  readonly bonusClaimed: boolean;
  readonly fees: FeeSettings;
  readonly feeSave?: FeeSave | undefined;
  readonly unknownTradeId?: string | undefined;
  readonly unknownTrade?: Operation | undefined;
  readonly initialTradeQuantity?: number;
  readonly payments: readonly PaymentRequest[];
  readonly now: number;
}

export interface TradeOrder {
  readonly id: string;
  readonly symbol: Symbol;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly feeBps: number;
}

export type OperationResult =
  | {readonly ok: true; readonly operation: Operation}
  | {readonly ok: false; readonly reason: 'blocked'; readonly blocker: PendingFinancialOperation}
  | {readonly ok: false; readonly reason: 'invalid' | 'funds' | 'shares' | 'price-changed' | 'claimed' | 'storage' | 'unknown'};

export interface AppDataSource {
  saveMcpAccess(scopes: readonly McpScope[], limitMinor: number, requestId: string): Promise<McpAccessResult>;
  revokeMcpAccess(requestId: string): Promise<McpAccessResult>;
  checkMcpAccess(requestId: string): Promise<McpAccessResult>;
  saveApiAccess(scopes: readonly ApiScope[], requestId: string): Promise<ApiAccessResult>;
  revokeApiAccess(requestId: string): Promise<ApiAccessResult>;
  checkApiAccess(requestId: string): Promise<ApiAccessResult>;
  saveFeeSettings(settings: FeeSettings, requestId: string): Promise<FeeSaveResult>;
  checkFeeSettings(requestId: string): Promise<FeeSaveResult>;
  getListingApplications(): readonly ListingApplication[];
  approveListing(id: string, input: ListingInput, requestId: string): Promise<ListingResult>;
  rejectListing(id: string, reason: string, requestId: string): Promise<ListingResult>;
  start(): void;
  stop(): void;
  setActive(active: boolean): void;
  reloadMarket(): void;
  getSnapshot(): AppSnapshot;
  subscribe(listener: () => void): () => void;
  buy(order: TradeOrder): Promise<OperationResult>;
  sell(order: TradeOrder): Promise<OperationResult>;
  checkTrade(id: string): Promise<OperationResult>;
  claimBonus(): Promise<OperationResult>;
  getPaymentRequest(id: string): PaymentRequest | undefined;
  payService(id: string, requestId: string, expectedTotal: number): Promise<PaymentResult>;
  cancelPayment(id: string): Promise<PaymentResult>;
  checkPayment(requestId: string): Promise<PaymentResult>;
}
