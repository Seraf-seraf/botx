import {useEffect, useRef, useState} from 'react';
import type {ReactElement, RefObject} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import type {AppDataSource, ListingApplication} from '../../shared/data/contracts';
import {Button} from '../../shared/ui/Button';
import {Icon} from '../../shared/ui/Icon';
import styles from './Admin.module.css';

type Stage = 'edit' | 'confirm' | 'reject' | 'pending' | 'unknown' | 'result';
const CENTS_PER_BC = 100;

export function ListingReviewPage({listings, source, backRef, onHeaderChange}: {listings: readonly ListingApplication[]; source: AppDataSource; backRef: RefObject<(() => void) | undefined>; onHeaderChange: (header: {title: string; brand: string}) => void}): ReactElement {
  const {applicationId} = useParams();
  const navigate = useNavigate();
  const application = listings.find((item) => item.id === applicationId);
  const [price, setPrice] = useState('100');
  const [quantity, setQuantity] = useState('10000');
  const [reason, setReason] = useState('');
  const [stage, setStage] = useState<Stage>('edit');
  const [error, setError] = useState('');
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const inFlight = useRef(false);
  const request = useRef('');
  const approveButton = useRef<HTMLButtonElement>(null);
  const rejectButton = useRef<HTMLButtonElement>(null);
  const previousStage = useRef<Stage>('edit');
  const parsed = /^\d+(?:[.,]\d{1,2})?$/.test(price) ? Number(price.replace(',', '.')) * CENTS_PER_BC : NaN;
  const cents = Math.round(parsed);
  const count = /^\d+$/.test(quantity) ? Number(quantity) : NaN;
  const valid = Number.isSafeInteger(cents) && cents > 0 && Number.isSafeInteger(count) && count > 0 && Number.isSafeInteger(cents * count);
  const money = (value: number): string => (value / CENTS_PER_BC).toLocaleString('ru-RU', {maximumFractionDigits: 2});
  const done = (): void => { void navigate('/admin/listings'); };
  useEffect(() => {
    const rejected = stage === 'reject' || stage === 'result' && decision === 'rejected' || stage === 'edit' && application?.status === 'rejected';
    const initial = stage === 'edit' && application?.status === 'pending' && !application.processing;
    onHeaderChange(initial ? {title: 'BOTX', brand: 'Заявка на листинг'} : {title: rejected ? 'Модерация' : 'Листинг', brand: 'BOTX'});
  }, [stage, decision, application?.status, application?.processing, onHeaderChange]);
  useEffect(() => {
    if (stage === 'edit' && previousStage.current === 'confirm') approveButton.current?.focus();
    if (stage === 'edit' && previousStage.current === 'reject') rejectButton.current?.focus();
    previousStage.current = stage;
  }, [stage]);
  useEffect(() => {
    backRef.current = (): void => {
      if (stage === 'pending' || stage === 'unknown' || application?.processing) return;
      if (stage === 'confirm' || stage === 'reject') setStage('edit');
      else void navigate('/admin/listings', {replace: true});
    };
    return () => { backRef.current = undefined; };
  }, [stage, navigate, backRef, application?.processing]);
  async function submit(kind: 'approved' | 'rejected'): Promise<void> {
    if (!application || inFlight.current) return;
    inFlight.current = true;
    setDecision(kind); setError(''); setStage('pending');
    const requestId = crypto.randomUUID();
    request.current = requestId;
    const result = await (kind === 'approved' ? source.approveListing(application.id, {price: cents, quantity: count}, requestId) : source.rejectListing(application.id, reason, requestId))
      .catch(() => ({ok: false as const, reason: 'unknown' as const}));
    inFlight.current = false;
    if (result.ok) setStage('result');
    else if (result.reason === 'unknown') setStage('unknown');
    else { setError('Не удалось сохранить решение. Попробуйте ещё раз.'); setStage(kind === 'approved' ? 'confirm' : 'reject'); }
  }
  if (!application || application.id !== 'study-bot') return <section key={stage} className={styles.page}><h1>Заявка не найдена</h1><Button onClick={done}>К заявкам</Button></section>;
  const actual = application.status === 'pending' ? decision : application.status;
  if (stage === 'result' || application.status !== 'pending' && stage === 'edit') return <section key={stage} className={styles.page}>
    <div className={styles.result}><span className={`${styles.resultIcon} ${actual === 'rejected' ? styles.resultIconRejected : ''}`}><Icon name={actual === 'approved' ? 'check' : 'x'} /></span><h1>{actual === 'approved' ? 'Бот размещён' : 'Заявка отклонена'}</h1><p>{actual === 'approved' ? 'Study Bot доступен на бирже.' : 'Причина сохранена. Акции не выпущены.'}</p></div>
    <div className={styles.card}><div className={styles.row}><span>Статус</span><span className={actual === 'approved' ? styles.success : styles.error}>{actual === 'approved' ? 'Размещён' : 'Отклонена'}</span></div>{actual === 'approved' && application.input && <><div className={styles.row}><span>Начальная цена</span><span>{money(application.input.price)} BC</span></div><div className={styles.row}><span>Выпущено</span><span>{application.input.quantity.toLocaleString('ru-RU')} шт.</span></div></>}</div><Button onClick={done}>К заявкам</Button>
  </section>;
  if (stage === 'pending' || application.processing && stage === 'edit') return <section key={stage} className={styles.page} aria-live="polite"><header><h1>Размещаем акции</h1><p>Study Bot</p></header><div className={styles.card}><strong>Операция выполняется</strong><p>Дождитесь завершения размещения.</p></div><Button busy>Размещаем...</Button></section>;
  if (stage === 'unknown') return <section key={stage} className={styles.page} aria-live="polite"><header><h1>Проверяем решение</h1><p>Результат пока неизвестен.</p></header><Button onClick={() => {
    const current = source.getListingApplications().find((item) => item.id === application.id && item.requestId === request.current);
    if (current && current.status !== 'pending') setStage('result');
    else setError('Результат пока неизвестен. Проверьте статус позже.');
  }}>Проверить статус</Button>{error && <p role="status">{error}</p>}</section>;
  if (stage === 'confirm') return <section key={stage} className={styles.page}><header><h1>Подтвердить листинг</h1><p>Study Bot / @study_bot</p></header><div className={styles.card}><div className={styles.row}><span>Начальная цена</span><span>{money(cents)} BC</span></div><div className={styles.row}><span>Выпуск</span><span>{count.toLocaleString('ru-RU')} шт.</span></div><div className={styles.row}><span>Капитализация</span><span>{money(cents * count)} BC</span></div></div><div className={styles.card}><strong className={styles.warning}>Проверьте параметры</strong><p>После размещения откроются торги.</p></div>{error && <p role="alert">{error}</p>}<Button onClick={() => void submit('approved')}>Разместить акции</Button><Button variant="secondary" onClick={() => setStage('edit')}>Назад к заявке</Button></section>;
  if (stage === 'reject') return <section key={stage} className={styles.page}><header><h1>Отклонить заявку</h1><p>Study Bot</p></header><div className={styles.card}><label htmlFor="reason">Причина отказа</label><input id="reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Например: не удалось подтвердить управление ботом." />{!reason.trim() && <p>Укажите причину отказа.</p>}</div><div className={styles.card}><strong className={styles.warning}>Заявитель увидит причину</strong><p>После исправления замечаний заявку можно отправить повторно.</p></div>{error && <p role="alert">{error}</p>}<Button disabled={!reason.trim()} onClick={() => void submit('rejected')}>Отклонить заявку</Button><Button variant="secondary" onClick={() => setStage('edit')}>Отмена</Button></section>;
  return <section key={stage} className={styles.page}><header><h1>Study Bot</h1><p>@study_bot</p></header><div className={styles.card}><div className={styles.row}><span>Управление ботом</span><span className={styles.success}>Подтверждено</span></div><div className={styles.row}><span>MAU</span><span>Нет данных</span></div><p>Отсутствие MAU не препятствует листингу.</p></div><label>Начальная цена акции<span className={styles.input}><input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} aria-invalid={!valid} /><span className={styles.unit}>BC</span></span></label><label>Количество акций<span className={styles.input}><input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-invalid={!valid} /><span className={styles.unit}>шт.</span></span></label>{!valid && <p role="alert">Укажите положительную цену с двумя знаками и целое количество акций.</p>}<div className={styles.card}><span>Начальная капитализация</span><h1>{valid ? money(cents * count) : '—'} BC</h1><p>Цена × количество акций</p></div><Button ref={approveButton} disabled={!valid} onClick={() => setStage('confirm')}>Одобрить листинг</Button><Button ref={rejectButton} variant="secondary" onClick={() => setStage('reject')}>Отклонить заявку</Button></section>;
}
