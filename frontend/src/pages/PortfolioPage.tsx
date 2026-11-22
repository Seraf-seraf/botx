import {useState} from 'react';
import type {ReactElement} from 'react';
import {Link} from 'react-router-dom';
import {historySince, PriceChart} from '../features/market/PriceChart';
import type {AppSnapshot} from '../shared/data/contracts';
import {Badge} from '../shared/ui/Badge';
import {Card} from '../shared/ui/Card';
import {EmptyState} from '../shared/ui/EmptyState';
import {FilterChips} from '../shared/ui/FilterChips';
import {OperationList} from '../shared/ui/OperationList';
import {QuoteRow} from '../shared/ui/QuoteRow';
import {changePercent, formatBc, pluralCount, signedPercent} from '../shared/ui/market';
import styles from './Pages.module.css';

const segments = [
  {value: 'assets', label: 'Активы'},
  {value: 'history', label: 'История'},
] as const;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
  const prices = historySince(positions[0]?.quote.history ?? [], WEEK_MS);
  const curve = prices.map(({at}, index) => ({
    at,
    price: positions.reduce((sum, {quote, holding}) => sum +
      (quote.history.at(index - prices.length)?.price ?? quote.price) * holding.quantity, 0),
  }));

  return (
    <div className={`${styles.page} ${positions.length ? '' : styles.emptyPortfolio}`}>
      <h1>Портфель</h1>
      <Card className={`${styles.portfolioSummary} ${positions.length ? '' : styles.emptySummary}`}>
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
      {positions.length === 0 && segment === 'assets' ? (
        <EmptyState icon="briefcase" title="Пока нет акций" description="Выберите первого бота на бирже">
          <Link to="/" className={styles.emptyAction}>На биржу</Link>
        </EmptyState>
      ) : (
      <section className={styles.section} aria-labelledby="portfolio-holdings">
        <h2 id="portfolio-holdings">Мои акции</h2>
        <FilterChips label="Портфель" options={segments} value={segment} onChange={setSegment} />
        {segment === 'history' ? <OperationList operations={snapshot.operations.filter(({kind}) => kind !== 'bonus')} /> : (
            <>
              <p className={styles.tiny}>{pluralCount(positions.length, ['актив', 'актива', 'активов'])} · изменение цены за 7 дней</p>
              <ul className={styles.quoteList}>
                {positions.map(({quote, holding, value: total}) => (
                  <QuoteRow key={quote.symbol} quote={quote} from="/portfolio" amount={total} subtitle={pluralCount(holding.quantity, ['акция', 'акции', 'акций'])} />
                ))}
              </ul>
            </>
          )}
      </section>
      )}
    </div>
  );
}
