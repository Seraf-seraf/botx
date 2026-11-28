import type {ReactElement} from 'react';
import {useRef, useState} from 'react';
import {Navigate, Route, Routes, useLocation, useMatch, useNavigate} from 'react-router-dom';
import {McpAccessPage} from '../features/integrations/McpAccessPage';
import {ApiAccessPage} from '../features/integrations/ApiAccessPage';
import {TradeReceipt} from '../features/trading/TradeReceipt';
import {PaymentPage} from '../features/payments/PaymentPage';
import {ListingsPage} from '../features/admin/ListingsPage';
import {ListingReviewPage} from '../features/admin/ListingReviewPage';
import {FeesPage} from '../features/admin/FeesPage';
import {AssetPage} from '../pages/AssetPage';
import {BalancePage} from '../pages/BalancePage';
import {MarketPage} from '../pages/MarketPage';
import {PortfolioPage} from '../pages/PortfolioPage';
import {ProfilePage} from '../pages/ProfilePage';
import {useAppSnapshot} from '../shared/data/useAppSnapshot';
import type {AppDataSource} from '../shared/data/contracts';
import {AppShell} from '../shared/ui/AppShell';

export function AppRoutes({source}: {source: AppDataSource}): ReactElement {
  const {snapshot, trade, claimBonus, payService, cancelPayment, checkPayment} = useAppSnapshot(source);
  const [paymentPending, setPaymentPending] = useState(false);
  const [paymentConfirmation, setPaymentConfirmation] = useState(false);
  const paymentMatch = useMatch('/payments/:requestId');
  const assetMatch = useMatch('/asset/:symbol/:side?');
  const portfolioAfter = useMatch('/portfolio/after');
  const integrationApi = useMatch('/integrations/api');
  const integrationMcp = useMatch('/integrations/mcp');
  const integrationBack = useRef<(() => void) | undefined>(undefined);
  const [integrationHeader, setIntegrationHeader] = useState({title: 'BOTX', brand: 'Интеграции'});
  const adminList = useMatch('/admin/listings');
  const adminReview = useMatch('/admin/listings/:applicationId');
  const adminFees = useMatch('/admin/fees');
  const adminBack = useRef<(() => void) | undefined>(undefined);
  const [adminHeader, setAdminHeader] = useState({title: 'BOTX', brand: 'Заявка на листинг'});
  const listingDecided = snapshot.listings.find((item) => item.id === 'study-bot')?.status !== 'pending';
  const side = assetMatch?.params.side;
  const tradeSide = side === 'buy' || side === 'sell' ? side : undefined;
  const asset = snapshot.quotes.find(({symbol}) => symbol === assetMatch?.params.symbol);
  const paused = asset?.tradingStatus === 'paused';
  const navigate = useNavigate();
  const location = useLocation();
  const from: unknown = location.state?.from;
  const receiptId = new URLSearchParams(location.search).get('id');
  const receipt = side === 'receipt' ? snapshot.operations.find((operation) =>
    operation.id === receiptId && operation.id !== snapshot.unknownTradeId && operation.symbol === asset?.symbol && (operation.kind === 'buy' || operation.kind === 'sell'),
  ) : undefined;
  const portfolioOperation = portfolioAfter ? snapshot.operations.find((operation) =>
    operation.id === receiptId && operation.id !== snapshot.unknownTradeId &&
    (operation.kind === 'buy' || operation.kind === 'sell'),
  ) : undefined;
  const portfolioQuote = snapshot.quotes.find((quote) => quote.symbol === portfolioOperation?.symbol);
  const showTradePortfolio = Boolean(portfolioAfter && portfolioQuote && Object.keys(snapshot.holdings).length);

  function back(): void {
    if (integrationApi || integrationMcp) {
      if (integrationBack.current) integrationBack.current();
      else void navigate('/', {replace: true});
    } else if (adminReview || adminFees) {
      if (adminBack.current) adminBack.current();
      else void navigate('/admin/listings', {replace: true});
    } else if (adminList) {
      void navigate('/');
    } else if (paymentMatch) {
      if (!paymentPending) void navigate('/balance', {replace: true});
    } else if (portfolioAfter) {
      void navigate('/portfolio', {replace: true});
    } else if (paused && tradeSide) {
      void navigate('/', {replace: true});
    } else if (tradeSide || receipt) {
      if (from === 'asset') void navigate(-1);
      else void navigate(`/asset/${asset?.symbol}`, {replace: true});
    } else if (from === '/' || from === '/portfolio') {
      void navigate(-1);
    } else {
      void navigate('/', {replace: true});
    }
  }

  const assetPage = asset && receipt
    ? <TradeReceipt operation={receipt} quote={asset} balance={snapshot.balance} held={snapshot.holdings[asset.symbol]?.quantity ?? 0} />
    : asset && (!side || tradeSide)
      ? <AssetPage key={asset.symbol} quote={asset} snapshot={snapshot} {...(tradeSide && !paused ? {side: tradeSide} : {})} onBack={back} onTrade={trade} onCheckTrade={(id) => source.checkTrade(id)} onCheckPayment={checkPayment} />
      : <Navigate to="/" replace />;

  const title = receipt ? (receipt.kind === 'buy' ? 'Покупка' : 'Продажа') : tradeSide && !paused ? asset?.name : 'Акция';
  return (
    <AppShell compactHeader={Boolean(adminFees && adminHeader.brand === 'Администрирование')} pausedAsset={Boolean(integrationApi || integrationMcp || adminList || adminReview || adminFees || paymentMatch || showTradePortfolio || receipt || paused && (!side || tradeSide))} backInDialog={Boolean(tradeSide && !paused || paymentMatch && paymentConfirmation)} {...(integrationApi || integrationMcp ? {...integrationHeader, onBack: back} : adminList ? {title: listingDecided ? 'Листинг' : 'BOTX', brand: listingDecided ? 'BOTX' : 'Администрирование', onBack: back} : adminReview || adminFees ? {...adminHeader, onBack: back} : paymentMatch ? {title: 'Оплата услуги', onBack: back} : showTradePortfolio ? {title: 'Портфель', onBack: back} : asset ? {title: title ?? 'Акция', onBack: back} : {})}>
      <Routes>
        <Route path="/" element={<MarketPage snapshot={snapshot} onRetry={() => source.reloadMarket()} />} />
        <Route path="/asset/:symbol/:side?" element={assetPage} />
        <Route path="/portfolio" element={<PortfolioPage snapshot={snapshot} />} />
        <Route path="/portfolio/after" element={showTradePortfolio && portfolioQuote ? <PortfolioPage snapshot={snapshot} tradeQuote={portfolioQuote} /> : <Navigate to="/portfolio" replace />} />
        <Route path="/balance" element={<BalancePage snapshot={snapshot} onBonus={claimBonus} />} />
        <Route path="/payments/:requestId" element={<PaymentPage request={source.getPaymentRequest(paymentMatch?.params.requestId ?? '')} snapshot={snapshot} onPay={payService} onCancel={cancelPayment} onCheck={checkPayment} onCheckTrade={(id) => source.checkTrade(id)} onDone={back} onPendingChange={setPaymentPending} onConfirmationChange={setPaymentConfirmation} />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/integrations/mcp" element={<McpAccessPage snapshot={snapshot} source={source} backRef={integrationBack} onHeaderChange={setIntegrationHeader} />} />
        <Route path="/integrations/api" element={<ApiAccessPage snapshot={snapshot} source={source} backRef={integrationBack} onHeaderChange={setIntegrationHeader} />} />
        <Route path="/admin/listings" element={<ListingsPage listings={snapshot.listings} />} />
        <Route path="/admin/listings/:applicationId" element={<ListingReviewPage listings={snapshot.listings} source={source} backRef={adminBack} onHeaderChange={setAdminHeader} />} />
        <Route path="/admin/fees" element={<FeesPage snapshot={snapshot} source={source} backRef={adminBack} onHeaderChange={setAdminHeader} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
