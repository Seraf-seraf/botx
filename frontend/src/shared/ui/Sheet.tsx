import {useLayoutEffect, useRef} from 'react';
import type {ReactElement, ReactNode} from 'react';
import styles from './Sheet.module.css';

interface SheetProps {
  headingId: string;
  children: ReactNode;
  className?: string;
  onClose: () => void;
}

export function Sheet({headingId, children, className = '', onClose}: SheetProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);

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
      {children}
    </dialog>
  );
}
