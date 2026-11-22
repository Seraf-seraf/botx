import {useState} from 'react';
import type {ReactElement} from 'react';
import {useNavigate} from 'react-router-dom';
import {PriceChart} from '../features/market/PriceChart';
import {TradeSheet} from '../features/trading/TradeSheet';
import type {AppSnapshot, OperationResult, PricePoint, Quote, TradeOrder, TradeSide} from '../shared/data/contracts';
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

function selectPoints(history: readonly PricePoint[], duration: number): readonly PricePoint[] {
  const latest = history.at(-1);
  if (!latest) return history;
  const startAt = latest.at - duration;
  const index = history.findIndex(({at}) => at >= startAt);
  return history.slice(Math.max(0, history[index]?.at === startAt ? index : index - 1));
}

interface AssetProps {
  quote: Quote;
  snapshot: AppSnapshot;
  side?: TradeSide;
  onBack: () => void;
  onTrade: (side: TradeSide, order: TradeOrder) => OperationResult;
}

export function AssetPage({quote, snapshot, side, onBack, onTrade}: AssetProps): ReactElement {
  const [range, setRange] = useState<Range>('week');
  const [feedback, setFeedback] = useState('');
  const navigate = useNavigate();
  const held = snapshot.holdings[quote.symbol]?.quantity ?? 0;
  const duration = ranges.find(({value}) => value === range)?.ms ?? 7 * DAY_MS;
  const points = selectPoints(quote.history, duration);
  const lastAt = points.at(-1)?.at;
  const change = changePercent(quote.price, range === 'week' ? quote.priorPrice : points[0]?.price ?? quote.price);
  const tone = change >= 0 ? 'positive' : 'negative';
  const axis = range === 'hour' || range === 'day' ? timeAxis : dateAxis;
  const period = range === 'hour' ? 'час' : range === 'day' ? '24 часа' : range === 'week' ? '7 дней' : '30 дней';

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
            <Button onClick={() => openTrade('buy')}>Купить</Button>
            <Button variant="secondary" onClick={() => openTrade('sell')}>Продать</Button>
          </div>
          <p className={styles.disclaimer}>Виртуальный рынок · демо</p>
        </>
      )}
      {feedback && <p role="status">{feedback}</p>}
      {side && (
        <TradeSheet
          key={side}
          quote={quote}
          side={side}
          balance={snapshot.balance}
          held={held}
          onClose={onBack}
          onConfirm={(quantity, price) => {
            const result = onTrade(side, {id: crypto.randomUUID(), symbol: quote.symbol, quantity, unitPrice: price});
            if (!result.ok) setFeedback('Операции будут доступны после подключения деморынка.');
            onBack();
          }}
        />
      )}
    </article>
  );
}
