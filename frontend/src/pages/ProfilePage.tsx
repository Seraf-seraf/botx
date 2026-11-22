import {memo, useId, useState} from 'react';
import type {ReactElement} from 'react';
import {useTelegram} from '../shared/telegram/useTelegram';
import {Button} from '../shared/ui/Button';
import {Sheet} from '../shared/ui/Sheet';
import {Card} from '../shared/ui/Card';
import {Icon} from '../shared/ui/Icon';
import styles from './Pages.module.css';

const achievements = [
  {title: 'Первая акция', icon: 'star', text: 'Купите первую акцию на бирже BOTX.'},
  {title: 'Серия 7 дней', icon: 'medal', text: 'Получайте ежедневный бонус семь дней подряд.'},
  {title: 'Рост портфеля', icon: 'trending-up', text: 'Стоимость ваших акций на деморынке меняется вместе с котировками.'},
] as const;

const menu = [
  {title: 'Рейтинг игроков', icon: 'trophy', text: 'Рейтинг игроков недоступен в демоверсии.'},
  {title: 'Как играть', icon: 'help-circle', text: 'Выберите бота на бирже и купите его акции за виртуальные BC. Портфель показывает ваши акции, а ежедневный бонус можно забрать в разделе «Баланс».'},
  {title: 'Настройки', icon: 'settings', text: 'Данные игры сохраняются на этом устройстве.'},
] as const;

export const ProfilePage = memo(function ProfilePage(): ReactElement {
  const {state: {profile}} = useTelegram();
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [info, setInfo] = useState<{title: string; text: string} | null>(null);
  const headingId = useId();
  const name = profile.name ?? '@username';

  return (
    <div className={`${styles.page} ${styles.profile}`}>
      <h1>Профиль</h1>
      <div className={styles.profileIdentity}>
        <span className={styles.avatar}>
          {profile.avatar && !avatarFailed
            ? <img src={profile.avatar} referrerPolicy="no-referrer" alt="" onError={() => setAvatarFailed(true)} />
            : name === '@username' ? 'S' : name.replace(/^@/, '').slice(0, 1).toUpperCase()}
        </span>
        <div className={styles.profileName}>
          <strong>{name}</strong>
          <span className={styles.caption}>Трейдер · Уровень 4</span>
        </div>
      </div>
      <Card className={styles.progressCard ?? ''}>
        <div className={styles.heading}>
          <span className={styles.caption}>До уровня 5</span>
          <strong>62%</strong>
        </div>
        <progress aria-label="До уровня 5" value={62} max={100} />
      </Card>
      <dl className={styles.statGrid}>
        <div><dt>Сделок</dt><dd>16</dd></div>
        <div><dt>Доходность</dt><dd className={styles.gain}>+10,8%</dd></div>
        <div><dt>В рейтинге</dt><dd>#7</dd></div>
      </dl>
      <section className={styles.section} aria-labelledby="achievements">
        <h2 id="achievements">Достижения</h2>
        <ul className={styles.achievements}>
          {achievements.map(({title, icon, text}) => (
            <li key={icon}>
              <button type="button" onClick={() => setInfo({title, text})}>
                <span><Icon name={icon} /></span>
                {title}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <ul className={styles.profileMenu}>
        {menu.map(({title, icon, text}) => (
          <li key={icon}>
            <button type="button" onClick={() => setInfo({title, text})}>
              <Icon name={icon} size={20} />
              {title}
              <Icon name="chevron-right" size={18} />
            </button>
          </li>
        ))}
      </ul>
      {info && (
        <Sheet headingId={headingId} onClose={() => setInfo(null)}>
          <div className={styles.profileInfo}>
            <h2 id={headingId}>{info.title}</h2>
            <p>{info.text}</p>
            <Button onClick={() => setInfo(null)}>Закрыть</Button>
          </div>
        </Sheet>
      )}
    </div>
  );
});
