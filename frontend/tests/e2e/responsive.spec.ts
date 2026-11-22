import {expect, test} from '@playwright/test';

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
