import type {ReactElement} from 'react';
import {Button} from './Button';
import {EmptyState} from './EmptyState';

export function ErrorState({onRetry}: {onRetry: () => void}): ReactElement {
  return (
    <EmptyState icon="x" title="Не удалось загрузить биржу" description="Попробуйте ещё раз" tone="negative">
      <Button variant="secondary" onClick={onRetry}>Повторить</Button>
    </EmptyState>
  );
}
