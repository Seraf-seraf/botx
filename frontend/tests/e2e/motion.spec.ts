import {expect, test} from '@playwright/test';
import type {Page} from '@playwright/test';

async function holdTrades(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let held = false;
    Object.defineProperty(navigator, 'locks', {configurable: true, value: {
      request: (_name: string, run: () => unknown) => {
        if (held) return Promise.resolve().then(run);
        held = true;
        return new Promise((resolve, reject) => {
          const controls = window as Window & {releaseTrade: () => void; rejectTrade: () => void};
          controls.releaseTrade = () => { try { resolve(run()); } catch (error) { reject(error); } };
          controls.rejectTrade = () => reject(new Error('storage unavailable'));
        });
      },
    }});
  });
}

async function settleTrade(page: Page, fail = false): Promise<void> {
  await page.evaluate((reject) => {
    const controls = window as Window & {releaseTrade: () => void; rejectTrade: () => void};
    if (reject) controls.rejectTrade(); else controls.releaseTrade();
  }, fail);
}

test.beforeEach(async ({page}) => {
  await page.route('https://telegram.org/js/**', (route) => route.fulfill({body: ''}));
});

test('navigation and sheet use motion without leaving duplicate active screens', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.goto('/#/');
  await page.getByRole('link', {name: /QuestBot/}).click();
  const main = page.locator('main');
  await expect(main).toHaveAttribute('data-transition', 'forward');
  await expect(main).toHaveCSS('animation-duration', '0.22s');
  await page.getByRole('button', {name: 'Назад'}).click();
  await expect(main).toHaveAttribute('data-transition', 'back');
  await expect(main).toHaveCSS('animation-duration', '0.18s');
  await page.getByRole('link', {name: 'Профиль', exact: true}).click();
  await expect(main).toHaveAttribute('data-transition', 'tab');
  await expect(main).toHaveCSS('animation-duration', '0.12s');
  const action = page.getByRole('button', {name: 'Как играть'});
  await action.click();
  const sheet = page.getByRole('dialog', {name: 'Как играть'});
  await expect(sheet.locator(':scope > div')).toHaveCSS('animation-duration', '0.22s');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(action).toBeFocused();
  expect(await page.getByRole('main').count()).toBe(1);
});

test('reduced motion disables movement and allows immediate close', async ({page}) => {
  await holdTrades(page);
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto('/#/profile');
  const action = page.getByRole('button', {name: 'Как играть'});
  await action.click();
  const sheet = page.getByRole('dialog', {name: 'Как играть'});
  await expect(sheet.locator(':scope > div')).toHaveCSS('animation-name', 'none');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(action).toBeFocused();
  await page.goto('/#/asset/QST/buy');
  const trade = page.getByRole('dialog', {name: 'Покупка акций'});
  await trade.getByRole('button', {name: 'Купить 3 акции'}).click();
  await expect(trade.getByRole('button', {name: 'Покупаем…'}).locator(':scope > span[aria-hidden]')).toHaveCSS('animation-name', 'none');
});

test('a pending trade cannot be closed by Escape, a background click, or Telegram Back', async ({page}) => {
  await page.route('https://telegram.org/js/**', (route) => route.fulfill({body: `
    const handlers = new Set();
    window.Telegram = {WebApp: {platform: 'android', isActive: true, ready() {}, expand() {},
      onEvent() {}, offEvent() {}, BackButton: {show() {}, hide() {},
        onClick(fn) { handlers.add(fn); }, offClick(fn) { handlers.delete(fn); }}}};
    window.triggerTelegramBack = () => handlers.forEach((fn) => fn());
  `}));
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await holdTrades(page);
  await page.goto('/#/asset/QST/buy');
  const sheet = page.getByRole('dialog', {name: 'Покупка акций'});
  await sheet.getByRole('button', {name: 'Купить 3 акции'}).click();
  await expect(sheet.getByRole('button', {name: 'Покупаем…'})).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.mouse.click(190, 800);
  await page.evaluate(() => (window as Window & {triggerTelegramBack: () => void}).triggerTelegramBack());
  await expect(sheet).toBeVisible();
  await expect(sheet).not.toHaveAttribute('data-closing', 'true');
  await settleTrade(page);
  await expect(page.getByRole('heading', {name: /Куплено 3 акции/})).toBeVisible();
});


test('internal close buttons use the sheet exit and restore focus', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.clock.install();
  await page.goto('/#/profile');
  const action = page.getByRole('button', {name: 'Как играть'});
  await action.click();
  const sheet = page.getByRole('dialog', {name: 'Как играть'});
  await sheet.getByRole('button', {name: 'Закрыть'}).click();
  await expect(sheet).toHaveAttribute('data-closing', 'true');
  await expect(sheet.locator(':scope > div')).toHaveAttribute('inert', '');
  await page.clock.runFor(220);
  await expect(sheet).toHaveCount(0);
  await expect(action).toBeFocused();

  await page.goto('/#/asset/QST');
  const buy = page.getByRole('button', {name: 'Купить', exact: true});
  await buy.click();
  const trade = page.getByRole('dialog', {name: 'Покупка акций'});
  await trade.getByRole('button', {name: 'Отмена'}).click();
  await expect(trade).toHaveAttribute('data-closing', 'true');
  await page.clock.runFor(220);
  await expect(trade).toHaveCount(0);
  await expect(buy).toBeFocused();
});


