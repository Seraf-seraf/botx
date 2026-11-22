import {useEffect, useRef, useState} from 'react';
import type {ReactElement} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {historySince, PriceChart} from '../features/market/PriceChart';
import type {AppSnapshot, PricePoint, Quote} from '../shared/data/contracts';
import {Badge} from '../shared/ui/Badge';
import {Card} from '../shared/ui/Card';
import {EmptyState} from '../shared/ui/EmptyState';
import {ErrorState} from '../shared/ui/ErrorState';
import {Button} from '../shared/ui/Button';
import {LoadingIndex, LoadingState} from '../shared/ui/LoadingState';
import {FilterChips} from '../shared/ui/FilterChips';
import {QuoteRow} from '../shared/ui/QuoteRow';
import {SearchField} from '../shared/ui/SearchField';
import {formatBc, formatNumber, pluralCount, signedPercent} from '../shared/ui/market';
import styles from './Pages.module.css';

const filters = [
  {value: 'all', label: 'Все'},
  {value: 'up', label: 'Растут'},
  {value: 'down', label: 'Падают'},
  {value: 'new', label: 'Новые'},
] as const;

type Filter = (typeof filters)[number]['value'];
const INDEX_BASE = 1284.6;
const INDEX_OPEN_TOTAL = 83_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_CHANGE_AT_OPEN = 2.8;
const DEMO_LOADING_MS = 850;

function matchesFilter(quote: Quote, filter: Filter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'up': return quote.price > quote.priorPrice;
    case 'down': return quote.price < quote.priorPrice;
    case 'new': return quote.isNew;
  }
}

function indexPoints(quotes: readonly Quote[]): PricePoint[] {
  const first = quotes[0]?.history ?? [];
  return historySince(first, DAY_MS).map(({at}, index, window) => ({
    at,
    price: quotes.reduce((sum, quote) => sum + (
      quote.history.at(index - window.length)?.price ?? quote.price
    ), 0),
  }));
}

export function MarketPage({snapshot}: {snapshot: AppSnapshot}): ReactElement {
  const [params, setParams] = useSearchParams();
  const phase = params.get('demo');
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const search = query.trim().toLocaleLowerCase('ru-RU');
  const quotes = snapshot.quotes.filter((quote) => matchesFilter(quote, filter) &&
    `${quote.name} ${quote.symbol}`.toLocaleLowerCase('ru-RU').includes(search));
  const empty = phase !== 'loading' && phase !== 'error' && quotes.length === 0;
  useEffect(() => {
    if (phase !== 'loading') return undefined;
    const timer = window.setTimeout(() => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        next.delete('demo');
        return next;
      }, {replace: true});
    }, DEMO_LOADING_MS);
    return () => window.clearTimeout(timer);
  }, [phase, setParams]);

  function reset(): void {
    setQuery('');
    setFilter('all');
    input.current?.focus();
  }

  const index = snapshot.quotes.reduce((total, quote) => total + quote.price, 0);
  const change = (index / INDEX_OPEN_TOTAL * (1 + DAY_CHANGE_AT_OPEN / 100) - 1) * 100;

  return (
    <div className={`${styles.market} ${empty || phase === 'error' ? styles.marketState : ''}`} data-view={empty ? 'empty-search' : phase ?? undefined}>
      <div className={styles.heading}>
        <h1>Биржа</h1>
        <Link to="/balance" className={styles.balanceLink} aria-label={`Баланс: ${formatBc(snapshot.balance)}`}>
          <Badge>{formatBc(snapshot.balance)}</Badge>
        </Link>
      </div>
      {phase === 'error' ? (
        <ErrorState onRetry={() => setParams({demo: 'loading'}, {replace: true})} />
      ) : (
        <>
          <SearchField value={query} onChange={setQuery} inputRef={input} />
          {empty ? (
            <EmptyState icon="search" title="Бот не найден" description="Попробуйте другое название">
              <Button variant="secondary" onClick={reset}>Сбросить поиск</Button>
            </EmptyState>
          ) : (
            <>
              {phase === 'loading' ? (
                <LoadingIndex />
              ) : (
                <Card className={styles.marketIndex ?? ''}>
                  <div className={styles.indexValue}>
                    <span className={styles.caption}>Индекс BOTX</span>
                    <strong>{formatNumber(INDEX_BASE * index / INDEX_OPEN_TOTAL)}</strong>
                    <span className={change >= 0 ? styles.gain : styles.loss}>{signedPercent(change)} за 24 ч</span>
                  </div>
                  <PriceChart variant="card" tone={change >= 0 ? 'positive' : 'negative'} points={indexPoints(snapshot.quotes)} />
                </Card>
              )}
              <FilterChips label="Фильтр котировок" options={filters} value={filter} onChange={setFilter} />
              {phase === 'loading' ? (
                <LoadingState />
              ) : (
                <section aria-labelledby="market-assets">
                  <div className={styles.heading}>
                    <h2 id="market-assets">Акции ботов</h2>
                    <span className={styles.tiny}>{pluralCount(quotes.length, ['актив', 'актива', 'активов'])}</span>
                  </div>
                  <p className={styles.listCaption}>Изменение цены за 7 дней</p>
                  <ul className={styles.quoteList}>
                    {quotes.map((quote) => <QuoteRow key={quote.symbol} quote={quote} from="/" spark />)}
                  </ul>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
