import {useEffect, useRef, useState} from 'react';
import type {ReactElement, RefObject} from 'react';
import {useNavigate} from 'react-router-dom';
import type {AppDataSource, AppSnapshot, FeeSettings} from '../../shared/data/contracts';
import {Button} from '../../shared/ui/Button';
import {Icon} from '../../shared/ui/Icon';
import styles from './Admin.module.css';

type Stage = 'edit' | 'confirm' | 'saving' | 'saved' | 'error';
type FeeKey = keyof FeeSettings;
type Draft = Record<FeeKey, string>;
const BPS_PER_PERCENT = 100;
const MAX_PERCENT = 100;
const fields: readonly {key: FeeKey; label: string}[] = [
  {key: 'buyBps', label: 'Покупка'}, {key: 'sellBps', label: 'Продажа'},
  {key: 'transferBps', label: 'Перевод BC'}, {key: 'serviceBps', label: 'Оплата услуг'},
];

function toDraft(settings: FeeSettings): Draft {
  return {buyBps: format(settings.buyBps), sellBps: format(settings.sellBps),
    transferBps: format(settings.transferBps), serviceBps: format(settings.serviceBps)};
}

function format(bps: number): string {
  return (bps / BPS_PER_PERCENT).toLocaleString('ru-RU', {maximumFractionDigits: 2, useGrouping: false});
}

function parse(value: string): number | undefined {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return undefined;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  if (whole > MAX_PERCENT || whole === MAX_PERCENT && fraction > 0) return undefined;
  return whole * BPS_PER_PERCENT + fraction;
}

