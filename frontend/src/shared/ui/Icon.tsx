import type {CSSProperties, ReactElement} from 'react';
import styles from './ui.module.css';

const icons = import.meta.glob<string>('../assets/icons/*.svg', {
  eager: true,
  import: 'default',
  query: '?url&no-inline',
});

export type IconName =
  | 'arrow-down-left' | 'arrow-left' | 'arrow-up-right' | 'arrows-exchange'
  | 'brain' | 'briefcase' | 'cat' | 'chart-candle' | 'chart-line' | 'chart-pie'
  | 'check' | 'chevron-right' | 'coins' | 'dice-5' | 'filter' | 'gift'
  | 'help-circle' | 'history' | 'medal' | 'minus' | 'plus' | 'receipt'
  | 'robot' | 'search' | 'settings' | 'star' | 'trending-down'
  | 'trending-up' | 'trophy' | 'user-circle' | 'wallet' | 'x';

interface IconProps {
  name: IconName;
  size?: 16 | 18 | 20 | 22 | 24 | 28 | 32;
}

export function Icon({name, size = 24}: IconProps): ReactElement {
  const source = icons[`../assets/icons/${name}.svg`];
  return (
    <span
      aria-hidden="true"
      className={styles.icon}
      style={{'--icon-url': `url("${source}")`, '--icon-size': `${size}px`} as CSSProperties}
    />
  );
}
