import {MAX_FEE_BPS, MAX_TRADE_QUANTITY} from './contracts';
import type {McpAccess, McpAccessResult, McpScope, ApiAccess, ApiAccessResult, ApiScope, AppDataSource, AppSnapshot, FeeSave, FeeSaveResult, FeeSettings, ListingApplication, ListingInput, ListingResult, Operation, OperationResult, PaymentRequest, PaymentResult, PricePoint, Quote, TradeOrder, TradeSide} from './contracts';
import {readAccount, writeAccount} from './storage';
import {tradePreview} from './trade-preview';
import type {Account, AccountStorage} from './storage';

export const QUOTE_INTERVAL_MS = 12_000;
export const DAILY_BONUS = 10_000;
const MARKET_LOADING_MS = 850;
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_MS = 60 * 60 * 1000;
const ARCHIVE_BUCKET_MS = 2 * RECENT_WINDOW_MS;
const HISTORY_WINDOW_MS = 30 * DAY_MS;
const MAX_PRICE_MOVE = 0.02;
const MAX_QUOTE_PRICE = 100_000_000;
const MAX_PRICE_POINTS = 700;
const REPRICED_SCENARIO_INITIAL_PRICE_CENTS = 24_800;
const REPRICED_SCENARIO_PRICE_CENTS = 26_000;
const PAYMENT_ID = 'study-bot';
const PAYMENT_AMOUNT_CENTS = 10_000;
const PAYMENT_EXPIRES_AT_MS = Date.UTC(2030, 0, 1);
const MAX_REQUEST_ID_LENGTH = 128;

function paymentFixture(now: number, scenario?: string): PaymentRequest {
  return {id: PAYMENT_ID, recipient: 'Study Bot', serviceName: 'Игровой предмет', amount: PAYMENT_AMOUNT_CENTS,
    expiresAt: scenario === 'payment-expired' ? now - 1 : PAYMENT_EXPIRES_AT_MS, status: 'open'};
}

function savedPayment(account: Account): PaymentRequest | undefined {
  const value = account.extras?.payments;
  if (!value || typeof value !== 'object') return undefined;
  const payment = value as Partial<PaymentRequest>;
  if (payment.id !== PAYMENT_ID || typeof payment.recipient !== 'string' || !payment.recipient ||
    typeof payment.serviceName !== 'string' || !payment.serviceName || !Number.isSafeInteger(payment.amount) ||
    (payment.amount ?? 0) < 1 || !Number.isSafeInteger(payment.expiresAt) ||
    !['open', 'paid', 'canceled', 'unknown'].includes(payment.status ?? '') ||
    (payment.requestId !== undefined && (typeof payment.requestId !== 'string' || !payment.requestId || payment.requestId.length > MAX_REQUEST_ID_LENGTH)) ||
    (payment.total !== undefined && (!Number.isSafeInteger(payment.total) || payment.total < 1)) ||
    (payment.balanceAfter !== undefined && (!Number.isSafeInteger(payment.balanceAfter) || payment.balanceAfter < 0))) return undefined;
  if ((payment.status === 'paid' || payment.status === 'unknown') &&
    (!payment.requestId || payment.total === undefined || payment.balanceAfter === undefined ||
      !account.operations.some((operation) => operation.id === payment.requestId && operation.kind === 'payment' && operation.amount === payment.total))) return undefined;
  return payment as PaymentRequest;
}

