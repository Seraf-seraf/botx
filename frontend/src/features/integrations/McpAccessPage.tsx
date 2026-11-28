import {useEffect, useRef, useState} from 'react';
import type {ReactElement, RefObject} from 'react';
import {useNavigate} from 'react-router-dom';
import type {AppDataSource, AppSnapshot, McpScope} from '../../shared/data/contracts';
import {Button} from '../../shared/ui/Button';
import {Icon} from '../../shared/ui/Icon';
import {McpScopeFields} from './ScopeFields';
import styles from './Integrations.module.css';

type Stage = 'edit' | 'confirm-save' | 'confirm-revoke' | 'saving' | 'saved' | 'revoked' | 'disconnected' | 'error';
const MINOR_PER_BC = 100;
function parseLimit(value: string): number | undefined {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return undefined;
  const minor = Number(match[1]) * MINOR_PER_BC + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : undefined;
}
function formatLimit(minor: number): string {
  const value = BigInt(minor);
  const unit = BigInt(MINOR_PER_BC);
  const whole = value / unit;
  const fraction = String(value % unit).padStart(2, '0').replace(/0$/, '');
  return fraction === '0' ? String(whole) : `${whole},${fraction}`;
}
export function McpAccessPage({snapshot, source, backRef, onHeaderChange}: {
  snapshot: AppSnapshot; source: AppDataSource; backRef: RefObject<(() => void) | undefined>;
  onHeaderChange: (header: {title: string; brand: string}) => void;
}): ReactElement {
  const navigate = useNavigate();
  const access = snapshot.integrations.mcp;
  const [stage, setStage] = useState<Stage>(() => access.connected ? 'edit' : 'disconnected');
  const [scopes, setScopes] = useState<readonly McpScope[]>(access.scopes);
  const [limit, setLimit] = useState(() => formatLimit(access.limitMinor));
  const [error, setError] = useState('');
  const [unknown, setUnknown] = useState(false);
  const limitMinor = parseLimit(limit);
  const heading = useRef<HTMLElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const revokeButton = useRef<HTMLButtonElement>(null);
  const reconnectButton = useRef<HTMLButtonElement>(null);
  const focusTarget = useRef<'save' | 'revoke' | 'reconnect' | undefined>(undefined);
  const request = useRef('');
  const action = useRef<'save' | 'revoke'>('save');
  const inFlight = useRef(false);
  useEffect(() => {
    onHeaderChange(stage === 'edit' ? {title: 'BOTX', brand: 'Интеграции'} : {title: 'Доступ агента', brand: 'BOTX'});
    if (focusTarget.current) {
      const ref = focusTarget.current === 'save' ? saveButton : focusTarget.current === 'revoke' ? revokeButton : reconnectButton;
      ref.current?.focus(); focusTarget.current = undefined;
    } else if (stage !== 'edit' && stage !== 'disconnected') heading.current?.focus();
  }, [stage, onHeaderChange]);
  function goEdit(target: 'save' | 'revoke' = 'save'): void { focusTarget.current = target; setStage('edit'); }
  function goDisconnected(): void { focusTarget.current = 'reconnect'; setStage('disconnected'); }
  useEffect(() => {
    backRef.current = (): void => {
      if (stage === 'saving' || stage === 'error' && unknown) return;
      if (stage === 'confirm-save') goEdit();
      else if (stage === 'confirm-revoke') goEdit('revoke');
      else if (stage === 'saved') goEdit();
      else if (stage === 'revoked') goDisconnected();
      else if (stage === 'edit' && !access.connected) goDisconnected();
      else if (stage === 'error') goEdit();
      else void navigate('/', {replace: true});
    };
    return () => { backRef.current = undefined; };
  }, [stage, unknown, access.connected, backRef, navigate]);
  async function submit(kind: 'save' | 'revoke'): Promise<void> {
    if (inFlight.current || kind === 'save' && limitMinor === undefined) return;
    inFlight.current = true; action.current = kind; request.current = crypto.randomUUID(); setError(''); setStage('saving');
    const result = await (kind === 'save' ? source.saveMcpAccess(scopes, limitMinor!, request.current) : source.revokeMcpAccess(request.current)).catch(() => ({ok: false as const, reason: 'unknown' as const}));
    inFlight.current = false;
    if (result.ok) { setScopes(result.access.scopes); setLimit(formatLimit(result.access.limitMinor)); setUnknown(false); setStage(kind === 'save' ? 'saved' : 'revoked'); }
    else { setUnknown(result.reason === 'unknown'); setError(result.reason === 'unknown' ? 'Результат операции пока неизвестен.' : 'Изменение не сохранено. Попробуйте снова.'); setStage('error'); }
  }
  async function check(): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    const result = await source.checkMcpAccess(request.current).catch(() => ({ok: false as const, reason: 'unknown' as const}));
    inFlight.current = false;
    if (result.ok) { setScopes(result.access.scopes); setLimit(formatLimit(result.access.limitMinor)); setUnknown(false); setStage(action.current === 'save' ? 'saved' : 'revoked'); }
    else setError('Не удалось проверить результат. Попробуйте снова.');
  }
  const header = (title: string, description?: string): ReactElement => <header ref={heading} tabIndex={-1}><h1>{title}</h1>{description && <p>{description}</p>}</header>;
  if (stage === 'saving') return <section key={stage} className={styles.page} aria-live="polite">{header('Сохраняем доступ', 'Дождитесь завершения операции.')}<Button busy>Сохраняем...</Button></section>;
  if (stage === 'error') return <section key={stage} className={styles.page} aria-live="polite">{header('Не удалось подтвердить доступ')}<p role="alert">{error}</p>{unknown ? <Button onClick={() => void check()}>Проверить результат</Button> : <Button onClick={() => setStage(action.current === 'save' ? 'confirm-save' : 'confirm-revoke')}>Назад</Button>}</section>;
  if (stage === 'saved' || stage === 'revoked') return <section key={stage} className={styles.page} aria-live="polite"><div className={styles.result}><span className={`${styles.resultIcon} ${stage === 'revoked' ? styles.revokedIcon : ''}`}><Icon name={stage === 'saved' ? 'check' : 'x'} /></span>{header(stage === 'saved' ? 'Разрешения обновлены' : 'Доступ отозван', stage === 'saved' ? 'Агент действует только в пределах выданного доступа.' : 'Новые запросы агента запрещены.')}</div><div className={styles.card}>{stage === 'saved' ? <><div className={styles.row}><span>Client MCP</span><strong className={styles.allowed}>Активен</strong></div><div className={styles.row}><span>Лимит</span><strong>{formatLimit(access.limitMinor)} BC</strong></div></> : <div className={styles.row}><span>Статус</span><strong className={styles.denied}>Отозван</strong></div>}</div><Button onClick={() => stage === 'saved' ? goEdit() : goDisconnected()}>К настройкам</Button></section>;
  if (stage === 'disconnected') return <section key={stage} className={styles.page}>{header('Мой торговый агент', 'Client MCP')}<div className={styles.card}><strong className={styles.denied}>Разрешения отозваны</strong><p>Агент больше не может читать данные или торговать от вашего имени.</p></div><Button ref={reconnectButton} onClick={() => { setScopes(access.scopes); setLimit(formatLimit(access.limitMinor)); setStage('edit'); }}>Выдать доступ заново</Button></section>;
  if (stage === 'confirm-revoke') return <section key={stage} className={`${styles.page} ${styles.confirm}`}>{header('Отозвать доступ?', 'Мой торговый агент')}<div className={styles.card}><strong className={styles.warning}>Остановятся новые действия</strong><p>Уже подтверждённые операции останутся в истории. Запросы без действующего разрешения отклоняются.</p></div><Button onClick={() => void submit('revoke')}>Отозвать доступ</Button><Button variant="secondary" onClick={() => goEdit('revoke')}>Отмена</Button></section>;
  if (stage === 'confirm-save') return <section key={stage} className={`${styles.page} ${styles.confirm}`}>{header('Подтвердить полномочия', 'Мой торговый агент / Client MCP')}<div className={styles.card}>{[{scope: 'market' as const, label: 'Котировки', allowed: 'Чтение'}, {scope: 'market' as const, label: 'Портфель', allowed: 'Чтение'}, {scope: 'trade' as const, label: 'Торговля', allowed: 'Разрешена'}, {scope: 'history' as const, label: 'История операций', allowed: 'Чтение'}].map(({scope, label, allowed}) => <div className={styles.row} key={label}><span>{label}</span><strong className={scopes.includes(scope) ? styles.allowed : styles.denied}>{scopes.includes(scope) ? allowed : 'Запрещено'}</strong></div>)}<div className={styles.row}><span>Лимит расходов</span><strong>{limitMinor === undefined ? '' : formatLimit(limitMinor)} BC</strong></div><div className={styles.row}><span>Переводы</span><strong className={styles.denied}>Запрещены</strong></div></div><div className={styles.card}><strong className={styles.warning}>Ограничение</strong><p>Лимит включает комиссии.</p></div><Button onClick={() => void submit('save')}>Выдать доступ</Button><Button variant="secondary" onClick={() => goEdit()}>Отмена</Button></section>;
  return <section key={stage} className={styles.page}>{header('Доступ агента', 'Разрешения на работу от имени игрока.')}<div className={styles.card}><strong className={styles.agentName}>Мой торговый агент</strong><span className={styles.agentBadge}>Client MCP</span><p>Доступ к активам BOTX.</p></div><div className={styles.card}><h2>Разрешённые действия</h2><McpScopeFields scopes={scopes} onChange={setScopes} /></div><label className={styles.limitLabel}>Лимит расходов<span className={styles.limitInput}><input inputMode="decimal" value={limit} onChange={(event) => setLimit(event.target.value)} aria-invalid={limitMinor === undefined} aria-describedby={limitMinor === undefined ? 'mcp-limit-error' : undefined} /><span>BC</span></span></label>{limitMinor === undefined && <p id="mcp-limit-error" role="alert">Укажите положительный лимит с не более чем двумя знаками после запятой.</p>}<div className={styles.card}><p>Лимит включает комиссию. Переводы и административные операции недоступны.</p></div><Button ref={saveButton} disabled={limitMinor === undefined} onClick={() => setStage('confirm-save')}>Сохранить разрешения</Button>{access.connected && <Button ref={revokeButton} variant="secondary" onClick={() => setStage('confirm-revoke')}>Отозвать доступ</Button>}{!access.connected && <Button variant="secondary" onClick={goDisconnected}>Отмена</Button>}</section>;
}
