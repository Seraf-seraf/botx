import type {ReactElement} from 'react';
import type {Operation} from '../data/contracts';
import {Icon} from './Icon';
import {formatBc} from './market';
import styles from './OperationList.module.css';

const time = new Intl.DateTimeFormat('ru-RU', {hour: '2-digit', minute: '2-digit'});
const shortDate = new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'short'});

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const label = date.toDateString() === today.toDateString()
    ? 'Сегодня'
    : date.toDateString() === yesterday.toDateString() ? 'Вчера' : shortDate.format(date);
  return `${label}, ${time.format(date)}`;
}

export function OperationList({operations}: {operations: readonly Operation[]}): ReactElement {
  if (!operations.length) return <p className={styles.empty}>История пока пуста.</p>;
  return (
    <ul className={styles.list}>
      {operations.map((operation) => {
        const outflow = operation.kind === 'buy';
        const label = operation.kind === 'bonus'
          ? 'Ежедневный бонус'
          : `${outflow ? 'Покупка' : 'Продажа'} ${operation.symbol}`;
        return (
          <li className={styles.row} key={operation.id}>
            <span className={`${styles.icon} ${outflow ? styles.out : styles.in}`}>
              <Icon name={outflow ? 'arrow-up-right' : 'arrow-down-left'} />
            </span>
            <div className={styles.description}>
              <span>{label}</span>
              <time dateTime={new Date(operation.date).toISOString()}>{formatDate(operation.date)}</time>
            </div>
            <span className={outflow ? styles.minus : styles.plus}>
              {outflow ? '−' : '+'}{formatBc(operation.amount)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
