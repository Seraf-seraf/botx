import {useCallback, useEffect, useSyncExternalStore} from 'react';
import {useTelegram} from '../telegram/useTelegram';
import type {McpAccessResult, McpScope, ApiAccessResult, ApiScope, AppDataSource, AppSnapshot, FeeSaveResult, FeeSettings, ListingApplication, ListingInput, ListingResult, OperationResult, PaymentResult, TradeOrder, TradeSide} from './contracts';

export interface DemoData {
  readonly snapshot: AppSnapshot;
  saveMcpAccess(scopes: readonly McpScope[], limitMinor: number, requestId: string): Promise<McpAccessResult>;
  revokeMcpAccess(requestId: string): Promise<McpAccessResult>;
  checkMcpAccess(requestId: string): Promise<McpAccessResult>;
  saveApiAccess(scopes: readonly ApiScope[], requestId: string): Promise<ApiAccessResult>;
  revokeApiAccess(requestId: string): Promise<ApiAccessResult>;
  checkApiAccess(requestId: string): Promise<ApiAccessResult>;
  saveFeeSettings(settings: FeeSettings, requestId: string): Promise<FeeSaveResult>;
  checkFeeSettings(requestId: string): Promise<FeeSaveResult>;
  trade(side: TradeSide, order: TradeOrder): Promise<OperationResult>;
  claimBonus(): Promise<OperationResult>;
  payService(id: string, requestId: string, expectedTotal: number): Promise<PaymentResult>;
  cancelPayment(id: string): Promise<PaymentResult>;
  checkPayment(requestId: string): Promise<PaymentResult>;
  getListingApplications(): readonly ListingApplication[];
  approveListing(id: string, input: ListingInput, requestId: string): Promise<ListingResult>;
  rejectListing(id: string, reason: string, requestId: string): Promise<ListingResult>;
}

export function useAppSnapshot(source: AppDataSource): DemoData {
  const {state: {active}} = useTelegram();
  useEffect(() => {
    source.start();
    return () => source.stop();
  }, [source]);
  useEffect(() => {
    source.setActive(active);
    return () => source.setActive(false);
  }, [active, source]);
  const subscribe = useCallback((listener: () => void) => source.subscribe(listener), [source]);
  const getSnapshot = useCallback(() => source.getSnapshot(), [source]);
  return {
    snapshot: useSyncExternalStore(subscribe, getSnapshot),
    saveMcpAccess: source.saveMcpAccess,
    revokeMcpAccess: source.revokeMcpAccess,
    checkMcpAccess: source.checkMcpAccess,
    saveApiAccess: source.saveApiAccess,
    revokeApiAccess: source.revokeApiAccess,
    checkApiAccess: source.checkApiAccess,
    saveFeeSettings: source.saveFeeSettings,
    checkFeeSettings: source.checkFeeSettings,
    trade: (side, order) => side === 'buy' ? source.buy(order) : source.sell(order),
    claimBonus: () => source.claimBonus(),
    payService: source.payService,
    cancelPayment: source.cancelPayment,
    checkPayment: source.checkPayment,
    getListingApplications: source.getListingApplications,
    approveListing: source.approveListing,
    rejectListing: source.rejectListing,
  };
}
