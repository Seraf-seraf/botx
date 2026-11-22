import type {ReactElement, ReactNode} from 'react';
import {Icon} from './Icon';
import type {IconName} from './Icon';
import styles from './States.module.css';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  description: string;
  children: ReactNode;
  tone?: 'neutral' | 'negative';
}

export function EmptyState({icon, title, description, children, tone = 'neutral'}: EmptyStateProps): ReactElement {
  return (
    <section className={styles.state} aria-label={title}>
      <span className={`${styles.stateIcon} ${styles[tone]}`}><Icon name={icon} size={32} /></span>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </section>
  );
}
