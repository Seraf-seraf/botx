import {useEffect, useId, useRef, useState} from 'react';
import type {ReactElement} from 'react';
import {MAX_TRADE_QUANTITY} from '../../shared/data/contracts';
import type {Operation, OperationResult, Quote, TradeSide} from '../../shared/data/contracts';
import {Button} from '../../shared/ui/Button';
import {Feedback} from '../../shared/ui/Feedback';
import {QuantityInput} from '../../shared/ui/QuantityInput';
import {Sheet} from '../../shared/ui/Sheet';
import {formatBc, shares} from '../../shared/ui/market';
import styles from './TradeSheet.module.css';

const START_QUANTITY = 3;
const SUBMIT_FEEDBACK_MS = 400;

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
  onSuccess: (operation: Operation) => void;
}

export function TradeSheet({quote, side, balance, held, onClose, onConfirm, onSuccess}: TradeProps): ReactElement {
  const headingId = useId();
  const errorId = useId();
  const buying = side === 'buy';
  const limit = buying ? MAX_TRADE_QUANTITY : Math.min(held, MAX_TRADE_QUANTITY);
  const [quantity, setQuantity] = useState(Math.min(START_QUANTITY, Math.max(1, limit)));
  const [preview, setPreview] = useState<{price: number; balance: number; held: number}>();
  const [error, setError] = useState('');
  const job = useRef<{timer: number} | null>(null);
  const {price, balance: available, held: availableShares} = preview ?? {price: quote.price, balance, held};
  const amount = quantity * price;
  const shortfall = buying ? Math.max(0, amount - available) : 0;
  const canSubmit = quantity >= 1 && quantity <= limit && shortfall === 0;
  const busy = preview !== undefined;

  useEffect(() => () => {
    if (job.current) window.clearTimeout(job.current.timer);
    job.current = null;
  }, []);

  async function finish(id: string, request: {timer: number}): Promise<void> {
    let result: OperationResult;
    try {
      result = await onConfirm(quantity, price, id);
    } catch {
      result = {ok: false, reason: 'storage'};
    }
    if (job.current !== request) return;
    job.current = null;
    setPreview(undefined);
    if (result.ok) onSuccess(result.operation);
    else setError(errorMessages[result.reason]);
  }

  function confirm(): void {
    if (!canSubmit || job.current) return;
    const id = crypto.randomUUID();
    setError('');
    setPreview({price, balance: available, held: availableShares});
    const request = {timer: window.setTimeout(() => { void finish(id, request); }, SUBMIT_FEEDBACK_MS)};
    job.current = request;
  }

  function close(): void {
    if (!job.current) onClose();
  }

  return (
    <Sheet headingId={headingId} topTitle={quote.name} closeDisabled={busy} onClose={close}>
      <form className={styles.body} onSubmit={(event) => {
        event.preventDefault();
        confirm();
      }}>
        <button className={styles.handle} type="button" aria-label="Закрыть форму сделки" disabled={busy} onClick={close}>
          <span aria-hidden="true" />
        </button>
        <h2 id={headingId}>{buying ? 'Покупка акций' : 'Продажа акций'}</h2>
        <p className={styles.caption}>{quote.name} · {quote.symbol}</p>
        <QuantityInput
          value={quantity}
          max={Math.max(1, limit)}
          disabled={limit === 0 || busy}
          {...(shortfall ? {errorId} : {})}
          onChange={(value) => { setError(''); setQuantity(value); }}
        />
        <dl className={styles.summary}>
          <div><dt>Цена одной акции</dt><dd>{formatBc(price)}</dd></div>
          <div><dt>Итого</dt><dd className={shortfall ? styles.loss : undefined}>{formatBc(amount)}</dd></div>
          <div><dt>Доступно</dt><dd>{buying ? formatBc(available) : `${availableShares} шт.`}</dd></div>
        </dl>
        <div className={styles.feedback}>
          {shortfall > 0 && <Feedback id={errorId} title={`Не хватает ${formatBc(shortfall)}`} description="Уменьшите количество акций" />}
          {limit === 0 && <Feedback title="У вас нет акций для продажи" />}
          {error && <Feedback title={error} />}
        </div>
        <div className={styles.action}>
          <Button busy={busy} disabled={!canSubmit} type="submit">
            {busy ? (buying ? 'Покупаем…' : 'Продаём…') : `${buying ? 'Купить' : 'Продать'} ${shares(quantity)}`}
          </Button>
          <p>Только игровые средства.<br />Не реальные деньги.</p>
        </div>
      </form>
    </Sheet>
  );
}
