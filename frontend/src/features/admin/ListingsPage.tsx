import {useState} from 'react';
import type {ReactElement} from 'react';
import {Link} from 'react-router-dom';
import type {ListingApplication} from '../../shared/data/contracts';
import {Icon} from '../../shared/ui/Icon';
import styles from './Admin.module.css';

export function ListingsPage({listings}: {listings: readonly ListingApplication[]}): ReactElement {
  const [all, setAll] = useState(false);
  const study = listings.find((item) => item.id === 'study-bot');
  const decided = study?.status !== 'pending';
  const visible = decided ? listings.filter((item) => item.id === 'study-bot' || item.id === 'quest-bot') : listings.filter((item) => all || item.status === 'pending' || item.status === 'revision');
  return <section className={styles.page}>
    <header><h1>{decided ? 'Заявки' : 'Листинг'}</h1><p>{decided ? 'Результат модерации' : 'Заявки владельцев на размещение акций.'}</p></header>
    {!decided && <div className={styles.filters}><button type="button" aria-pressed={!all} onClick={() => setAll(false)}>На проверке</button><button type="button" aria-pressed={all} onClick={() => setAll(true)}>Все</button></div>}
    {visible.map((item) => <div className={`${styles.card} ${!decided ? styles.listing : ''}`} key={item.id}>
      <strong>{item.name}</strong>{(!decided || item.id === 'study-bot') && <p>{item.username}</p>}<span className={item.status === 'approved' ? styles.success : item.status === 'rejected' ? styles.error : styles.muted}>{item.status === 'approved' ? 'Размещён' : item.status === 'rejected' ? 'Отклонена' : item.status === 'revision' ? 'На доработке' : 'На проверке'}</span>
      {!decided && <span className={styles.chevron}><Icon name="chevron-right" /></span>}
      {item.status === 'approved' && item.input && <p>{(item.input.price / 100).toLocaleString('ru-RU')} BC / {item.input.quantity.toLocaleString('ru-RU')} акций</p>}
      {item.status === 'rejected' && <p>Причина доступна заявителю.</p>}
      {!decided && item.status === 'pending' && <p>{item.id === 'quest-bot' ? 'MAU: 1 240' : 'MAU: нет данных'}</p>}
      {!decided && item.status === 'revision' && <p>Данные проверены</p>}
    </div>)}
    {!decided && <Link className={styles.link} to="/admin/listings/study-bot">Открыть заявку</Link>}
    {decided && <Link className={styles.secondaryLink} to="/admin/fees">Комиссии</Link>}
  </section>;
}
