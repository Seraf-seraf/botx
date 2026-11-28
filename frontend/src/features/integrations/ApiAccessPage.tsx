import {useEffect, useRef, useState} from 'react';
import type {ReactElement, RefObject} from 'react';
import {useNavigate} from 'react-router-dom';
import type {ApiScope, AppDataSource, AppSnapshot} from '../../shared/data/contracts';
import {API_KEY_MASK} from '../../shared/data/demo-fixtures';
import {Button} from '../../shared/ui/Button';
import {Icon} from '../../shared/ui/Icon';
import {ScopeFields} from './ScopeFields';
import styles from './Integrations.module.css';

type Stage = 'overview' | 'edit' | 'confirm-save' | 'confirm-revoke' | 'saving' | 'saved' | 'revoked' | 'error';

export function ApiAccessPage({snapshot, source, backRef, onHeaderChange}: {
  snapshot: AppSnapshot; source: AppDataSource; backRef: RefObject<(() => void) | undefined>;
  onHeaderChange: (header: {title: string; brand: string}) => void;
}): ReactElement {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('overview');
  const [draft, setDraft] = useState<readonly ApiScope[]>(snapshot.integrations.api.scopes);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState('');
  const request = useRef('');
  const action = useRef<'save' | 'revoke'>('save');
  const inFlight = useRef(false);
  const heading = useRef<HTMLElement>(null);
  const returning = useRef(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const overviewEdit = useRef<HTMLButtonElement>(null);
  const overviewRevoke = useRef<HTMLButtonElement>(null);
  const returnTarget = useRef<'edit' | 'revoke' | undefined>(undefined);
  useEffect(() => {
    onHeaderChange(stage === 'overview' && snapshot.integrations.api.connected ? {title: 'BOTX', brand: 'Интеграции'} : {title: 'Интеграции', brand: 'BOTX'});
    if (stage === 'overview' && returnTarget.current) {
      (returnTarget.current === 'edit' ? overviewEdit : overviewRevoke).current?.focus();
      returnTarget.current = undefined;
    } else if (returning.current && stage === 'edit') editButton.current?.focus();
    else if (stage !== 'overview') heading.current?.focus();
    returning.current = false;
  }, [stage, snapshot.integrations.api.connected, onHeaderChange]);
  useEffect(() => {
    backRef.current = (): void => {
      if (stage === 'saving' || stage === 'error' && unknown) return;
      if (stage === 'confirm-save') { returning.current = true; setStage('edit'); }
      else if (stage === 'edit' || stage === 'confirm-revoke' || stage === 'saved' || stage === 'revoked' || stage === 'error') {
        if (stage !== 'error') returnTarget.current = stage === 'confirm-revoke' ? 'revoke' : 'edit';
        setStage('overview');
      }
      else void navigate('/', {replace: true});
    };
    return () => { backRef.current = undefined; };
  }, [stage, unknown, backRef, navigate]);
  async function submit(kind: 'save' | 'revoke'): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true; action.current = kind; request.current = crypto.randomUUID(); setStage('saving'); setError('');
    const result = await (kind === 'save' ? source.saveApiAccess(draft, request.current) : source.revokeApiAccess(request.current)).catch(() => ({ok: false as const, reason: 'unknown' as const}));
    inFlight.current = false;
    if (result.ok) { setDraft(result.access.scopes); setUnknown(false); setStage(kind === 'save' ? 'saved' : 'revoked'); }
    else { setUnknown(result.reason === 'unknown'); setError(result.reason === 'unknown' ? 'Результат операции пока неизвестен.' : 'Изменение не сохранено. Попробуйте снова.'); setStage('error'); }
  }
  async function check(): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    const result = await source.checkApiAccess(request.current).catch(() => ({ok: false as const, reason: 'unknown' as const}));
    inFlight.current = false;
    if (result.ok) { setDraft(result.access.scopes); setUnknown(false); setStage(action.current === 'save' ? 'saved' : 'revoked'); }
    else setError('Не удалось проверить результат. Попробуйте снова.');
  }
  const header = (title: string, description?: string): ReactElement => <header ref={heading} tabIndex={-1}><h1>{title}</h1>{description && <p>{description}</p>}</header>;
  if (stage === 'saving') return <section key={stage} className={styles.page} aria-live="polite">{header('Сохраняем доступ', 'Дождитесь завершения операции.')}<Button busy>Сохраняем...</Button></section>;
  if (stage === 'error') return <section key={stage} className={styles.page} aria-live="polite">{header('Не удалось подтвердить доступ')}<p role="alert">{error}</p>{unknown ? <Button onClick={() => void check()}>Проверить результат</Button> : <Button onClick={() => setStage(action.current === 'save' ? 'confirm-save' : 'confirm-revoke')}>Назад</Button>}</section>;
  if (stage === 'saved' || stage === 'revoked') return <section key={stage} className={styles.page} aria-live="polite"><div className={styles.result}><span className={`${styles.resultIcon} ${stage === 'revoked' ? styles.revokedIcon : ''}`}><Icon name={stage === 'saved' ? 'check' : 'x'} /></span>{header(stage === 'saved' ? 'Доступ сохранён' : 'Ключ отозван', stage === 'saved' ? 'Новые запросы проверяются по актуальным полномочиям.' : 'Бот больше не может выполнять запросы с этим ключом.')}</div>{stage === 'revoked' && <div className={styles.card}><div className={styles.row}><span>Статус</span><strong className={styles.denied}>Отключён</strong></div></div>}<Button onClick={() => { returnTarget.current = 'edit'; setStage('overview'); }}>{stage === 'saved' ? 'К интеграции' : 'Назад к подключению'}</Button></section>;
  if (stage === 'confirm-revoke') return <section key={stage} className={`${styles.page} ${styles.confirm}`}>{header('Отозвать API-ключ?', 'Study Bot')}<div className={styles.card}><strong className={styles.warning}>Бот потеряет доступ</strong><p>Новые запросы с этим ключом будут отклонены. Уже исполненные платежи сохранятся.</p></div><div className={styles.card}>{API_KEY_MASK}</div><Button onClick={() => void submit('revoke')}>Отозвать ключ</Button><Button variant="secondary" onClick={() => { returnTarget.current = 'revoke'; setStage('overview'); }}>Отмена</Button></section>;
  if (stage === 'confirm-save') return <section key={stage} className={`${styles.page} ${styles.confirm}`}>{header('Сохранить доступ?', 'Проверьте выбранные разрешения.')}<div className={styles.card}>{draft.map((scope) => <span key={scope}>{({quotes: 'Котировки', history: 'Своя история', rewards: 'Награды', payments: 'Запросы оплаты'})[scope]}</span>)}{draft.length === 0 && <span>Нет разрешений</span>}</div><Button onClick={() => void submit('save')}>Подтвердить</Button><Button variant="secondary" onClick={() => { returning.current = true; setStage('edit'); }}>Отмена</Button></section>;
  if (stage === 'edit') return <section key={stage} className={styles.page}>{header('Доступ бота', 'Study Bot / HTTP API')}<div className={styles.card}><ScopeFields scopes={draft} onChange={setDraft} /></div><div className={styles.card}><strong>Права пользователя</strong><p>Запрос на оплату не означает разрешение на списание. Нужна авторизация платежа.</p></div><Button ref={editButton} onClick={() => setStage('confirm-save')}>Сохранить доступ</Button><Button variant="secondary" onClick={() => { returnTarget.current = 'edit'; setStage('overview'); }}>Отмена</Button></section>;
  if (!snapshot.integrations.api.connected) return <section key={stage} className={styles.page}>{header('Подключение бота', 'Study Bot / HTTP API')}<div className={styles.card}><strong className={styles.denied}>Ключ отозван</strong><p>Действующего API-ключа нет. Запросы с прежним ключом отклоняются.</p></div><Button ref={overviewEdit} onClick={() => { setDraft(snapshot.integrations.api.scopes); setStage('edit'); }}>Подключить заново</Button></section>;
  return <section key={stage} className={styles.page}>{header('Подключение бота', 'HTTP API для обычного Telegram-бота.')}<div className={styles.card}><div className={styles.status}><strong>Study Bot</strong><span>Подключён</span></div><p>Листинг на бирже не требуется.</p></div><div className={styles.card}><strong>API-ключ</strong><div className={styles.status}><span>{API_KEY_MASK}</span><small>Скрыт</small></div><small>Токен Telegram передавать не нужно.</small></div><div className={styles.card}><h2>Возможности</h2>{[{label: 'Выдача наград', help: 'Из собственного кошелька бота', scope: 'rewards'}, {label: 'Запрос оплаты', help: 'Пользователь подтверждает платёж', scope: 'payments'}, {label: 'Баланс и история', help: 'Доступ только в рамках разрешений', scope: 'history'}].map(({label, help, scope}) => <div className={styles.capability} key={scope}><div><strong>{label}</strong><small>{help}</small></div>{snapshot.integrations.api.scopes.includes(scope as ApiScope) && <Icon name="check" />}</div>)}</div><div className={styles.card}><strong>Webhook платежей</strong><p>Уведомление о завершённой операции</p></div><Button ref={overviewEdit} onClick={() => { setDraft(snapshot.integrations.api.scopes); setStage('edit'); }}>Настроить доступ</Button><Button ref={overviewRevoke} variant="secondary" onClick={() => setStage('confirm-revoke')}>Отозвать ключ</Button></section>;
}
