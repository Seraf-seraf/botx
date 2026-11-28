import {expect, test} from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.route('https://telegram.org/js/**', (route) => route.fulfill({body: ''}));
});

test('filters and finds assets, supports keyboard clearing and opening the detail', async ({page}) => {
  await page.goto('/#/');
  const chip = page.getByRole('group', {name: 'Фильтр котировок'});
  const asset = (name: string) => page.getByRole('link', {name: new RegExp(name)});

  await expect(asset('QuestBot')).toBeVisible();
  await chip.getByRole('button', {name: 'Падают'}).press('Space');
  await expect(asset('DiceLab')).toBeVisible();
  await expect(asset('QuestBot')).toHaveCount(0);
  await chip.getByRole('button', {name: 'Растут'}).click();
  await expect(asset('QuestBot')).toBeVisible();
  await expect(asset('DiceLab')).toHaveCount(0);
  await chip.getByRole('button', {name: 'Новые'}).click();
  await expect(asset('Muse AI')).toBeVisible();
  await expect(asset('QuestBot')).toHaveCount(0);
  await chip.getByRole('button', {name: 'Все'}).click();

  const search = page.getByRole('searchbox');
  await search.fill('QS');
  await expect(asset('QuestBot')).toBeVisible();
  await expect(asset('DiceLab')).toHaveCount(0);
  await page.getByRole('button', {name: 'Очистить поиск'}).press('Enter');
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  await asset('QuestBot').press('Enter');
  await expect(page.getByRole('heading', {name: 'QuestBot'})).toBeVisible();
  await expect(page.getByText(/демо|виртуальный рынок/i)).toHaveCount(0);
  for (const name of ['1Ч', '1Д', '30Д', '7Д']) {
    const button = page.getByRole('button', {name, exact: true});
    await button.press('Space');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByRole('button', {name: 'Назад'}).click();
  await expect(page.getByRole('heading', {name: 'Биржа'})).toBeVisible();
});

test('S02: empty search explains the result and restores the search field', async ({page}) => {
  await page.goto('/#/');
  const search = page.getByRole('searchbox');
  await search.fill('orbit');
  await expect(page.getByRole('heading', {name: 'Бот не найден'})).toBeVisible();
  await expect(page.getByText('Попробуйте другое название')).toBeVisible();
  await page.getByRole('button', {name: 'Сбросить поиск'}).press('Enter');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(page.getByRole('link', {name: /QuestBot/})).toBeVisible();
});

test('S01 and S03: loading and retry recover the market', async ({page}) => {
  await page.goto('/#/?demo=error');
  await expect(page.getByRole('heading', {name: 'Не удалось загрузить биржу'})).toBeVisible();
  await expect(page.getByRole('navigation')).toBeVisible();
  await page.getByRole('button', {name: 'Повторить'}).press('Enter');
  await expect(page.getByRole('status', {name: 'Загрузка котировок'})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Акции ботов'})).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);
});

test('scenario status comes from the source and search survives detail and reload', async ({page}) => {
  await page.goto('/?scenario=market-error&session=market-check#/');
  await expect(page.getByRole('heading', {name: 'Не удалось загрузить биржу'})).toBeVisible();
  await page.getByRole('button', {name: 'Повторить'}).click();
  await expect(page.getByRole('link', {name: /QuestBot/})).toBeVisible();
  const search = page.getByRole('searchbox');
  await search.fill('Quest');
  await page.getByRole('button', {name: 'Растут'}).click();
  await page.getByRole('link', {name: /QuestBot/}).click();
  await page.getByRole('button', {name: 'Назад'}).click();
  await expect(search).toHaveValue('Quest');
  await expect(page.getByRole('button', {name: 'Растут'})).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page).toHaveURL(/scenario=market-error&session=market-check/);
  await expect(page.getByRole('heading', {name: 'Не удалось загрузить биржу'})).toBeVisible();
  await page.getByRole('button', {name: 'Повторить'}).click();
  await expect(search).toHaveValue('Quest');
});

test('scenario navigation and reload retain its session without changing the ordinary account', async ({page}) => {
  await page.goto('/#/');
  await page.evaluate(() => {
    localStorage.setItem('botx.demo.v1', 'ordinary-account-marker');
    localStorage.setItem('botx.demo.v2', 'ordinary-account-marker');
  });
  await page.goto('/?scenario=market-loading&session=isolated-market#/');
  await expect(page.getByRole('link', {name: /QuestBot/})).toBeVisible();
  await page.getByRole('link', {name: /QuestBot/}).click();
  await page.reload();
  await expect(page.getByRole('heading', {name: 'QuestBot'})).toBeVisible();
  await expect(page).toHaveURL(/scenario=market-loading&session=isolated-market/);
  await page.getByRole('button', {name: 'Назад'}).click();
  await page.getByRole('link', {name: 'Профиль'}).click();
  await page.reload();
  await expect(page.getByRole('heading', {name: 'Профиль'})).toBeVisible();
  await expect(page).toHaveURL(/scenario=market-loading&session=isolated-market/);
  expect(await page.evaluate(() => localStorage.getItem('botx.demo.v1'))).toBe('ordinary-account-marker');
  expect(await page.evaluate(() => localStorage.getItem('botx.demo.v2'))).toBe('ordinary-account-marker');
});

test('rapid typing preserves every character and survives returning from an asset', async ({page}) => {
  await page.goto('/?scenario=market-loading&session=rapid-search#/');
  const search = page.getByRole('searchbox');
  await expect(page.getByRole('link', {name: /QuestBot/})).toBeVisible();
  await search.pressSequentially('QuestBot', {delay: 5});
  await expect(search).toHaveValue('QuestBot');
  await expect(page.getByRole('link', {name: /QuestBot/})).toBeVisible();
  await page.getByRole('link', {name: /QuestBot/}).click();
  await page.getByRole('button', {name: 'Назад'}).click();
  await expect(search).toHaveValue('QuestBot');
  await expect(page).toHaveURL(/scenario=market-loading&session=rapid-search/);
});

test('paused trading shows the notice and never opens direct buy or sell forms', async ({page}) => {
  for (const path of ['/asset/QST', '/asset/QST/buy', '/asset/QST/sell']) {
    await page.goto(`/?scenario=market-paused&session=paused-check#${path}`);
    await expect(page.getByRole('heading', {name: 'QuestBot'})).toBeVisible();
    await expect(page.getByText('Торги приостановлены')).toBeVisible();
    await expect(page.getByText('Покупка и продажа недоступны. Уже принадлежащие вам акции и история сохранены.')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', {name: /^(Купить|Продать)$/})).toHaveCount(0);
    await expect(page.getByRole('group', {name: 'Период графика'})).toHaveCount(0);
    await page.getByRole('button', {name: 'На биржу'}).click();
    await expect(page.getByRole('heading', {name: 'Биржа'})).toBeVisible();
    await expect(page).toHaveURL(/scenario=market-paused&session=paused-check/);
  }
});

test('paused screen fits narrow and wide viewports and supports keyboard navigation', async ({page}) => {
  for (const width of [320, 360, 390, 430, 1100]) {
    await page.setViewportSize({width, height: 844});
    await page.goto('/?scenario=market-paused&session=paused-layout#/asset/QST');
    const main = page.getByRole('main');
    const button = page.getByRole('button', {name: 'На биржу'});
    await expect(button).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const bounds = await button.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    await expect(main.getByRole('heading', {name: 'QuestBot'})).toBeVisible();
    await page.getByRole('button', {name: 'Назад'}).focus();
    await expect(page.getByRole('button', {name: 'Назад'})).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', {name: 'Биржа'})).toBeVisible();
  }
});
