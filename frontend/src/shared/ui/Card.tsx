import type {ReactElement, ReactNode} from 'react';
import styles from './ui.module.css';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({children, className = ''}: CardProps): ReactElement {
  return <div className={`${styles.card} ${className}`}>{children}</div>;
}