interface DemoOptions {
  now: () => number;
  random: () => number;
  schedule: (tick: () => void, intervalMs: number) => () => void;
  initial: (now: number) => AppSnapshot;
  storage?: AccountStorage;
  marketStatus?: AppSnapshot['marketStatus'];
  onStart?: (refresh: () => void) => () => void;
  scheduleOnce?: (tick: () => void, delayMs: number) => () => void;
  exclusive?: (operation: () => OperationResult) => Promise<OperationResult>;
  scenario?: string;
  waitForTrade?: () => Promise<void>;
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
  const feeSave = savedFeeSave(account);
  const savedListings = account.extras?.listings;
  const listing = savedListings && typeof savedListings === 'object' ? savedListings as Partial<ListingApplication> : undefined;
  const validListing = listing?.id === 'study-bot' && (listing.status === 'approved' && listing.input &&
    Number.isSafeInteger(listing.input.price) && listing.input.price > 0 && Number.isSafeInteger(listing.input.quantity) && listing.input.quantity > 0 &&
    Number.isSafeInteger(listing.input.price * listing.input.quantity) || listing.status === 'rejected' && typeof listing.reason === 'string' && !!listing.reason.trim()) &&
    typeof listing.requestId === 'string' && !!listing.requestId;
  const listings = quoteSnapshot.listings.map((item) => item.id === 'study-bot' && validListing ? {...item, ...listing} as ListingApplication : item);
  const study = listings.find((item) => item.id === 'study-bot');
  const quotes = quoteSnapshot.quotes.filter((item) => item.symbol !== 'STUDY');
  const existingStudy = quoteSnapshot.quotes.find((item) => item.symbol === 'STUDY');
  if (study?.status === 'approved' && study.input) quotes.push(existingStudy ?? {symbol: 'STUDY', name: 'Study Bot', icon: 'robot',
    price: study.input.price, priorPrice: study.input.price, isNew: true, tradingStatus: 'active', history: [{at: now, price: study.input.price}]});
  const unknownTradeId = typeof account.extras?.unknownTradeId === 'string' ? account.extras.unknownTradeId : undefined;
  const unknownTrade = unknownTradeId ? account.operations.find(({id}) => id === unknownTradeId) : undefined;
  const payment = account.extras?.payments === undefined ? quoteSnapshot.payments[0] : savedPayment(account);
  const unknownPayment = payment?.status === 'unknown' && payment.requestId
    ? account.operations.find(({id, kind}) => id === payment.requestId && kind === 'payment') : undefined;
  const previousHolding = account.extras?.unknownPreviousHolding;
  const holdings = {...account.holdings};
  if (unknownTrade?.symbol && previousHolding === null) delete holdings[unknownTrade.symbol];
  else if (unknownTrade?.symbol && previousHolding && typeof previousHolding === 'object' &&
    'quantity' in previousHolding && 'cost' in previousHolding &&
    typeof previousHolding.quantity === 'number' && Number.isSafeInteger(previousHolding.quantity) && previousHolding.quantity > 0 &&
    typeof previousHolding.cost === 'number' && Number.isSafeInteger(previousHolding.cost) && previousHolding.cost >= 0) {
    holdings[unknownTrade.symbol] = {quantity: previousHolding.quantity, cost: previousHolding.cost};
  }
  return {
    ...quoteSnapshot,
    integrations: {api: savedApi(account) ?? quoteSnapshot.integrations.api, mcp: savedMcp(account) ?? quoteSnapshot.integrations.mcp},
    listings,
    quotes,
    balance: account.balance + (unknownTrade ? (unknownTrade.kind === 'buy' ? unknownTrade.amount : -unknownTrade.amount) : 0) + (unknownPayment?.amount ?? 0),
    holdings: unknownTrade ? holdings : account.holdings,
    operations: account.operations.filter(({id}) => id !== unknownTrade?.id && id !== unknownPayment?.id),
    bonusClaimed: account.claimedOn === localDay(now),
    fees: feeSave?.status === 'unknown' ? feeSave.previous : validFees(account.extras?.fees) ? account.extras.fees : quoteSnapshot.fees,
    feeSave,
    unknownTradeId,
    unknownTrade,
    now,
    payments: [payment].filter((item): item is PaymentRequest => Boolean(item)).map((payment) =>
      payment.status === 'open' && payment.expiresAt <= now ? {...payment, status: 'expired'} : payment),
  };
}

function validFees(value: unknown): value is AppSnapshot['fees'] {
  if (!value || typeof value !== 'object') return false;
  const fees = value as Record<string, unknown>;
  return ['buyBps', 'sellBps', 'transferBps', 'serviceBps'].every((key) =>
    typeof fees[key] === 'number' && Number.isInteger(fees[key]) && fees[key] >= 0 && fees[key] <= MAX_FEE_BPS);
}

function savedFeeSave(account: Account): FeeSave | undefined {
  const value = account.extras?.feeSave;
  if (!value || typeof value !== 'object') return undefined;
  const save = value as Partial<FeeSave>;
  return typeof save.requestId === 'string' && !!save.requestId && save.requestId.length <= MAX_REQUEST_ID_LENGTH &&
    (save.status === 'unknown' || save.status === 'saved') && validFees(save.settings) && validFees(save.previous)
    ? save as FeeSave : undefined;
}

