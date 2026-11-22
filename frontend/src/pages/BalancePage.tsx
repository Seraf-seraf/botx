import {useRef, useState} from 'react';
import type {ReactElement} from 'react';
import type {AppSnapshot, OperationResult} from '../shared/data/contracts';
import {Card} from '../shared/ui/Card';
import {Icon} from '../shared/ui/Icon';
import {OperationList} from '../shared/ui/OperationList';
import {formatBc} from '../shared/ui/market';
import styles from './Pages.module.css';

interface BalanceProps {
  snapshot: AppSnapshot;
  onBonus: () => Promise<OperationResult>;
}

export function BalancePage({snapshot, onBonus}: BalanceProps): ReactElement {
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function handleBonus(): Promise<void> {
    if (submitting.current || snapshot.bonusClaimed) return;
    submitting.current = true;
    setPending(true);
    setError('');
    try {
      const result = await onBonus();
      if (!result.ok && result.reason !== 'claimed') {
        setError('Не удалось сохранить бонус. Попробуйте ещё раз.');
      }
    } finally {
      setPending(false);
      submitting.current = false;
    }
  }

  return (
    <div className={styles.page}>
      <h1>Баланс</h1>
      <Card className={styles.balanceSummary ?? ''}>
        <p className={styles.caption}>Доступно</p>
        <strong className={styles.total}>{formatBc(snapshot.balance)}</strong>
        <p className={styles.caption}>Виртуальные боткоины</p>
        <p className={styles.axisLabel}>Используются только внутри игры</p>
      </Card>
      <button className={styles.bonus} type="button" onClick={() => { void handleBonus(); }} aria-busy={pending || undefined} disabled={snapshot.bonusClaimed || pending}>
        <span className={styles.bonusIcon}><Icon name={snapshot.bonusClaimed ? 'check' : 'gift'} /></span>
        <span className={styles.bonusBody}>
          <strong>Ежедневный бонус</strong>
          <span className={styles.bonusAction}>{snapshot.bonusClaimed ? 'Получено +100 BC' : 'Забрать +100 BC'}</span>
          <span className={styles.tiny}>{snapshot.bonusClaimed ? 'Следующая награда завтра' : 'Новая награда каждый день'}</span>
        </span>
      </button>
      {error && <p role="alert">{error}</p>}
      <section className={styles.section} aria-labelledby="balance-operations">
        <h2 id="balance-operations">История операций</h2>
        <OperationList operations={snapshot.operations} />
      </section>
    </div>
  );
}
