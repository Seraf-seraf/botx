import type {ReactElement, ReactNode} from 'react';
import styles from './ui.module.css';

interface BadgeProps {
  children: ReactNode;
  tone?: 'neutral' | 'positive' | 'negative';
}

export function Badge({children, tone = 'neutral'}: BadgeProps): ReactElement {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
