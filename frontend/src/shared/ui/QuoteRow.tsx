import type {ReactElement} from 'react';
import {Link} from 'react-router-dom';
import {historySince, PriceChart} from '../../features/market/PriceChart';
import type {Quote} from '../data/contracts';
import {Icon} from './Icon';
import {changePercent, formatBc, signedPercent} from './market';
import styles from './QuoteRow.module.css';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function AssetIcon({quote}: {quote: Quote}): ReactElement {
  return (
    <span className={`${styles.assetIcon} ${quote.symbol === 'QST' ? styles.questIcon : ''}`}>
      <Icon name={quote.icon} />
    </span>
  );
}

interface QuoteRowProps {
  quote: Quote;
  from: '/' | '/portfolio';
  amount?: number;
  subtitle?: string;
  spark?: boolean;
}

export function QuoteRow({
  quote, from, amount = quote.price, subtitle = quote.symbol, spark = false,
}: QuoteRowProps): ReactElement {
  const change = changePercent(quote.price, quote.priorPrice);
  const tone = change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
  return (
    <li className={styles.row}>
      <Link to={`/asset/${quote.symbol}`} state={{from}} className={styles.link}>
        <div className={styles.asset}>
          <AssetIcon quote={quote} />
          <div className={styles.identity}>
            <span className={styles.name}>{quote.name}</span>
            <span className={styles.caption}>{subtitle}</span>
          </div>
        </div>
        {spark && <PriceChart variant="spark" tone={tone} points={historySince(quote.history, WEEK_MS)} />}
        <div className={styles.value}>
          <span className={styles.amount}>{formatBc(amount)}</span>
          <span className={styles[tone]}>{signedPercent(change)}</span>
        </div>
      </Link>
    </li>
  );
}
