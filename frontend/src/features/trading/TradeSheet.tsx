import {useEffect, useId, useRef, useState} from 'react';
import type {ReactElement} from 'react';
import {MAX_TRADE_QUANTITY} from '../../shared/data/contracts';
import type {FeeSettings, Operation, OperationResult, PaymentResult, PendingFinancialOperation, Quote, TradeSide} from '../../shared/data/contracts';
import {tradePreview} from '../../shared/data/trade-preview';
import {Button} from '../../shared/ui/Button';
import {Feedback} from '../../shared/ui/Feedback';
import {QuantityInput} from '../../shared/ui/QuantityInput';
import {Sheet, SheetClose} from '../../shared/ui/Sheet';
import {formatBc, shares} from '../../shared/ui/market';
import styles from './TradeSheet.module.css';

const START_QUANTITY = 3;
function money(amount: number): string { return formatBc(amount).replace(/,(\d) BC$/, ',$10 BC'); }

const errorMessages = {
  funds: 'Недостаточно BC. Уменьшите количество акций.',
  shares: 'Недостаточно акций для продажи.',
  'price-changed': 'Курс обновился. Проверьте сумму и подтвердите сделку.',
  invalid: 'Проверьте количество акций.',
  storage: 'Не удалось сохранить операцию. Попробуйте ещё раз.',
  claimed: 'Бонус уже получен.',
  unknown: 'Нет подтверждения. Проверьте статус исходной сделки.',
} as const;

interface TradeProps {
  quote: Quote;
  side: TradeSide;
  balance: number;
  held: number;
  fees: FeeSettings;
  unknownTradeId?: string;
  unknownOperation?: Operation;
  initialQuantity?: number;
  onCheckTrade: (id: string) => Promise<OperationResult>;
  onCheckPayment: (id: string) => Promise<PaymentResult>;
  onClose: () => void;
  onUnknownClose?: () => void;
  onPendingChange?: (pending: boolean) => void;
  onConfirm: (quantity: number, price: number, id: string, feeBps: number) => Promise<OperationResult>;
  onSuccess: (operation: Operation) => void;
}

