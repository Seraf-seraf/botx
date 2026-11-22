import {useLayoutEffect, useRef, useState} from 'react';
import type {ReactElement} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import {historySince, PriceChart} from '../features/market/PriceChart';
import {TradeSheet} from '../features/trading/TradeSheet';
import type {AppSnapshot, OperationResult, Quote, TradeOrder, TradeSide} from '../shared/data/contracts';
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
}

export function AssetPage({quote, snapshot, side, onBack, onTrade}: AssetProps): ReactElement {
  const [range, setRange] = useState<Range>('week');
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

  return (
    <article className={styles.asset}>
      <div className={styles.identity}>
        <span className={styles.icon}><Icon name={quote.icon} /></span>
        <div>
          <h1>{quote.name}</h1>
          <p>{quote.symbol} · Игровой актив</p>
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
          <p className={styles.disclaimer}>Виртуальный рынок · демо</p>
        </>
      )}
      {side && (
        <TradeSheet
          key={side}
          quote={quote}
          side={side}
          balance={snapshot.balance}
          held={held}
          onClose={onBack}
          onConfirm={(quantity, price, id) => onTrade(side, {id, symbol: quote.symbol, quantity, unitPrice: price})}
          onSuccess={(operation) => {
            void navigate(`/asset/${quote.symbol}/receipt?id=${encodeURIComponent(operation.id)}`, {
              replace: true,
              state: {from: location.state?.from},
            });
          }}
        />
      )}
    </article>
  );
}
