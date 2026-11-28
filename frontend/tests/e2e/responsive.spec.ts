import {expect, test} from '@playwright/test';

test('payment remains usable with keyboard on a narrow viewport', async ({page}) => {
  await page.setViewportSize({width: 320, height: 640});
  await page.goto('/?scenario=payment-open#/payments/study-bot');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole('button', {name: 'Оплатить 100,50 BC'}).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {name: 'Подтвердить 100,50 BC'}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', {name: 'Платёж выполнен'})).toBeVisible();
  await page.getByRole('button', {name: 'Готово'}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', {name: 'Баланс'})).toBeVisible();
});

test('payment state respects reduced motion', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.goto('/?scenario=payment-open#/payments/study-bot');
  const heading = page.getByRole('heading', {name: 'Запрос на оплату'}).locator('..');
  await expect(heading).toHaveCSS('animation-duration', '0.16s');
  await page.emulateMedia({reducedMotion: 'reduce'});
  await expect(heading).toHaveCSS('animation-name', 'none');
});

const views = [
  ['/', 'Биржа'], ['/asset/QST', 'QuestBot'], ['/asset/QST/buy', 'Покупка акций'],
  ['/portfolio', 'Портфель'], ['/balance', 'Баланс'], ['/profile', 'Профиль'],
] as const;

for (const width of [320, 360, 390, 430, 1100]) {
  test(`all six views fit a ${width}px viewport with local fonts and icons`, async ({page}) => {
    await page.setViewportSize({width, height: 844});
    await page.route('https://telegram.org/js/**', (route) => route.fulfill({body: ''}));
    const badResponses: string[] = [];
    page.on('response', (response) => {
      if (!response.ok()) badResponses.push(new URL(response.url()).pathname);
    });

    for (const [route, heading] of views) {
      await page.goto('/#' + route);
      await expect(page.getByRole('heading', {name: heading, exact: true})).toBeVisible();
      const dimensions = await page.evaluate(async () => {
        await document.fonts.ready;
        const shell = document.querySelector('[data-app-shell]');
        const content = document.querySelector('main');
        const dialog = document.querySelector('dialog[open]');
        const nav = document.querySelector('nav');
        return {
          fits: (content?.scrollWidth ?? 0) <= (content?.clientWidth ?? 0) &&
            (dialog?.scrollWidth ?? 0) <= (dialog?.clientWidth ?? 0) &&
            document.documentElement.scrollWidth <= innerWidth,
          shell: shell?.getBoundingClientRect().width,
          centered: Math.abs((shell?.getBoundingClientRect().left ?? 0) - Math.max(0, (innerWidth - 430) / 2)) < 1,
          navClear: !nav || (content?.getBoundingClientRect().bottom ?? 0) <= nav.getBoundingClientRect().top,
          inter: document.fonts.check('700 28px Inter', 'Биржа'),
        };
      });
      expect(dimensions).toEqual({fits: true, shell: Math.min(width, 430), centered: true, navClear: true, inter: true});
    }
    expect(badResponses).toEqual([]);
  });
}

for (const width of [320, 390, 430]) {
  test(`empty portfolio and trading form fit ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 844});
    await page.route('https://telegram.org/js/**', (route) => route.fulfill({body: ''}));
    await page.goto('/?scenario=portfolio-empty#/portfolio');
    await expect(page.getByRole('heading', {name: 'Пока нет акций'})).toBeVisible();
    await expect(page.getByRole('link', {name: 'На биржу'})).toBeVisible();
    await page.getByRole('link', {name: 'На биржу'}).click();
    await page.getByRole('link', {name: /QuestBot/}).click();
    await page.getByRole('button', {name: 'Купить', exact: true}).click();
    await expect(page.getByRole('dialog', {name: 'Покупка акций'})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.getByRole('dialog').evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
    await page.getByRole('button', {name: 'Купить 3 акции'}).click();
    await page.getByRole('link', {name: 'В портфель'}).click();
    await expect(page.getByText('3 шт.')).toBeVisible();
    await expect(page.getByRole('link', {name: 'На биржу'})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('profile controls open meaningful dialogs and return keyboard focus', async ({page}) => {
  await page.route('https://telegram.org/js/**', (route) => route.fulfill({
    body: 'window.Telegram = {WebApp: {platform: "android", initDataUnsafe: {user: {username: "long_user_name_".repeat(8)}}}};',
  }));
  await page.setViewportSize({width: 320, height: 844});
  await page.goto('/#/profile');
  await expect(page.getByText(/^@long_user_name/)).toBeVisible();
  expect(await page.locator('main').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  for (const label of ['Первая акция', 'Серия 7 дней', 'Рост портфеля', 'Рейтинг игроков', 'Как играть', 'Настройки']) {
    const action = page.getByRole('button', {name: label});
    await action.press('Enter');
    const sheet = page.getByRole('dialog', {name: label});
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('p')).not.toBeEmpty();
    await sheet.getByRole('button', {name: 'Закрыть'}).press('Enter');
    await expect(sheet).toHaveCount(0);
    await expect(action).toBeFocused();
  }
});

for (const width of [320, 390, 430, 1100]) {
  test(`administrative fee form fits and remains usable at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 844});
    await page.goto('/?scenario=payment-open#/admin/fees');
    await expect(page.getByRole('heading', {name: 'Комиссии'})).toBeVisible();
    expect(await page.locator('main').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await page.locator('[data-app-shell]').boundingBox())?.width).toBe(Math.min(width, 430));
    await page.getByLabel('Покупка', {exact: true}).fill('0,5');
    await page.getByRole('button', {name: 'Сохранить комиссии'}).press('Enter');
    await expect(page.getByRole('heading', {name: 'Сохранить правила'})).toBeVisible();
    await page.getByRole('button', {name: 'Продолжить редактирование'}).press('Enter');
    await expect(page.getByRole('button', {name: 'Сохранить комиссии'})).toBeFocused();
    await expect(page.getByLabel('Покупка', {exact: true})).toHaveValue('0,5');
  });
}


test('integration forms remain usable with keyboard at narrow width', async ({page}) => {
  await page.setViewportSize({width: 320, height: 640});
  for (const [route, button, checkbox] of [
    ['api', 'Настроить доступ', 'Котировки'],
    ['mcp', undefined, 'Котировки и портфель'],
  ] as const) {
    await page.goto(`/?scenario=${route}-connected#/integrations/${route}`);
    if (button) await page.getByRole('button', {name: button}).click();
    const field = page.getByRole('checkbox', {name: new RegExp(checkbox)});
    await field.focus(); await page.keyboard.press('Space');
    await expect(field).not.toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
});