export function FeesPage({snapshot, source, backRef, onHeaderChange}: {
  snapshot: AppSnapshot; source: AppDataSource; backRef: RefObject<(() => void) | undefined>;
  onHeaderChange: (header: {title: string; brand: string}) => void;
}): ReactElement {
  const navigate = useNavigate();
  const pending = snapshot.feeSave?.status === 'unknown' ? snapshot.feeSave : undefined;
  const [draft, setDraft] = useState<Draft>(() => toDraft(pending?.settings ?? snapshot.fees));
  const [stage, setStage] = useState<Stage>(() => pending ? 'error' : 'edit');
  const [unknown, setUnknown] = useState(Boolean(pending));
  const [error, setError] = useState('');
  const request = useRef(pending?.requestId ?? '');
  const inFlight = useRef(false);
  const saveButton = useRef<HTMLButtonElement>(null);
  const previousStage = useRef<Stage>(stage);
  const values = fields.map(({key}) => parse(draft[key]));
  const valid = values.every((value) => value !== undefined);
  const settings: FeeSettings = {buyBps: values[0] ?? 0, sellBps: values[1] ?? 0, transferBps: values[2] ?? 0, serviceBps: values[3] ?? 0};
  useEffect(() => {
    onHeaderChange(stage === 'edit' ? {title: 'BOTX', brand: 'Администрирование'} : {title: 'Комиссии', brand: 'BOTX'});
  }, [stage, onHeaderChange]);
  useEffect(() => {
    if (stage === 'edit' && previousStage.current === 'confirm') saveButton.current?.focus();
    previousStage.current = stage;
  }, [stage]);
  useEffect(() => {
    backRef.current = (): void => {
      if (stage === 'saving' || stage === 'error' && unknown) return;
      if (stage === 'confirm' || stage === 'error' || stage === 'saved') setStage('edit');
      else void navigate('/admin/listings', {replace: true});
    };
    return () => { backRef.current = undefined; };
  }, [stage, unknown, backRef, navigate]);
  async function save(): Promise<void> {
    if (!valid || inFlight.current) return;
    inFlight.current = true;
    request.current = crypto.randomUUID();
    setStage('saving'); setError('');
    const result = await source.saveFeeSettings(settings, request.current).catch(() => ({ok: false as const, reason: 'unknown' as const}));
    inFlight.current = false;
    if (result.ok) { setDraft(toDraft(result.settings)); setUnknown(false); setStage('saved'); }
    else { setUnknown(result.reason === 'unknown'); setStage('error'); }
  }
  async function check(): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true; setError('');
    const result = await source.checkFeeSettings(request.current).catch(() => ({ok: false as const, reason: 'unknown' as const}));
    inFlight.current = false;
    if (result.ok) { setDraft(toDraft(result.settings)); setUnknown(false); setStage('saved'); }
    else if (!unknown && result.reason === 'invalid') setStage('edit');
    else setError('Не удалось проверить результат. Попробуйте снова.');
  }
  const summary = <div className={styles.card}>
    {fields.map(({key, label}) => <div className={styles.row} key={key}><span>{key === 'buyBps' ? 'Покупка акций' : key === 'sellBps' ? 'Продажа акций' : label}</span><span>{format(settings[key])}%</span></div>)}
    <div className={styles.row}><span>Награды и чтение</span><span>0%</span></div>
  </div>;
  if (stage === 'saved') return <section key={stage} className={styles.page}><div className={`${styles.result} ${styles.feeResult}`}><span className={styles.resultIcon}><Icon name="check" /></span><h1>Комиссии обновлены</h1><p>Новые параметры действуют для последующих операций.</p></div><div className={styles.card}>{settings.buyBps === settings.sellBps ? <div className={styles.row}><span>Торговля</span><span>{format(settings.buyBps)}%</span></div> : <><div className={styles.row}><span>Покупка акций</span><span>{format(settings.buyBps)}%</span></div><div className={styles.row}><span>Продажа акций</span><span>{format(settings.sellBps)}%</span></div></>}<div className={styles.row}><span>Статус</span><span className={styles.success}>Сохранено</span></div></div><Button onClick={() => setStage('edit')}>К комиссиям</Button></section>;
  if (stage === 'saving') return <section key={stage} className={styles.page} aria-live="polite"><header><h1>Сохраняем комиссии</h1><p>Дождитесь завершения операции.</p></header><Button busy>Сохраняем...</Button></section>;
  if (stage === 'error') return <section key={stage} className={styles.page} aria-live="polite"><header><h1>Не удалось сохранить</h1><p>{unknown ? 'Результат сохранения пока неизвестен.' : 'Изменение не подтверждено.'}</p></header><div className={`${styles.card} ${styles.feeMessage}`}><strong className={styles.warning}>Проверьте текущие правила</strong><p>{unknown ? 'Проверьте результат исходного сохранения.' : 'Проверьте действующие ставки. После проверки можно повторить сохранение.'}</p></div>{error && <p role="alert">{error}</p>}<Button onClick={() => void check()}>Проверить настройки</Button><Button variant="secondary" disabled={unknown} onClick={() => setStage('edit')}>Назад</Button></section>;
  if (stage === 'confirm') return <section key={stage} className={styles.page}><header><h1>Сохранить правила</h1><p>Проверьте новые ставки.</p></header>{summary}<div className={`${styles.card} ${styles.feeMessage}`}><strong>Применение</strong><p>Новые ставки используются для новых подтверждений. Старые операции не изменяются.</p></div><Button onClick={() => void save()}>Сохранить</Button><Button variant="secondary" onClick={() => setStage('edit')}>Продолжить редактирование</Button></section>;
  return <section key={stage} className={styles.page}><header><h1>Комиссии</h1><p>Правила для всех интерфейсов BOTX.</p></header>
    <div className={`${styles.card} ${styles.feeCard}`}><strong>Торговля акциями</strong>{fields.slice(0, 2).map(({key, label}) => <label className={styles.feeRow} key={key}>{label}<span className={styles.feeInput}><input aria-label={label} inputMode="decimal" value={draft[key]} onChange={(event) => setDraft({...draft, [key]: event.target.value})} aria-invalid={parse(draft[key]) === undefined} /><span>%</span></span></label>)}<p>При покупке комиссия сверху, при продаже вычитается из суммы.</p></div>
    <div className={`${styles.card} ${styles.feeCard} ${styles.feeOperations}`}><strong>Другие операции</strong>{fields.slice(2).map(({key, label}) => <label className={styles.feeRow} key={key}>{label}<span className={styles.feeInput}><input aria-label={label} inputMode="decimal" value={draft[key]} onChange={(event) => setDraft({...draft, [key]: event.target.value})} aria-invalid={parse(draft[key]) === undefined} /><span>%</span></span></label>)}<div className={styles.feeRow}>Получение награды <span className={styles.feeStatic}>0 <span>%</span></span></div><div className={styles.feeRow}>Запросы информации <span className={styles.feeStatic}>0 <span>%</span></span></div></div>
    {!valid && <p role="alert">Укажите значение от 0 до 100% с не более чем двумя знаками после запятой.</p>}
    <div className={styles.card}><p>Комиссии поступают на системный кошелёк BOTX.</p></div><Button ref={saveButton} disabled={!valid} onClick={() => setStage('confirm')}>Сохранить комиссии</Button>
  </section>;
}