const API_SCOPES: readonly ApiScope[] = ['quotes', 'history', 'rewards', 'payments'];
interface ApiRecord { readonly requestId: string; readonly action: 'save' | 'revoke'; readonly access: ApiAccess }
function validApi(value: unknown): value is ApiAccess {
  if (!value || typeof value !== 'object') return false;
  const api = value as Partial<ApiAccess>;
  return typeof api.connected === 'boolean' && Array.isArray(api.scopes) &&
    api.scopes.every((scope: unknown) => API_SCOPES.includes(scope as ApiScope)) && new Set(api.scopes).size === api.scopes.length;
}
function integrationData(account: Account): Record<string, unknown> {
  const value = account.extras?.integrations;
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function savedApi(account: Account): ApiAccess | undefined {
  const api = integrationData(account).api;
  return validApi(api) ? api : undefined;
}
function apiRecords(account: Account): ApiRecord[] {
  const value = integrationData(account).apiRecords;
  if (!Array.isArray(value)) return [];
  return value.filter((entry: unknown): entry is ApiRecord => {
    if (!entry || typeof entry !== 'object') return false;
    const record = entry as Partial<ApiRecord>;
    return typeof record.requestId === 'string' && !!record.requestId && record.requestId.length <= MAX_REQUEST_ID_LENGTH &&
      (record.action === 'save' || record.action === 'revoke') && validApi(record.access);
  });
}

const MCP_SCOPES: readonly McpScope[] = ['market', 'trade', 'history'];
interface McpRecord { readonly requestId: string; readonly action: 'save' | 'revoke'; readonly access: McpAccess }
function validMcp(value: unknown): value is McpAccess {
  if (!value || typeof value !== 'object') return false;
  const mcp = value as Partial<McpAccess>;
  return typeof mcp.connected === 'boolean' && Number.isSafeInteger(mcp.limitMinor) && (mcp.limitMinor ?? 0) > 0 &&
    Array.isArray(mcp.scopes) && mcp.scopes.every((scope: unknown) => MCP_SCOPES.includes(scope as McpScope)) &&
    new Set(mcp.scopes).size === mcp.scopes.length;
}
function savedMcp(account: Account): McpAccess | undefined {
  const mcp = integrationData(account).mcp;
  return validMcp(mcp) ? mcp : undefined;
}
function mcpRecords(account: Account): McpRecord[] {
  const value = integrationData(account).mcpRecords;
  if (!Array.isArray(value)) return [];
  return value.filter((entry: unknown): entry is McpRecord => {
    if (!entry || typeof entry !== 'object') return false;
    const record = entry as Partial<McpRecord>;
    return typeof record.requestId === 'string' && !!record.requestId && record.requestId.length <= MAX_REQUEST_ID_LENGTH &&
      (record.action === 'save' || record.action === 'revoke') && validMcp(record.access);
  });
}

export class DemoDataSource implements AppDataSource {
  private snapshot: AppSnapshot;
  private account: Account;
  private readonly listeners = new Set<() => void>();
  private started = false;
  private active = false;
  private cancelStorage: (() => void) | undefined;
  private cancelLoading: (() => void) | undefined;
  private cancelTimer: (() => void) | undefined;
  private feeErrorOccurred = false;

  constructor(private readonly options: DemoOptions) {
    const now = options.now();
    const base = options.initial(now);
    const initial: AppSnapshot = {...base, integrations: {api: {...base.integrations.api, connected: options.scenario !== 'api-disconnected'}, mcp: {...base.integrations.mcp, connected: options.scenario !== 'mcp-disconnected'}}, listings: base.listings.map((item) => item.id !== 'study-bot' ? item :
      options.scenario === 'listing-approved' ? {...item, status: 'approved', input: {price: 10_000, quantity: 10_000}, requestId: 'fixture-approved'} :
      options.scenario === 'listing-rejected' ? {...item, status: 'rejected', reason: 'Не удалось подтвердить управление ботом.', requestId: 'fixture-rejected'} :
      options.scenario === 'listing-pending' ? {...item, processing: true} : item)};
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
    const repricedTrade = options.scenario === 'buy-repriced'
      ? this.account.operations.find((operation) => operation.kind === 'buy' && operation.breakdown?.unitPrice === REPRICED_SCENARIO_PRICE_CENTS)
      : undefined;
    const quotes = repricedTrade
      ? initial.quotes.map((quote) => quote.symbol === repricedTrade.symbol ? {...quote, price: REPRICED_SCENARIO_PRICE_CENTS} : quote)
      : initial.quotes;
    this.snapshot = withAccount({...initial, quotes, payments: [paymentFixture(now, options.scenario)], marketStatus: options.marketStatus ?? initial.marketStatus}, this.account, now);
  }

  readonly getSnapshot = (): AppSnapshot => this.snapshot;

  private async apiTransaction(action: () => ApiAccessResult): Promise<ApiAccessResult> {
    const run = (): ApiAccessResult => { this.applyAccount(readAccount(this.options.storage)); return action(); };
    try {
      const exclusive = this.options.exclusive as ((callback: () => ApiAccessResult) => Promise<ApiAccessResult>) | undefined;
      return exclusive ? await exclusive(run) : run();
    } catch { return {ok: false, reason: 'storage'}; }
  }

  readonly saveApiAccess = (scopes: readonly ApiScope[], requestId: string): Promise<ApiAccessResult> =>
    this.updateApi('save', scopes, requestId);

  readonly revokeApiAccess = (requestId: string): Promise<ApiAccessResult> =>
    this.updateApi('revoke', undefined, requestId);

  readonly checkApiAccess = (requestId: string): Promise<ApiAccessResult> => this.apiTransaction(() => {
    const record = apiRecords(this.account).find((item) => item.requestId === requestId);
    return record ? {ok: true, access: record.access} : {ok: false, reason: 'invalid'};
  });

  private updateApi(action: 'save' | 'revoke', scopes: readonly ApiScope[] | undefined, requestId: string): Promise<ApiAccessResult> {
    return this.apiTransaction(() => {
      if (!requestId.trim() || requestId.length > MAX_REQUEST_ID_LENGTH || action === 'save' &&
        (!Array.isArray(scopes) || !validApi({connected: true, scopes}))) return {ok: false, reason: 'invalid'};
      const records = apiRecords(this.account);
      const prior = records.find((item) => item.requestId === requestId);
      if (prior) return prior.action === action && (action === 'revoke' || JSON.stringify(prior.access.scopes) === JSON.stringify(scopes))
        ? {ok: true, access: prior.access} : {ok: false, reason: 'invalid'};
      const access: ApiAccess = action === 'save' ? {connected: true, scopes: [...scopes!]} : {...this.snapshot.integrations.api, connected: false};
      const record: ApiRecord = {requestId, action, access};
      const integrations = {...integrationData(this.account), api: access, apiRecords: [...records, record]};
      const next = {...this.account, revision: this.account.revision + 1, extras: {...this.account.extras, integrations}};
      writeAccount(this.options.storage, next);
      this.account = next;
      this.publish(withAccount(this.snapshot, next, this.options.now()));
      return {ok: true, access};
    });
  }

  private async mcpTransaction(action: () => McpAccessResult): Promise<McpAccessResult> {
    const run = (): McpAccessResult => { this.applyAccount(readAccount(this.options.storage)); return action(); };
    try {
      const exclusive = this.options.exclusive as ((callback: () => McpAccessResult) => Promise<McpAccessResult>) | undefined;
      return exclusive ? await exclusive(run) : run();
    } catch { return {ok: false, reason: 'storage'}; }
  }

  readonly saveMcpAccess = (scopes: readonly McpScope[], limitMinor: number, requestId: string): Promise<McpAccessResult> =>
    this.updateMcp('save', scopes, limitMinor, requestId);

  readonly revokeMcpAccess = (requestId: string): Promise<McpAccessResult> =>
    this.updateMcp('revoke', undefined, undefined, requestId);

  readonly checkMcpAccess = (requestId: string): Promise<McpAccessResult> => this.mcpTransaction(() => {
    const record = mcpRecords(this.account).find((item) => item.requestId === requestId);
    return record ? {ok: true, access: record.access} : {ok: false, reason: 'invalid'};
  });

  private updateMcp(action: 'save' | 'revoke', scopes: readonly McpScope[] | undefined, limitMinor: number | undefined, requestId: string): Promise<McpAccessResult> {
    return this.mcpTransaction(() => {
      if (!requestId.trim() || requestId.length > MAX_REQUEST_ID_LENGTH || action === 'save' &&
        (!Array.isArray(scopes) || !validMcp({connected: true, scopes, limitMinor}))) return {ok: false, reason: 'invalid'};
      const records = mcpRecords(this.account);
      const prior = records.find((item) => item.requestId === requestId);
      if (prior) return prior.action === action && (action === 'revoke' || prior.access.limitMinor === limitMinor &&
        JSON.stringify(prior.access.scopes) === JSON.stringify(scopes))
        ? {ok: true, access: prior.access} : {ok: false, reason: 'invalid'};
      const access: McpAccess = action === 'save' ? {connected: true, scopes: [...scopes!], limitMinor: limitMinor!} : {...this.snapshot.integrations.mcp, connected: false};
      const record: McpRecord = {requestId, action, access};
      const integrations = {...integrationData(this.account), mcp: access, mcpRecords: [...records, record]};
      const next = {...this.account, revision: this.account.revision + 1, extras: {...this.account.extras, integrations}};
      writeAccount(this.options.storage, next);
      this.account = next;
      this.publish(withAccount(this.snapshot, next, this.options.now()));
      return {ok: true, access};
    });
  }

  private async feeTransaction(action: () => FeeSaveResult): Promise<FeeSaveResult> {
    const run = (): FeeSaveResult => { this.applyAccount(readAccount(this.options.storage)); return action(); };
    try {
      const exclusive = this.options.exclusive as ((callback: () => FeeSaveResult) => Promise<FeeSaveResult>) | undefined;
      return exclusive ? await exclusive(run) : run();
    } catch { return {ok: false, reason: 'storage'}; }
  }

  readonly saveFeeSettings = async (settings: FeeSettings, requestId: string): Promise<FeeSaveResult> => {
    const result = await this.feeTransaction(() => {
      if (!validFees(settings) || !requestId.trim() || requestId.length > MAX_REQUEST_ID_LENGTH) return {ok: false, reason: 'invalid'};
      const previousSave = savedFeeSave(this.account);
      if (previousSave?.requestId === requestId) {
        if (Object.keys(settings).some((key) => settings[key as keyof FeeSettings] !== previousSave.settings[key as keyof FeeSettings])) return {ok: false, reason: 'invalid'};
        return previousSave.status === 'saved' ? {ok: true, settings: previousSave.settings} : {ok: false, reason: 'unknown'};
      }
      if (previousSave?.status === 'unknown') return {ok: false, reason: 'unknown'};
      if (this.options.scenario === 'fees-save-error' && !this.feeErrorOccurred) {
        this.feeErrorOccurred = true;
        return {ok: false, reason: 'storage'};
      }
      const save: FeeSave = {requestId, settings, previous: this.snapshot.fees,
        status: this.options.scenario === 'fees-save-unknown' || this.options.waitForTrade ? 'unknown' : 'saved'};
      const next = {...this.account, revision: this.account.revision + 1, extras: {...this.account.extras, fees: settings, feeSave: save}};
      writeAccount(this.options.storage, next);
      this.account = next;
      this.publish(withAccount(this.snapshot, next, this.options.now()));
      return save.status === 'unknown' ? {ok: false, reason: 'unknown'} : {ok: true, settings};
    });
    if (!result.ok && result.reason !== 'unknown') return result;
    try { await this.options.waitForTrade?.(); } catch { return {ok: false, reason: 'unknown'}; }
    if (!result.ok && result.reason === 'unknown' && this.options.waitForTrade && this.options.scenario !== 'fees-save-unknown') {
      const checked = await this.checkFeeSettings(requestId);
      return !checked.ok && checked.reason === 'storage' ? {ok: false, reason: 'unknown'} : checked;
    }
    return result;
  };

  readonly checkFeeSettings = (requestId: string): Promise<FeeSaveResult> => this.feeTransaction(() => {
    const save = savedFeeSave(this.account);
    if (!save || save.requestId !== requestId) return {ok: false, reason: 'invalid'};
    if (save.status === 'saved') return {ok: true, settings: save.settings};
    const updated: FeeSave = {...save, status: 'saved'};
    const next = {...this.account, revision: this.account.revision + 1, extras: {...this.account.extras, fees: save.settings, feeSave: updated}};
    writeAccount(this.options.storage, next);
    this.account = next;
    this.publish(withAccount(this.snapshot, next, this.options.now()));
    return {ok: true, settings: save.settings};
  });

  readonly getListingApplications = (): readonly ListingApplication[] => this.snapshot.listings;

  readonly approveListing = (id: string, input: ListingInput, requestId: string): Promise<ListingResult> =>
    this.listingTransaction(id, requestId, input);

  readonly rejectListing = (id: string, reason: string, requestId: string): Promise<ListingResult> =>
    this.listingTransaction(id, requestId, undefined, reason);

  private async listingTransaction(id: string, requestId: string, input?: ListingInput, reason?: string): Promise<ListingResult> {
    const run = (): ListingResult => {
      this.applyAccount(readAccount(this.options.storage));
      const application = this.snapshot.listings.find((item) => item.id === id);
      if (id !== 'study-bot' || !application || !requestId.trim() || requestId.length > MAX_REQUEST_ID_LENGTH ||
        input && (!Number.isSafeInteger(input.price) || input.price < 1 || !Number.isSafeInteger(input.quantity) || input.quantity < 1 || !Number.isSafeInteger(input.price * input.quantity)) ||
        !input && !reason?.trim()) return {ok: false, reason: 'invalid'};
      if (application.status !== 'pending') {
        return application.requestId === requestId && (input ? application.status === 'approved' && application.input?.price === input.price && application.input.quantity === input.quantity :
          application.status === 'rejected' && application.reason === reason?.trim()) ? {ok: true, application} : {ok: false, reason: 'invalid'};
      }
      const updated: ListingApplication = input ? {...application, status: 'approved', input, requestId} : {...application, status: 'rejected', reason: reason!.trim(), requestId};
      const next = {...this.account, revision: this.account.revision + 1, extras: {...this.account.extras, listings: updated}};
      writeAccount(this.options.storage, next);
      this.account = next;
      this.publish(withAccount(this.snapshot, next, this.options.now()));
      return {ok: true, application: updated};
    };
    try {
      const exclusive = this.options.exclusive as ((callback: () => ListingResult) => Promise<ListingResult>) | undefined;
      const result = exclusive ? await exclusive(run) : run();
      try { await this.options.waitForTrade?.(); } catch { return {ok: false, reason: 'unknown'}; }
      return result;
    } catch { return {ok: false, reason: 'storage'}; }
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  start(): void {
    if (this.started) return;
    this.started = true;
    this.cancelStorage = this.options.onStart?.(() => this.refreshAccount());
    if (this.active) this.startTimer();
    if (this.snapshot.marketStatus === 'loading') this.finishLoading();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.cancelStorage?.();
    this.cancelStorage = undefined;
    this.cancelLoading?.();
    this.cancelLoading = undefined;
    this.cancelTimer?.();
    this.cancelTimer = undefined;
  }

  reloadMarket(): void {
    this.cancelLoading?.();
    this.publish({...this.snapshot, marketStatus: 'loading'});
    if (this.started) this.finishLoading();
  }

  private finishLoading(): void {
    this.cancelLoading?.();
    const complete = (): void => {
      this.cancelLoading = undefined;
      this.publish({...this.snapshot, marketStatus: 'ready'});
    };
    if (this.options.scheduleOnce) this.cancelLoading = this.options.scheduleOnce(complete, MARKET_LOADING_MS);
    else complete();
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.cancelTimer?.();
      this.cancelTimer = undefined;
    } else if (this.started) {
      this.startTimer();
    }
  }

  private startTimer(): void {
    if (!this.cancelTimer) {
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

  readonly buy = (order: TradeOrder): Promise<OperationResult> => this.submitTrade('buy', order);
  readonly sell = (order: TradeOrder): Promise<OperationResult> => this.submitTrade('sell', order);

  private async submitTrade(side: TradeSide, order: TradeOrder): Promise<OperationResult> {
    const result = await this.transact(() => this.trade(side, order));
    await this.options.waitForTrade?.();
    if (!result.ok && result.reason === 'unknown' && this.options.waitForTrade && this.options.scenario !== 'trade-unknown') {
      return this.checkTrade(order.id);
    }
    return result;
  }

  readonly checkTrade = (id: string): Promise<OperationResult> => this.transact(() => {
    const operation = this.account.operations.find((item) => item.id === id && (item.kind === 'buy' || item.kind === 'sell'));
    if (this.account.extras?.unknownTradeId !== id) return operation ? {ok: true, operation} : {ok: false, reason: 'invalid'};
    if (!operation) return {ok: false, reason: 'unknown'};
    const extras = {...this.account.extras};
    delete extras.unknownTradeId;
    delete extras.unknownPreviousHolding;
    const account = {...this.account, revision: this.account.revision + 1, extras};
    writeAccount(this.options.storage, account);
    this.account = account;
    this.publish(withAccount(this.snapshot, account, this.options.now()));
    return {ok: true, operation};
  });

  readonly claimBonus = (): Promise<OperationResult> => this.transact(() => {
    const now = this.options.now();
    const day = localDay(now);
    if (this.account.claimedOn === day) return {ok: false, reason: 'claimed'};

    const operation: Operation = {id: `bonus-${day}`, kind: 'bonus', date: now, amount: DAILY_BONUS};
    if (this.account.operations.some(({id}) => id === operation.id)) return {ok: false, reason: 'claimed'};
    return this.commit({...this.account, balance: this.account.balance + DAILY_BONUS, claimedOn: day}, operation);
  });

  readonly getPaymentRequest = (id: string): PaymentRequest | undefined => {
    const payment = this.snapshot.payments.find((item) => item.id === id);
    return payment?.status === 'open' && payment.expiresAt <= this.options.now() ? {...payment, status: 'expired'} : payment;
  };

  private async paymentTransaction(action: () => PaymentResult): Promise<PaymentResult> {
    const run = (): PaymentResult => {
      this.applyAccount(readAccount(this.options.storage));
      return action();
    };
    try {
      const exclusive = this.options.exclusive as ((callback: () => PaymentResult) => Promise<PaymentResult>) | undefined;
      return exclusive ? await exclusive(run) : run();
    } catch {
      return {ok: false, reason: 'storage'};
    }
  }

  private savePayment(payment: PaymentRequest, operation?: Operation): void {
    const next = {...this.account, revision: this.account.revision + 1,
      balance: operation ? this.account.balance - operation.amount : this.account.balance,
      operations: operation ? [operation, ...this.account.operations] : this.account.operations,
      extras: {...this.account.extras, payments: payment}};
    writeAccount(this.options.storage, next);
    this.account = next;
    this.publish(withAccount(this.snapshot, next, this.options.now()));
  }

  readonly payService = async (id: string, requestId: string, expectedTotal: number): Promise<PaymentResult> => {
    const result = await this.paymentTransaction(() => {
      const payment = this.getPaymentRequest(id);
      if (!payment || !requestId.trim() || requestId.length > MAX_REQUEST_ID_LENGTH || requestId.startsWith('bonus-') || requestId.startsWith('demo-') ||
        !Number.isSafeInteger(expectedTotal) || expectedTotal < 1) return {ok: false, reason: 'invalid'};
      if (payment.requestId === requestId && payment.total === expectedTotal && payment.status === 'paid') return {ok: true, request: payment};
      if (payment.status === 'unknown') return {ok: false, reason: 'unknown'};
      if (payment.status !== 'open' || this.account.operations.some((item) => item.id === requestId)) return {ok: false, reason: 'invalid'};
      if (typeof this.account.extras?.unknownTradeId === 'string') {
        return {ok: false, reason: 'blocked', blocker: {kind: 'trade', id: this.account.extras.unknownTradeId}};
      }
      const total = payment.amount + Math.round(payment.amount * this.snapshot.fees.serviceBps / MAX_FEE_BPS);
      if (!Number.isSafeInteger(total)) return {ok: false, reason: 'invalid'};
      if (expectedTotal !== total) return {ok: false, reason: 'price-changed'};
      if (this.account.balance < total) return {ok: false, reason: 'funds'};
      const status = this.options.scenario === 'payment-unknown' ? 'unknown' : 'paid';
      const updated: PaymentRequest = {...payment, status, requestId, total, balanceAfter: this.account.balance - total};
      const operation: Operation = {id: requestId, kind: 'payment', date: this.options.now(), amount: total, recipient: payment.recipient};
      this.savePayment(updated, operation);
      return status === 'unknown' ? {ok: false, reason: 'unknown'} : {ok: true, request: updated};
    });
    await this.options.waitForTrade?.();
    return result;
  };

  readonly cancelPayment = (id: string): Promise<PaymentResult> => this.paymentTransaction(() => {
    const payment = this.getPaymentRequest(id);
    if (!payment || payment.status !== 'open') return {ok: false, reason: 'invalid'};
    const updated: PaymentRequest = {...payment, status: 'canceled'};
    this.savePayment(updated);
    return {ok: true, request: updated};
  });

  readonly checkPayment = (requestId: string): Promise<PaymentResult> => this.paymentTransaction(() => {
    const payment = this.snapshot.payments.find((item) => item.requestId === requestId);
    if (!payment || !requestId) return {ok: false, reason: 'invalid'};
    if (payment.status === 'paid') return {ok: true, request: payment};
    if (payment.status !== 'unknown') return {ok: false, reason: 'invalid'};
    const updated: PaymentRequest = {...payment, status: 'paid'};
    this.savePayment(updated);
    return {ok: true, request: updated};
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
    const {symbol, quantity, id, unitPrice, feeBps} = order;
    const unknownTradeId = this.account.extras?.unknownTradeId;
    if (typeof unknownTradeId === 'string') {
      return unknownTradeId === id ? {ok: false, reason: 'unknown'} :
        {ok: false, reason: 'blocked', blocker: {kind: 'trade', id: unknownTradeId}};
    }
    const unknownPayment = savedPayment(this.account);
    if (unknownPayment?.status === 'unknown' && unknownPayment.requestId) {
      return {ok: false, reason: 'blocked', blocker: {kind: 'payment', id: unknownPayment.requestId}};
    }
    if (!id || id.length > 128 || id.startsWith('bonus-') || id.startsWith('demo-') ||
      !Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_TRADE_QUANTITY ||
      !Number.isSafeInteger(unitPrice) || unitPrice < 1 || !Number.isSafeInteger(feeBps) || feeBps < 0 || feeBps > MAX_FEE_BPS) {
      return {ok: false, reason: 'invalid'};
    }
    const previous = this.account.operations.find((operation) => operation.id === id);
    if (previous) {
      return previous.kind === side && previous.symbol === symbol && previous.quantity === quantity &&
        previous.breakdown?.unitPrice === unitPrice && previous.breakdown.feeBps === feeBps
        ? {ok: true, operation: previous}
        : {ok: false, reason: 'invalid'};
    }
    const quote = this.snapshot.quotes.find((item) => item.symbol === symbol);
    if (!quote || quote.tradingStatus === 'paused') return {ok: false, reason: 'invalid'};
    if (this.options.scenario === 'buy-repriced' && quote.price === REPRICED_SCENARIO_INITIAL_PRICE_CENTS) {
      this.publish({...this.snapshot, quotes: this.snapshot.quotes.map((item) => item.symbol === symbol ? {...item, price: REPRICED_SCENARIO_PRICE_CENTS} : item)});
      return {ok: false, reason: 'price-changed'};
    }
    if (quote.price !== unitPrice) return {ok: false, reason: 'price-changed'};
    if (feeBps !== this.snapshot.fees[side === 'buy' ? 'buyBps' : 'sellBps']) return {ok: false, reason: 'price-changed'};

    const {balance, holdings} = this.account;
    const held = holdings[symbol];
    const breakdown = {quantity, unitPrice, feeBps, ...tradePreview(side, quantity, unitPrice, feeBps)};
    const amount = breakdown.total;
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

    const operation: Operation = {id, kind: side, date: this.options.now(), amount, symbol, quantity, breakdown};
    const unknown = this.options.scenario === 'trade-unknown' || Boolean(this.options.waitForTrade);
    const extras = unknown ? {...this.account.extras, unknownTradeId: id, unknownPreviousHolding: held ?? null} : this.account.extras;
    const result = this.commit({...this.account, balance: balance + (buying ? -amount : amount), holdings: next, ...(extras ? {extras} : {})}, operation);
    return result.ok && unknown ? {ok: false, reason: 'unknown'} : result;
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
