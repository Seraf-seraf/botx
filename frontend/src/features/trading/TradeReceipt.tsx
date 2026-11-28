import type {ReactElement} from 'react';
import {Link} from 'react-router-dom';
import type {Operation, Quote} from '../../shared/data/contracts';
import {Card} from '../../shared/ui/Card';
import {Icon} from '../../shared/ui/Icon';
import {formatBc, pluralCount} from '../../shared/ui/market';
import styles from './TradeReceipt.module.css';

function money(amount: number): string { return formatBc(amount).replace(/,(\d) BC$/, ',$10 BC'); }

interface ReceiptProps {
  operation: Operation;
  quote: Quote;
  balance: number;
  held: number;
}

export function TradeReceipt({operation, quote, balance, held}: ReceiptProps): ReactElement {
  const buying = operation.kind === 'buy';
  const quantity = pluralCount(operation.quantity ?? 0, ['акция', 'акции', 'акций']);

  return (
    <section className={styles.receipt} aria-labelledby="trade-done">
      <div className={styles.icon}><Icon name="check" size={24} /></div>
      <h1 id="trade-done">{buying ? 'Куплено' : 'Продано'} {quantity}</h1>
      <p className={styles.caption}>{quote.name} / {quote.symbol}</p>
      <Card className={styles.summary ?? ''}>
        <dl>
          {operation.breakdown && <>
            <div><dt>Стоимость акций</dt><dd>{money(operation.breakdown.gross)}</dd></div>
            <div><dt>Комиссия ({operation.breakdown.feeBps / 100}%)</dt><dd>{money(operation.breakdown.fee)}</dd></div>
          </>}
          <div className={styles.total}><dt>{buying ? 'Списано' : 'Зачислено'}</dt><dd>{money(operation.amount)}</dd></div>
          <div><dt>Остаток BC</dt><dd>{money(balance)}</dd></div>
          <div><dt>Акций {quote.name}</dt><dd>{held} шт.</dd></div>
        </dl>
      </Card>
      <Link className={styles.cta} to={`/portfolio/after?id=${encodeURIComponent(operation.id)}`} replace>В портфель</Link>
    </section>
  );
}
