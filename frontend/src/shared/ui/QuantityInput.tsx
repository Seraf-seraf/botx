import {useId} from 'react';
import type {ReactElement} from 'react';
import {Icon} from './Icon';
import styles from './ui.module.css';

const MIN_QUANTITY = 1;

interface QuantityProps {
  value: number;
  max: number;
  disabled?: boolean;
  errorId?: string;
  onChange: (value: number) => void;
}

export function QuantityInput({value, max, disabled, errorId, onChange}: QuantityProps): ReactElement {
  const id = useId();
  return (
    <div className={styles.quantity}>
      <label htmlFor={id}>Количество</label>
      <div className={styles.stepper} data-invalid={Boolean(errorId)}>
        <button type="button" aria-label="Уменьшить количество" disabled={disabled || value <= MIN_QUANTITY} onClick={() => onChange(Math.max(MIN_QUANTITY, value - 1))}>
          <Icon name="minus" size={22} />
        </button>
        <input
          id={id}
          type="number"
          aria-invalid={errorId ? true : undefined}
          aria-describedby={errorId}
          min={MIN_QUANTITY}
          max={max}
          step={1}
          inputMode="numeric"
          value={value || ''}
          disabled={disabled}
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber;
            onChange(Number.isSafeInteger(next) ? Math.max(0, Math.min(max, next)) : 0);
          }}
          onBlur={() => {
            if (value < MIN_QUANTITY) onChange(MIN_QUANTITY);
          }}
        />
        <button type="button" aria-label="Увеличить количество" disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
          <Icon name="plus" size={22} />
        </button>
      </div>
    </div>
  );
}
