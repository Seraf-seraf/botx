import {useRef} from 'react';
import type {ReactElement} from 'react';
import {Icon} from './Icon';
import styles from './ui.module.css';

interface SearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchField({value, onChange}: SearchProps): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div role="search" className={styles.search}>
      <Icon name="search" size={22} />
      <input
        ref={input}
        aria-label="Найти бота"
        placeholder="Найти бота"
        type="search"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {value && (
        <button type="button" aria-label="Очистить поиск" onClick={() => {
          onChange('');
          input.current?.focus();
        }}>
          <Icon name="x" size={18} />
        </button>
      )}
    </div>
  );
}
