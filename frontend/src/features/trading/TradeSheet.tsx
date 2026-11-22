import {useId, useRef, useState} from 'react';
import type {ReactElement} from 'react';
import {MAX_TRADE_QUANTITY} from '../../shared/data/contracts';
import type {OperationResult, Quote, TradeSide} from '../../shared/data/contracts';
import {Button} from '../../shared/ui/Button';
import {QuantityInput} from '../../shared/ui/QuantityInput';
import {Sheet} from '../../shared/ui/Sheet';
import {formatBc, shares} from '../../shared/ui/market';
import styles from './TradeSheet.module.css';

const START_QUANTITY = 3;
const errorMessages = {
  funds: 'Недостаточно BC. Уменьшите количество акций.',
  shares: 'Недостаточно акций для продажи.',
  'price-changed': 'Курс обновился. Проверьте сумму и подтвердите сделку.',
  invalid: 'Проверьте количество акций.',
  storage: 'Не удалось сохранить операцию. Попробуйте ещё раз.',
  claimed: 'Бонус уже получен.',
} as const;

interface TradeProps {
  quote: Quote;
  side: TradeSide;
  balance: number;
  held: number;
  onClose: () => void;
  onConfirm: (quantity: number, price: number, id: string) => Promise<OperationResult>;
  onSuccess: (operation: Extract<OperationResult, {ok: true}>['operation']) => void;
}

export function TradeSheet({quote, side, balance, held, onClose, onConfirm, onSuccess}: TradeProps): ReactElement {
  const headingId = useId();
  const buying = side === 'buy';
  const limit = buying ? MAX_TRADE_QUANTITY : Math.min(held, MAX_TRADE_QUANTITY);
  const [quantity, setQuantity] = useState(Math.min(START_QUANTITY, Math.max(1, limit)));
  const [submittedPrice, setSubmittedPrice] = useState<number>();
  const [error, setError] = useState('');
  const submitted = useRef(false);
  const price = submittedPrice ?? quote.price;
  const amount = quantity * price;
  const canSubmit = quantity >= 1 && quantity <= limit && (!buying || amount <= balance);

  async function confirm(): Promise<void> {
    if (!canSubmit || submitted.current) return;
    submitted.current = true;
    setError('');
    setSubmittedPrice(price);
    try {
      const result = await onConfirm(quantity, price, crypto.randomUUID());
      if (result.ok) onSuccess(result.operation);
      else setError(errorMessages[result.reason]);
    } finally {
      submitted.current = false;
      setSubmittedPrice(undefined);
    }
  }

  const close = (): void => { if (!submitted.current) onClose(); };

  return (
    <Sheet headingId={headingId} onClose={close}>
      <form className={styles.body} onSubmit={(event) => {
        event.preventDefault();
        void confirm();
      }}>
        <button className={styles.handle} type="button" aria-label="Закрыть форму сделки" onClick={close}>
          <span aria-hidden="true" />
        </button>
        <h2 id={headingId}>{buying ? 'Покупка акций' : 'Продажа акций'}</h2>
        <p className={styles.caption}>{quote.name} · {quote.symbol}</p>
        <QuantityInput value={quantity} max={Math.max(1, limit)} disabled={limit === 0 || submittedPrice !== undefined} onChange={setQuantity} />
        <dl className={styles.summary}>
          <div><dt>Цена одной акции</dt><dd>{formatBc(price)}</dd></div>
          <div><dt>Итого</dt><dd>{formatBc(amount)}</dd></div>
          <div><dt>Доступно</dt><dd>{buying ? formatBc(balance) : `${held} шт.`}</dd></div>
        </dl>
        {error && <p role="alert">{error}</p>}
        <div className={styles.action}>
          <Button busy={submittedPrice !== undefined} disabled={!canSubmit} type="submit">{buying ? 'Купить' : 'Продать'} {shares(quantity)}</Button>
          <p>Только игровые средства.<br />Не реальные деньги.</p>
        </div>
      </form>
    </Sheet>
  );
}
