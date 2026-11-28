import {createContext, useContext, useLayoutEffect, useRef, useState} from 'react';
import type {ButtonHTMLAttributes, ReactElement, ReactNode} from 'react';
import {useTelegramBack} from '../telegram/useTelegram';
import {Icon} from './Icon';
import {Button} from './Button';
import styles from './Sheet.module.css';

const SHEET_CLOSE_MS = 220;
const SheetCloseContext = createContext<{requestClose: () => void; disabled: boolean} | null>(null);

export function SheetClose({styled = false, ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {styled?: boolean}): ReactElement {
  const context = useContext(SheetCloseContext);
  if (!context) throw new Error('SheetClose requires a Sheet');
  const shared = {...props, onClick: context.requestClose, disabled: context.disabled || props.disabled};
  return styled ? <Button {...shared} /> : <button {...shared} type="button" />;
}

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
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  function requestClose(): void {
    if (closeDisabled || closingRef.current) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    closingRef.current = true;
    ref.current?.focus();
    setClosing(true);
    timer.current = window.setTimeout(onClose, SHEET_CLOSE_MS);
  }

  useTelegramBack(requestClose);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.showModal();
    return () => {
      window.clearTimeout(timer.current);
      element.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      tabIndex={-1}
      className={`${styles.sheet} ${className}`}
      data-closing={closing || undefined}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      {topTitle && (
        <header className={styles.topBar}>
          <button type="button" aria-label="Назад" disabled={closeDisabled || closing} onClick={requestClose}><Icon name="arrow-left" size={20} /></button>
          <span>{topTitle}</span>
        </header>
      )}
      <div className={styles.panel} inert={closing || undefined}>
        <SheetCloseContext.Provider value={{requestClose, disabled: closeDisabled || closing}}>{children}</SheetCloseContext.Provider>
      </div>
    </dialog>
  );
}
