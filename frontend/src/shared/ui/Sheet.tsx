import {useLayoutEffect, useRef} from 'react';
import type {ReactElement, ReactNode} from 'react';
import {useTelegramBack} from '../telegram/useTelegram';
import {Icon} from './Icon';
import styles from './Sheet.module.css';

interface SheetProps {
  headingId: string;
  children: ReactNode;
  className?: string;
  topTitle?: string;
  closeDisabled?: boolean;
  onClose: () => void;
}

export function Sheet({headingId, children, className = '', onClose, topTitle, closeDisabled = false}: SheetProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  useTelegramBack(onClose);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.showModal();
    return () => element.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      className={`${styles.sheet} ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {topTitle && (
        <header className={styles.topBar}>
          <button type="button" aria-label="Назад" disabled={closeDisabled} onClick={onClose}><Icon name="arrow-left" size={20} /></button>
          <span>{topTitle}</span>
        </header>
      )}
      <div className={styles.panel}>{children}</div>
    </dialog>
  );
}
