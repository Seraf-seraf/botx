import type {ReactElement} from 'react';
import {Link} from 'react-router-dom';
import type {Operation, Quote} from '../../shared/data/contracts';
import {Card} from '../../shared/ui/Card';
import {Icon} from '../../shared/ui/Icon';
import {formatBc, pluralCount} from '../../shared/ui/market';
import styles from './TradeReceipt.module.css';

interface ReceiptProps {
  operation: Operation;
  quote: Quote;
  balance: number;
}

export function TradeReceipt({operation, quote, balance}: ReceiptProps): ReactElement {
  const buying = operation.kind === 'buy';
  const quantity = pluralCount(operation.quantity ?? 0, ['акция', 'акции', 'акций']);

  return (
    <section className={styles.receipt} aria-labelledby="trade-done">
      <div className={styles.icon}><Icon name="check" size={32} /></div>
      <h1 id="trade-done">{buying ? 'Куплено' : 'Продано'} {quantity}<br />{quote.name}</h1>
      <p className={styles.caption}>{buying ? 'Акции добавлены в портфель' : 'Боткоины зачислены на баланс'}</p>
      <Card className={styles.summary ?? ''}>
        <dl>
          <div><dt>{buying ? 'Списано' : 'Зачислено'}</dt><dd>{formatBc(operation.amount)}</dd></div>
          <div><dt>Остаток</dt><dd>{formatBc(balance)}</dd></div>
        </dl>
      </Card>
      <Link className={styles.cta} to="/portfolio" replace>В портфель</Link>
      <p className={styles.disclaimer}>Только игровые средства</p>
    </section>
  );
}
