import {expect, test} from '@playwright/test';

test('profile keeps Telegram identity and opens its existing information sheets', async ({page}) => {
  await page.route('https://telegram.org/js/**', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `window.Telegram = {WebApp: {platform: 'android', initDataUnsafe: {user: {username: 'trader', photo_url: 'https://example.test/missing.png'}}, ready() {}, expand() {}, onEvent() {}, offEvent() {}}};`,
  }));
  await page.route('https://example.test/**', (route) => route.abort());
  await page.goto('/#/profile');
  await expect(page.getByText('@trader')).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);
  for (const title of ['Первая акция', 'Серия 7 дней', 'Рост портфеля', 'Рейтинг игроков', 'Как играть', 'Настройки']) {
    const trigger = page.getByRole('button', {name: title});
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', {name: title})).toBeVisible();
    if (title === 'Рейтинг игроков') await expect(dialog).toContainText('Рейтинг пока пуст');
    await dialog.getByRole('button', {name: 'Закрыть'}).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  await expect(page.getByText(/демоверси|деморын/i)).toHaveCount(0);
});
