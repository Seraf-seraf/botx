import type {ReactElement} from 'react';
import {Navigate, Route, Routes, useLocation, useMatch, useNavigate} from 'react-router-dom';
import {AssetPage} from '../pages/AssetPage';
import {BalancePage} from '../pages/BalancePage';
import {MarketPage} from '../pages/MarketPage';
import {PortfolioPage} from '../pages/PortfolioPage';
import {ProfilePage} from '../pages/ProfilePage';
import {useDemoData} from '../shared/data/demo-fixtures';
import {AppShell} from '../shared/ui/AppShell';

export function AppRoutes(): ReactElement {
  const {snapshot, trade, claimBonus} = useDemoData();
  const assetMatch = useMatch('/asset/:symbol/:side?');
  const side = assetMatch?.params.side;
  const tradeSide = side === 'buy' || side === 'sell' ? side : undefined;
  const asset = snapshot.quotes.find(({symbol}) => symbol === assetMatch?.params.symbol);
  const navigate = useNavigate();
  const location = useLocation();
  const from: unknown = location.state?.from;

  function back(): void {
    if (tradeSide) {
      if (from === 'asset') void navigate(-1);
      else void navigate(`/asset/${asset?.symbol}`, {replace: true});
    } else if (from === '/' || from === '/portfolio') {
      void navigate(-1);
    } else {
      void navigate('/', {replace: true});
    }
  }

  const assetPage = asset && (!side || tradeSide)
    ? <AssetPage key={asset.symbol} quote={asset} snapshot={snapshot} {...(tradeSide ? {side: tradeSide} : {})} onBack={back} onTrade={trade} />
    : <Navigate to="/" replace />;

  return (
    <AppShell {...(asset ? {title: tradeSide ? asset.name : 'Акция', onBack: back} : {})}>
      <Routes>
        <Route path="/" element={<MarketPage snapshot={snapshot} />} />
        <Route path="/asset/:symbol/:side?" element={assetPage} />
        <Route path="/portfolio" element={<PortfolioPage snapshot={snapshot} />} />
        <Route path="/balance" element={<BalancePage snapshot={snapshot} onBonus={claimBonus} />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
