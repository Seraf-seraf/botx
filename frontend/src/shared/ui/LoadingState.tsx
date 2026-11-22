import type {ReactElement} from 'react';
import {Card} from './Card';
import styles from './States.module.css';

export function LoadingIndex(): ReactElement {
  return (
    <Card className={styles.index ?? ''}>
      <div aria-hidden="true"><i /><i /><i /></div>
    </Card>
  );
}

export function LoadingState(): ReactElement {
  return (
    <section className={styles.loading} role="status" aria-label="Загрузка котировок">
      <p>Загружаем котировки…</p>
      <ul aria-hidden="true">
        {['QST', 'DICE', 'MUSE', 'NEKO'].map((asset) => (
          <li key={asset}><i /><span><i /><i /></span><span><i /><i /></span></li>
        ))}
      </ul>
    </section>
  );
}
