import {useId, useState} from 'react';
import type {ReactElement} from 'react';
import type {Quote, TradeSide} from '../../shared/data/contracts';
import {Button} from '../../shared/ui/Button';
import {QuantityInput} from '../../shared/ui/QuantityInput';
import {Sheet} from '../../shared/ui/Sheet';
import {formatBc, shares} from '../../shared/ui/market';
import styles from './TradeSheet.module.css';

const START_QUANTITY = 3;
const MAX_TRADE_QUANTITY = 999;

interface TradeProps {
  quote: Quote;
  side: TradeSide;
  balance: number;
  held: number;
  onClose: () => void;
  onConfirm: (quantity: number, price: number) => void;
}

export function TradeSheet({quote, side, balance, held, onClose, onConfirm}: TradeProps): ReactElement {
  const headingId = useId();
  const buying = side === 'buy';
  const limit = buying ? MAX_TRADE_QUANTITY : Math.min(held, MAX_TRADE_QUANTITY);
  const [quantity, setQuantity] = useState(Math.min(START_QUANTITY, Math.max(1, limit)));
  const amount = quantity * quote.price;
  const canSubmit = quantity >= 1 && quantity <= limit && (!buying || amount <= balance);

  return (
    <Sheet headingId={headingId} onClose={onClose}>
      <form className={styles.body} onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onConfirm(quantity, quote.price);
      }}>
        <button className={styles.handle} type="button" aria-label="Закрыть форму сделки" onClick={onClose}>
          <span aria-hidden="true" />
        </button>
        <h2 id={headingId}>{buying ? 'Покупка акций' : 'Продажа акций'}</h2>
        <p className={styles.caption}>{quote.name} · {quote.symbol}</p>
        <QuantityInput value={quantity} max={Math.max(1, limit)} disabled={limit === 0} onChange={setQuantity} />
        <dl className={styles.summary}>
          <div><dt>Цена одной акции</dt><dd>{formatBc(quote.price)}</dd></div>
          <div><dt>Итого</dt><dd>{formatBc(amount)}</dd></div>
          <div><dt>Доступно</dt><dd>{buying ? formatBc(balance) : `${held} шт.`}</dd></div>
        </dl>
        <div className={styles.action}>
          <Button disabled={!canSubmit} type="submit">{buying ? 'Купить' : 'Продать'} {shares(quantity)}</Button>
          <p>Только игровые средства.<br />Не реальные деньги.</p>
        </div>
      </form>
    </Sheet>
  );
}
