import type {ReactElement} from 'react';
import styles from './ui.module.css';

interface FilterProps<Value extends string> {
  label: string;
  options: readonly {value: Value; label: string}[];
  value: Value;
  onChange: (value: Value) => void;
}

export function FilterChips<Value extends string>({
  label, options, value, onChange,
}: FilterProps<Value>): ReactElement {
  return (
    <div role="group" aria-label={label} className={styles.chips}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
