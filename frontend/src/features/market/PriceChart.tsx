import {memo} from 'react';
import type {ReactElement} from 'react';
import type {PricePoint} from '../../shared/data/contracts';
import styles from './PriceChart.module.css';

interface ChartProps {
  points: readonly PricePoint[];
  variant?: 'detail' | 'card' | 'spark';
  tone?: 'positive' | 'negative' | 'neutral';
  className?: string;
}

const CHART_WIDTH = 340;
const CHART_HEIGHT = 150;
const EDGE = 4;

export function historySince(history: readonly PricePoint[], durationMs: number): readonly PricePoint[] {
  const latest = history.at(-1);
  if (!latest) return history;
  const cutoff = latest.at - durationMs;
  const index = history.findIndex(({at}) => at >= cutoff);
  return history.slice(Math.max(0, history[index]?.at === cutoff ? index : index - 1));
}

function calculateLine(points: readonly PricePoint[]): readonly (readonly [number, number])[] {
  if (points.length === 0) return [];
  const prices = points.map(({price}) => price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const firstAt = points[0]?.at ?? 0;
  const lastAt = points.at(-1)?.at ?? firstAt;
  const duration = Math.max(1, lastAt - firstAt);
  const scaleHeight = (CHART_HEIGHT - EDGE * 2) / Math.max(1, high - low);

  if (high === low) return [[EDGE, CHART_HEIGHT / 2], [CHART_WIDTH - EDGE, CHART_HEIGHT / 2]];
  return points.map(({at, price}) => [
    EDGE + (at - firstAt) / duration * (CHART_WIDTH - EDGE * 2),
    EDGE + (high - price) * scaleHeight,
  ]);
}

export const PriceChart = memo(function PriceChart({
  points, variant = 'detail', tone = 'positive', className = '',
}: ChartProps): ReactElement {
  const line = calculateLine(points);
  const end = line.at(-1);

  return (
    <svg
      className={`${styles.chart} ${styles[variant]} ${styles[tone]} ${className}`}
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {variant === 'detail' && (
        <path className={styles.grid} d="M4 30H336 M4 82H336 M4 134H336" />
      )}
      <polyline
        className={styles.line}
        points={line.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}
      />
      {variant !== 'spark' && end && (
        <g transform={`translate(${end[0]} ${end[1]})`}>
          <circle className={styles.endpoint} r={3} />
        </g>
      )}
    </svg>
  );
});