test('skeleton pulses with a 900 ms cycle and stops under reduced motion', async ({page}) => {
  await page.clock.install();
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.goto('/#/?demo=loading');
  const skeleton = page.getByRole('status', {name: 'Загрузка котировок'}).locator('i').first();
  await expect(skeleton).toHaveCSS('animation-duration', '0.9s');
  await expect(skeleton).toHaveCSS('animation-iteration-count', 'infinite');
  await page.emulateMedia({reducedMotion: 'reduce'});
  await expect(skeleton).toHaveCSS('animation-name', 'none');
});


test('back from a directly opened asset moves in the back direction', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.goto('/#/asset/QST');
  await page.getByRole('button', {name: 'Назад'}).click();
  await expect(page.locator('main')).toHaveAttribute('data-transition', 'back');
});

test('returning from payment to balance uses the back transition', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.goto('/?scenario=payment-open#/payments/study-bot');
  await page.getByRole('button', {name: 'Назад'}).click();
  const main = page.locator('main');
  await expect(main).toHaveAttribute('data-transition', 'back');
  await expect(main).toHaveCSS('animation-duration', '0.18s');

  await page.goto('/?scenario=payment-open#/payments/study-bot');
  await page.getByRole('button', {name: 'Оплатить 100,50 BC'}).click();
  await page.getByRole('dialog').getByRole('button', {name: 'Подтвердить 100,50 BC'}).click();
  await page.getByRole('button', {name: 'Готово'}).click();
  await expect(main).toHaveAttribute('data-transition', 'back');
  await expect(main).toHaveCSS('animation-duration', '0.18s');
});

test('returning from a listing review uses the back transition', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.goto('/?scenario=payment-open#/admin/listings/study-bot');
  await page.getByRole('button', {name: 'Назад', exact: true}).click();
  const main = page.locator('main');
  await expect(main).toHaveAttribute('data-transition', 'back');
  await expect(main).toHaveCSS('animation-duration', '0.18s');
});

test('browser Back during a pending trade preserves the operation', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await holdTrades(page);
  await page.goto('/#/');
  await page.getByRole('link', {name: /QuestBot/}).click();
  await page.getByRole('button', {name: 'Купить', exact: true}).click();
  const sheet = page.getByRole('dialog', {name: 'Покупка акций'});
  await sheet.getByRole('button', {name: 'Купить 3 акции'}).click();
  await page.goBack();
  await expect(sheet).toBeVisible({timeout: 2000});
  await expect(page).toHaveURL(/#\/asset\/QST\/buy$/);
  await settleTrade(page);
  await expect(page.getByRole('heading', {name: /Куплено 3 акции/})).toBeVisible();
  await page.getByRole('button', {name: 'Назад'}).click();
  await expect(page.getByRole('heading', {name: 'QuestBot'})).toBeVisible();
});


test('repeated history navigation is blocked until a failed trade recovers', async ({page}) => {
  await holdTrades(page);
  await page.goto('/#/');
  await page.getByRole('link', {name: /QuestBot/}).click();
  await page.getByRole('button', {name: 'Купить', exact: true}).click();
  await page.goBack();
  await expect(page.getByRole('heading', {name: 'QuestBot'})).toBeVisible();
  await page.goForward();
  const sheet = page.getByRole('dialog', {name: 'Покупка акций'});
  await expect(sheet).toBeVisible();
  await sheet.getByRole('spinbutton').fill('4');
  await sheet.getByRole('button', {name: 'Купить 4 акции'}).click();
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goBack();
    await expect(page).toHaveURL(/#\/asset\/QST\/buy$/);
    await expect(sheet.getByRole('button', {name: 'Покупаем…'})).toBeDisabled();
    await page.goForward();
    await expect(page).toHaveURL(/#\/asset\/QST\/buy$/);
  }
  await settleTrade(page, true);
  await expect(sheet.getByText('Не удалось сохранить операцию. Попробуйте ещё раз.')).toBeVisible();
  await expect(sheet.getByRole('spinbutton')).toHaveValue('4');
  await expect(sheet.getByRole('button', {name: 'Купить 4 акции'})).toBeEnabled();
  await page.goBack();
  await expect(page.getByRole('heading', {name: 'QuestBot'})).toBeVisible();
  await page.goForward();
  await expect(sheet).toBeVisible();
});

test('direct scenario URL and session survive trade navigation and reload', async ({page}) => {
  await page.goto('/?scenario=market-paused#/asset/DICE/buy');
  const start = new URL(page.url());
  const session = start.searchParams.get('session');
  expect(session).toBeTruthy();
  expect(start.searchParams.get('scenario')).toBe('market-paused');
  const sheet = page.getByRole('dialog', {name: 'Покупка акций'});
  await sheet.getByRole('button', {name: 'Купить 3 акции'}).click();
  await expect(page.getByRole('heading', {name: /Куплено 3 акции/})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', {name: /Куплено 3 акции/})).toBeVisible();
  const end = new URL(page.url());
  expect(end.searchParams.get('session')).toBe(session);
  expect(end.searchParams.get('scenario')).toBe('market-paused');
  await page.getByRole('button', {name: 'Назад'}).click();
  await expect(page.getByRole('heading', {name: 'DiceLab'})).toBeVisible();
});

test('returning from fee settings uses the back transition', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.goto('/?scenario=payment-open#/admin/fees');
  await page.getByRole('button', {name: 'Назад', exact: true}).click();
  await expect(page.locator('main')).toHaveAttribute('data-transition', 'back');
  await expect(page.locator('main')).toHaveCSS('animation-duration', '0.18s');
});
