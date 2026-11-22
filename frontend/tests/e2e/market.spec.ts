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
