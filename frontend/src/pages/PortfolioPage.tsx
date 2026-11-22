import {useState} from 'react';
import type {ReactElement} from 'react';
import {Link} from 'react-router-dom';
import {PriceChart} from '../features/market/PriceChart';
import type {AppSnapshot} from '../shared/data/contracts';
import {Badge} from '../shared/ui/Badge';
import {Card} from '../shared/ui/Card';
import {FilterChips} from '../shared/ui/FilterChips';
import {OperationList} from '../shared/ui/OperationList';
import {QuoteRow} from '../shared/ui/QuoteRow';
import {changePercent, formatBc, pluralCount, signedPercent} from '../shared/ui/market';
import styles from './Pages.module.css';

const segments = [
  {value: 'assets', label: 'Активы'},
  {value: 'history', label: 'История'},
] as const;

type Segment = (typeof segments)[number]['value'];

export function PortfolioPage({snapshot}: {snapshot: AppSnapshot}): ReactElement {
  const [segment, setSegment] = useState<Segment>('assets');
  const positions = snapshot.quotes.flatMap((quote) => {
    const holding = snapshot.holdings[quote.symbol];
    return holding ? [{quote, holding, value: quote.price * holding.quantity}] : [];
  }).sort((left, right) => right.value - left.value);
  const value = positions.reduce((sum, position) => sum + position.value, 0);
  const cost = positions.reduce((sum, position) => sum + position.holding.cost, 0);
  const profit = value - cost;
  const tone = profit >= 0 ? 'positive' : 'negative';
  const prices = positions[0]?.quote.history.slice(-85) ?? [];
  const curve = prices.map(({at}, index) => ({
    at,
    price: positions.reduce((sum, {quote, holding}) => sum +
      (quote.history.at(index - prices.length)?.price ?? quote.price) * holding.quantity, 0),
  }));

  return (
    <div className={styles.page}>
      <h1>Портфель</h1>
      <Card className={styles.portfolioSummary ?? ''}>
        <p className={styles.caption}>Стоимость активов</p>
        <strong className={styles.total}>{formatBc(value)}</strong>
        {positions.length > 0 && (
          <>
            <div>
              <Badge tone={tone}>
                {profit >= 0 ? '↗ +' : '↘ −'}{formatBc(Math.abs(profit))} ({signedPercent(changePercent(value, cost))})
              </Badge>
            </div>
            <PriceChart variant="card" tone={tone} points={curve} />
            <p className={styles.axisLabel}>7 дней</p>
          </>
        )}
      </Card>
      <section className={styles.section} aria-labelledby="portfolio-holdings">
        <h2 id="portfolio-holdings">Мои акции</h2>
        <FilterChips label="Портфель" options={segments} value={segment} onChange={setSegment} />
        {segment === 'history' ? <OperationList operations={snapshot.operations.filter(({kind}) => kind !== 'bonus')} /> :
          positions.length ? (
            <>
              <p className={styles.tiny}>{pluralCount(positions.length, ['актив', 'актива', 'активов'])} · изменение цены за 7 дней</p>
              <ul className={styles.quoteList}>
                {positions.map(({quote, holding, value: total}) => (
                  <QuoteRow key={quote.symbol} quote={quote} from="/portfolio" amount={total} subtitle={pluralCount(holding.quantity, ['акция', 'акции', 'акций'])} />
                ))}
              </ul>
            </>
          ) : <p className={styles.empty}>Пока нет акций. <Link to="/">На биржу</Link></p>}
      </section>
    </div>
  );
}
