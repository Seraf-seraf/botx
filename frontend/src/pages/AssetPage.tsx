import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {ReactElement} from 'react';
import {useBlocker, useLocation, useNavigate} from 'react-router-dom';
import {historySince, PriceChart} from '../features/market/PriceChart';
import {TradeSheet} from '../features/trading/TradeSheet';
import type {AppSnapshot, OperationResult, PaymentResult, Quote, TradeOrder, TradeSide} from '../shared/data/contracts';
import {Badge} from '../shared/ui/Badge';
import {Button} from '../shared/ui/Button';
import {Card} from '../shared/ui/Card';
import {FilterChips} from '../shared/ui/FilterChips';
import {Icon} from '../shared/ui/Icon';
import {changePercent, formatBc, signedPercent} from '../shared/ui/market';
import styles from './AssetPage.module.css';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = HOUR_MS * 24;

const ranges = [
  {value: 'hour', label: '1Ч', ms: HOUR_MS},
  {value: 'day', label: '1Д', ms: DAY_MS},
  {value: 'week', label: '7Д', ms: 7 * DAY_MS},
  {value: 'month', label: '30Д', ms: 30 * DAY_MS},
] as const;

type Range = (typeof ranges)[number]['value'];
const dateAxis = new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'short'});
const timeAxis = new Intl.DateTimeFormat('ru-RU', {hour: '2-digit', minute: '2-digit'});

interface AssetProps {
  quote: Quote;
  snapshot: AppSnapshot;
  side?: TradeSide;
  onBack: () => void;
  onTrade: (side: TradeSide, order: TradeOrder) => Promise<OperationResult>;
  onCheckTrade: (id: string) => Promise<OperationResult>;
  onCheckPayment: (id: string) => Promise<PaymentResult>;
}

export function AssetPage({quote, snapshot, side, onBack, onTrade, onCheckTrade, onCheckPayment}: AssetProps): ReactElement {
  const [range, setRange] = useState<Range>('week');
  const pendingTrade = useRef(false);
  const shouldBlock = useCallback((): boolean => pendingTrade.current, []);
  const setTradePending = useCallback((pending: boolean): void => { pendingTrade.current = pending; }, []);
  const blocker = useBlocker(shouldBlock);
  useEffect(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);
  const previousSide = useRef(side);
  const buyButton = useRef<HTMLButtonElement>(null);
  const sellButton = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const held = snapshot.holdings[quote.symbol]?.quantity ?? 0;
  const duration = ranges.find(({value}) => value === range)?.ms ?? 7 * DAY_MS;
  const points = historySince(quote.history, duration);
  const lastAt = points.at(-1)?.at;
  const change = changePercent(quote.price, range === 'week' ? quote.priorPrice : points[0]?.price ?? quote.price);
  const tone = change >= 0 ? 'positive' : 'negative';
  const axis = range === 'hour' || range === 'day' ? timeAxis : dateAxis;
  const period = range === 'hour' ? 'час' : range === 'day' ? '24 часа' : range === 'week' ? '7 дней' : '30 дней';

  useLayoutEffect(() => {
    const closedSide = previousSide.current;
    previousSide.current = side;
    if (!side && closedSide) {
      const trigger = closedSide === 'buy' ? buyButton.current : sellButton.current;
      trigger?.focus();
    }
  }, [side]);

  function openTrade(next: TradeSide): void {
    void navigate(`/asset/${quote.symbol}/${next}`, {state: {from: 'asset'}});
  }

  if (quote.tradingStatus === 'paused') {
    return (
      <article className={styles.paused}>
        <div>
          <h1>{quote.name}</h1>
          <p>{quote.symbol} / рынок временно недоступен</p>
        </div>
        <div className={styles.pausedNotice} role="status">
          <strong>Торги приостановлены</strong>
          <p>Покупка и продажа недоступны. Уже принадлежащие вам акции и история сохранены.</p>
        </div>
        <Button onClick={() => void navigate('/', {replace: true})}>На биржу</Button>
      </article>
    );
  }

  return (
    <article className={styles.asset}>
      <div className={styles.identity}>
        <span className={styles.icon}><Icon name={quote.icon} /></span>
        <div>
          <h1>{quote.name}</h1>
          <p>{quote.symbol}</p>
        </div>
      </div>
      <div className={styles.price}>
        <strong>{formatBc(quote.price)}</strong>
        {!side && (
          <div className={styles.change}>
            <Badge tone={tone}>{signedPercent(change)}</Badge>
            <span>за последние {period}</span>
          </div>
        )}
      </div>
      <div aria-label={`Изменение курса за ${period}`}>
        <PriceChart variant={side ? 'card' : 'detail'} className={side ? styles.tradeChart ?? '' : ''} points={points} tone={tone} />
        {!side && lastAt !== undefined && (
          <div className={styles.axis} aria-hidden="true">
            {[lastAt - duration, lastAt - duration / 2, lastAt].map((at) => (
              <span key={at}>{axis.format(at).replaceAll('.', '')}</span>
            ))}
          </div>
        )}
      </div>
      {!side && (
        <>
          <FilterChips label="Период графика" options={ranges} value={range} onChange={setRange} />
          <Card className={styles.holdings ?? ''}>
            <p>Ваши акции</p>
            <div><strong>{held} шт.</strong><strong>{formatBc(held * quote.price)}</strong></div>
          </Card>
          <div className={styles.actions}>
            <Button ref={buyButton} onClick={() => openTrade('buy')}>Купить</Button>
            <Button ref={sellButton} variant="secondary" onClick={() => openTrade('sell')}>Продать</Button>
          </div>
        </>
      )}
      {side && (
        <TradeSheet
          key={side}
          quote={quote}
          side={side}
          balance={snapshot.balance}
          held={held}
          fees={snapshot.fees}
          {...(side === 'buy' && snapshot.initialTradeQuantity ? {initialQuantity: snapshot.initialTradeQuantity} : {})}
          {...(snapshot.unknownTradeId ? {unknownTradeId: snapshot.unknownTradeId} : {})}
          {...(snapshot.unknownTrade ? {unknownOperation: snapshot.unknownTrade} : {})}
          onCheckTrade={onCheckTrade}
          onCheckPayment={onCheckPayment}
          onUnknownClose={() => void navigate('/', {replace: true})}
          onClose={onBack}
          onPendingChange={setTradePending}
          onConfirm={(quantity, price, id, feeBps) => onTrade(side, {id, symbol: quote.symbol, quantity, unitPrice: price, feeBps})}
          onSuccess={(operation) => {
            void navigate(`/asset/${operation.symbol ?? quote.symbol}/receipt?id=${encodeURIComponent(operation.id)}`, {
              replace: true,
              state: {from: location.state?.from},
            });
          }}
        />
      )}
    </article>
  );
}
