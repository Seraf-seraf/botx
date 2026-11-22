import type {ReactElement} from 'react';
import styles from './States.module.css';

interface FeedbackProps {
  title: string;
  description?: string;
  id?: string;
}

export function Feedback({title, description, id}: FeedbackProps): ReactElement {
  return (
    <div className={styles.feedback} role="alert" id={id}>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
    </div>
  );
}
