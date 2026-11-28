import type {ReactElement} from 'react';
import type {ApiScope, McpScope} from '../../shared/data/contracts';
import styles from './Integrations.module.css';

export const apiFields: readonly {scope: ApiScope; label: string}[] = [
  {scope: 'quotes', label: 'Котировки'}, {scope: 'history', label: 'Своя история'},
  {scope: 'rewards', label: 'Награды'}, {scope: 'payments', label: 'Запросы оплаты'},
];
export const mcpFields: readonly {scope: McpScope; label: string; help: string}[] = [
  {scope: 'market', label: 'Котировки и портфель', help: 'Чтение данных игрока'},
  {scope: 'trade', label: 'Покупка и продажа', help: 'Только в пределах разрешённого бюджета'},
  {scope: 'history', label: 'История операций', help: 'Чтение собственных сделок'},
];

function Fields<T extends string>({fields, scopes, onChange, denied}: {
  fields: readonly {scope: T; label: string; help?: string}[]; scopes: readonly T[];
  onChange: (scopes: readonly T[]) => void; denied?: string;
}): ReactElement {
  return <fieldset className={styles.scopes}><legend className={styles.visuallyHidden}>Разрешённые действия</legend>
    {fields.map(({scope, label, help}) => <label className={help ? styles.mcpScope : styles.scope} key={scope}><span>{label}{help && <small>{help}</small>}</span><input type="checkbox" checked={scopes.includes(scope)} onChange={(event) => onChange(event.target.checked ? [...scopes, scope] : scopes.filter((item) => item !== scope))} />{!help && <span>{scopes.includes(scope) ? 'Разрешено' : 'Запрещено'}</span>}</label>)}
    {denied && <div className={styles.scope}><span>{denied}</span><span className={styles.denied}>Запрещено</span></div>}
  </fieldset>;
}

export function ScopeFields({scopes, onChange}: {scopes: readonly ApiScope[]; onChange: (scopes: readonly ApiScope[]) => void}): ReactElement {
  return <Fields fields={apiFields} scopes={scopes} onChange={onChange} denied="Чужие средства" />;
}
export function McpScopeFields({scopes, onChange}: {scopes: readonly McpScope[]; onChange: (scopes: readonly McpScope[]) => void}): ReactElement {
  return <Fields fields={mcpFields} scopes={scopes} onChange={onChange} />;
}