export function TradeSheet({quote, side, balance, held, fees, unknownTradeId, unknownOperation, initialQuantity, onCheckTrade, onCheckPayment, onClose, onUnknownClose, onConfirm, onSuccess, onPendingChange}: TradeProps): ReactElement {
  const headingId = useId();
  const errorId = useId();
  const buying = side === 'buy';
  const limit = buying ? MAX_TRADE_QUANTITY : Math.min(held, MAX_TRADE_QUANTITY);
  const [quantity, setQuantity] = useState(Math.min(initialQuantity ?? START_QUANTITY, Math.max(1, limit)));
  const [preview, setPreview] = useState<{price: number; balance: number; held: number; feeBps: number}>();
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [blocker, setBlocker] = useState<PendingFinancialOperation>();
  const job = useRef<object | null>(null);
  const {price, balance: available, held: availableShares} = preview ?? {price: quote.price, balance, held};
  const feeBps = preview?.feeBps ?? (buying ? fees.buyBps : fees.sellBps);
  const {gross, fee, total: amount} = tradePreview(side, quantity, price, feeBps);
  const shortfall = buying ? Math.max(0, amount - available) : 0;
  const invalidQuantity = !Number.isSafeInteger(quantity) || quantity < 1 || quantity > limit;
  const canSubmit = !invalidQuantity && shortfall === 0 && !unknownTradeId && !blocker;
  const busy = preview !== undefined;
  const showingUnknown = Boolean(unknownTradeId) && (!busy || checking);

  useEffect(() => () => {
    job.current = null;
    onPendingChange?.(false);
  }, [onPendingChange]);

  async function finish(id: string, request: object): Promise<void> {
    let result: OperationResult;
    try {
      result = await onConfirm(quantity, price, id, feeBps);
    } catch {
      result = {ok: false, reason: 'storage'};
    }
    if (job.current !== request) return;
    job.current = null;
    onPendingChange?.(false);
    setPreview(undefined);
    if (result.ok) onSuccess(result.operation);
    else if (result.reason === 'blocked') setBlocker(result.blocker);
    else setError(result.reason === 'unknown' ? '' : errorMessages[result.reason]);
  }

  async function checkStatus(): Promise<void> {
    if (!unknownTradeId || job.current) return;
    const request = {};
    job.current = request;
    setError('');
    setChecking(true);
    setPreview({price, balance: available, held: availableShares, feeBps});
    let result: OperationResult;
    try { result = await onCheckTrade(unknownTradeId); }
    catch { result = {ok: false, reason: 'storage'}; }
    if (job.current !== request) return;
    job.current = null;
    setChecking(false);
    setPreview(undefined);
    if (result.ok) onSuccess(result.operation);
    else setError(result.reason === 'blocked' ? 'Сначала проверьте предыдущую операцию.' : errorMessages[result.reason]);
  }

  async function checkBlocker(): Promise<void> {
    if (!blocker || job.current) return;
    const request = {};
    job.current = request;
    setError('');
    setPreview({price, balance: available, held: availableShares, feeBps});
    onPendingChange?.(true);
    try {
      const result = blocker.kind === 'payment' ? await onCheckPayment(blocker.id) : await onCheckTrade(blocker.id);
      if (job.current !== request) return;
      if (result.ok) setBlocker(undefined);
      else setError('Не удалось проверить предыдущую операцию. Попробуйте ещё раз.');
    } catch {
      if (job.current === request) setError('Не удалось проверить предыдущую операцию. Попробуйте ещё раз.');
    } finally {
      if (job.current === request) {
        job.current = null;
        setPreview(undefined);
        onPendingChange?.(false);
      }
    }
  }

  function confirm(): void {
    if (!canSubmit || job.current) return;
    const id = crypto.randomUUID();
    setError('');
    setPreview({price, balance: available, held: availableShares, feeBps});
    const request = {};
    job.current = request;
    onPendingChange?.(true);
    void finish(id, request);
  }

  function close(): void {
    if (!job.current) onClose();
  }

  return (
    <Sheet className={styles.screen ?? ''} headingId={headingId} topTitle={buying ? 'Покупка' : 'Продажа'} closeDisabled={busy} onClose={close}>
      <form className={styles.body} onSubmit={(event) => {
        event.preventDefault();
        confirm();
      }}>
        <SheetClose className={styles.handle} aria-label="Закрыть форму сделки">
          <span aria-hidden="true" />
        </SheetClose>
        <h2 id={headingId}>{showingUnknown ? 'Проверяем операцию' : buying ? 'Покупка акций' : 'Продажа акций'}</h2>
        <p className={styles.caption}>{showingUnknown ? 'Связь прервалась.' : `${quote.name} / ${quote.symbol}`}</p>
        {showingUnknown ? <>
          <Feedback title="Результат пока неизвестен" description="Не повторяйте покупку. Проверим статус того же запроса, чтобы не списать BC дважды." />
          <dl className={styles.summary}>
            <div><dt>Актив</dt><dd>{unknownOperation?.symbol}</dd></div>
            <div><dt>Количество</dt><dd>{unknownOperation?.quantity} шт.</dd></div>
            <div><dt>Итого</dt><dd>{money(unknownOperation?.amount ?? 0)}</dd></div>
            <div><dt>Комиссия</dt><dd>{money(unknownOperation?.breakdown?.fee ?? 0)}</dd></div>
          </dl>
        </> : <>
        <QuantityInput
          value={quantity}
          max={Math.max(1, limit)}
          disabled={limit === 0 || busy}
          {...(shortfall || invalidQuantity ? {errorId} : {})}
          onChange={(value) => { setError(''); setQuantity(value); }}
        />
        <dl className={styles.summary}>
          <div><dt>Цена акции</dt><dd>{money(price)}</dd></div>
          <div><dt>Стоимость акций</dt><dd>{money(gross)}</dd></div>
          <div><dt>Комиссия ({feeBps / 100}%)</dt><dd>{money(fee)}</dd></div>
          <div><dt>{buying ? 'К списанию' : 'К зачислению'}</dt><dd className={shortfall ? styles.loss : undefined}>{money(amount)}</dd></div>
          <div><dt>{buying ? 'Доступно' : 'Акций в портфеле'}</dt><dd>{buying ? money(available) : `${availableShares} шт.`}</dd></div>
        </dl>
        </>}
        <div className={styles.feedback}>
          {shortfall > 0 && <Feedback id={errorId} title={`Не хватает ${money(shortfall)}`} description="Уменьшите количество акций" />}
          {!unknownTradeId && invalidQuantity && limit > 0 && <Feedback {...(shortfall ? {} : {id: errorId})} title={`Введите целое количество от 1 до ${limit}`} />}
          {limit === 0 && <Feedback title="У вас нет акций для продажи" />}
          {error && (error === errorMessages['price-changed']
            ? <div className={styles.reprice} role="alert"><strong>Цена изменилась</strong><p>Старая котировка недействительна. Проверьте новый расчёт.</p></div>
            : <Feedback title={error} />)}
          {blocker && <Feedback title="Сначала проверьте предыдущую операцию" description="Её результат пока не подтверждён." />}
          {busy && <div className={styles.pending} role="status"><strong>Операция выполняется</strong><p>Не отправляйте запрос повторно. Ожидаем подтверждение.</p></div>}
        </div>
        <div className={styles.action}>
          {blocker ? <Button key="blocker" busy={busy} type="button" onClick={() => void checkBlocker()}>Проверить предыдущую операцию</Button> : showingUnknown ? <Button key="check" busy={busy} type="button" onClick={(event) => { event.preventDefault(); void checkStatus(); }}>Проверить статус</Button> :
            <Button key="submit" busy={busy} disabled={!canSubmit} type="submit">
              {busy ? (buying ? 'Покупаем…' : 'Продаём…') : shortfall ? 'Недостаточно средств' : error === errorMessages['price-changed'] ? 'Подтвердить новую цену' : `${buying ? 'Купить' : 'Продать'} ${shares(quantity)}`}
            </Button>}
          {!busy && (showingUnknown ? <Button variant="secondary" onClick={onUnknownClose}>Вернуться на биржу</Button> : shortfall ?
            <Button variant="secondary" onClick={() => { setError(''); setQuantity(Math.max(1, quantity - 1)); }}>Уменьшить количество</Button> :
            <SheetClose className={styles.cancel}>Отмена</SheetClose>)}
        </div>
      </form>
    </Sheet>
  );
}
