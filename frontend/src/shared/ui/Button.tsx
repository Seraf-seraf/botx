import type {ButtonHTMLAttributes, ReactElement, Ref} from 'react';
import {Icon} from './Icon';
import styles from './ui.module.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>;
  variant?: 'primary' | 'secondary';
  busy?: boolean;
}

export function Button({
  variant = 'primary', busy = false, disabled, type = 'button', className = '', children, ...props
}: ButtonProps): ReactElement {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`${styles.button} ${styles[variant]} ${className}`}
    >
      {busy && <span aria-hidden="true" className={styles.spinner}><Icon name="history" size={20} /></span>}
      {children}
    </button>
  );
}
