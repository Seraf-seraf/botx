import {useId, useRef, useState} from 'react';
import type {ReactElement} from 'react';
import {MAX_FEE_BPS} from '../../shared/data/contracts';
import type {AppSnapshot, PaymentRequest, PaymentResult} from '../../shared/data/contracts';
import {Button} from '../../shared/ui/Button';
import {Card} from '../../shared/ui/Card';
import {Feedback} from '../../shared/ui/Feedback';
import {Icon} from '../../shared/ui/Icon';
import {Sheet} from '../../shared/ui/Sheet';
import {formatBc} from '../../shared/ui/market';
import styles from './PaymentPage.module.css';

function money(amount: number): string { return formatBc(amount).replace(/,(\d) BC$/, ',$10 BC'); }

interface PaymentProps {
  request?: PaymentRequest | undefined;
  snapshot: AppSnapshot;
  onPay(id: string, requestId: string, total: number): Promise<PaymentResult>;
  onCancel(id: string): Promise<PaymentResult>;
  onCheck(requestId: string): Promise<PaymentResult>;
  onDone(): void;
  onPendingChange(pending: boolean): void;
}

export function PaymentPage({request, snapshot, onPay, onCancel, onCheck, onDone, onPendingChange}: PaymentProps): ReactElement {
  const headingId = useId();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const requestId = useRef<string | undefined>(undefined);
  const fee = request ? Math.round(request.amount * snapshot.fees.serviceBps / MAX_FEE_BPS) : 0;
  const total = request ? request.amount + fee : 0;
  const status = pending ? 'pending' : request?.status;

  async function run(action: () => Promise<PaymentResult>): Promise<void> {
    if (active.current) return;
    active.current = true;
    setPending(true);
    onPendingChange(true);
    setError('');
    setConfirming(false);
    let result: PaymentResult;
    try { result = await action(); }
    catch { result = {ok: false, reason: 'storage'}; }
    active.current = false;
    setPending(false);
    onPendingChange(false);
    if (!result.ok && result.reason !== 'unknown') {
      setError(result.reason === 'price-changed' ? 'Сумма изменилась. Проверьте расчёт и подтвердите платёж снова.' :
        result.reason === 'funds' ? 'Недостаточно средств для оплаты.' :
          result.reason === 'storage' ? 'Не удалось сохранить платёж. Попробуйте ещё раз.' : 'Запрос недействителен.');
      if (result.reason === 'price-changed') requestId.current = undefined;
    }
  }

  function pay(): void {
    if (!request || active.current) return;
    requestId.current ??= crypto.randomUUID();
    void run(() => onPay(request.id, requestId.current ?? '', total));
  }

  if (!request) return <div className={styles.page}><h1>Запрос не найден</h1><Feedback title="Проверьте ссылку на оплату." /><Button onClick={onDone}>К балансу</Button></div>;

  return (
    <div className={styles.page} data-status={status} aria-live="polite">
      {status === 'open' && <>
        <div><h1>Запрос на оплату</h1><p className={styles.caption}>{request.recipient}</p></div>
        <Card className={styles.card ?? ''}><h2>{request.serviceName}</h2><dl>
          <div><dt>Стоимость</dt><dd>{money(request.amount)}</dd></div>
          <div><dt>Комиссия ({snapshot.fees.serviceBps / 100}%)</dt><dd>{money(fee)}</dd></div>
          <div><dt>К списанию</dt><dd>{money(total)}</dd></div>
          <div><dt>Доступно</dt><dd>{money(snapshot.balance)}</dd></div>
        </dl></Card>
        <Card className={styles.note ?? ''}><strong>Разовый платёж</strong><p>Оплата проводится только после подтверждения. Доступ к кошельку не выдаётся.</p></Card>
        {error && <Feedback title={error} />}
        <Button disabled={snapshot.balance < total} onClick={() => setConfirming(true)}>Оплатить {money(total)}</Button>
        {snapshot.balance < total && <Feedback title="Недостаточно средств для оплаты." />}
        <Button variant="secondary" onClick={() => { void run(() => onCancel(request.id)); }}>Отказаться</Button>
      </>}
      {status === 'pending' && <>
        <div><h1>Выполняем платёж</h1><p className={styles.caption}>{request.recipient}</p></div>
        <Card className={styles.card ?? ''}><dl><div><dt>К списанию</dt><dd>{money(request.total ?? total)}</dd></div><div><dt>Статус</dt><dd className={styles.warning}>Ожидаем ответ</dd></div></dl></Card>
        <Card className={styles.note ?? ''}><strong>Не отправляйте повторно</strong><p>Статус платежа проверяется по тому же запросу.</p></Card>
        <Button busy>Оплачиваем...</Button>
      </>}
      {status === 'unknown' && <>
        <div><h1>Проверяем платёж</h1><p className={styles.caption}>{request.recipient}</p></div>
        <Card className={styles.note ?? ''}><strong className={styles.warning}>Нет подтверждения</strong><p>Не оплачивайте повторно. Проверим результат исходного запроса.</p></Card>
        <Card className={styles.amount ?? ''}><strong>{money(request.total ?? total)}</strong><p>Списание пока не подтверждено.</p></Card>
        {error && <Feedback title={error} />}
        <Button onClick={() => { if (request.requestId) void run(() => onCheck(request.requestId ?? '')); }}>Проверить статус</Button>
      </>}
      {status === 'paid' && <>
        <div className={styles.resultIcon}><Icon name="check" /></div><h1>Платёж выполнен</h1>
        <p className={styles.resultCaption}>Бот получает уведомление о завершённой операции.</p>
        <Card className={styles.card ?? ''}><dl><div><dt>Получатель</dt><dd>{request.recipient}</dd></div><div><dt>Списано</dt><dd>{money(request.total ?? total)}</dd></div><div><dt>Остаток</dt><dd>{money(request.balanceAfter ?? snapshot.balance)}</dd></div></dl></Card>
        <Button onClick={onDone}>Готово</Button>
      </>}
      {status === 'canceled' && <>
        <div className={`${styles.resultIcon} ${styles.neutral}`}><Icon name="help-circle" /></div><h1>Платёж отменён</h1>
        <p className={styles.resultCaption}>Средства не списаны. Для оплаты нужен новый действующий запрос.</p>
        <Card className={styles.card ?? ''}><dl><div><dt>Статус</dt><dd>Отменён</dd></div></dl></Card><Button onClick={onDone}>Готово</Button>
      </>}
      {status === 'expired' && <><div><h1>Запрос недействителен</h1><p className={styles.caption}>Срок оплаты истёк или запрос отозван.</p></div>
        <Card className={styles.note ?? ''}><strong className={styles.warning}>Средства не списаны</strong><p>Откройте бота и запросите новую оплату.</p></Card><Button onClick={onDone}>Закрыть</Button></>}
      {confirming && <Sheet headingId={headingId} topTitle="Подтверждение" onClose={() => setConfirming(false)}>
        <div className={styles.confirm}><h2 id={headingId}>Подтвердите оплату</h2><p>{request.recipient} · {money(total)}</p>
          <Button onClick={pay}>Подтвердить {money(total)}</Button><Button variant="secondary" onClick={() => setConfirming(false)}>Отмена</Button></div>
      </Sheet>}
    </div>
  );
}
