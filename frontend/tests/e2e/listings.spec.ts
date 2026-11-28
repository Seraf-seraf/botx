import {expect, test} from '@playwright/test';

test('approves a listing once, restores it and publishes Study without adding money or shares', async ({page}) => {
  await page.goto('/?scenario=payment-open#/admin/listings');
  await page.getByRole('link', {name: 'Открыть заявку'}).click();
  await expect(page.getByText('Отсутствие MAU не препятствует листингу.')).toBeVisible();
  const price = page.getByLabel('Начальная цена акции');
  const count = page.getByLabel('Количество акций');
  await price.fill('0');
  await expect(page.getByRole('button', {name: 'Одобрить листинг'})).toBeDisabled();
  await price.fill('125,50');
  await count.fill('1000');
  await page.getByRole('button', {name: 'Одобрить листинг'}).click();
  await page.getByRole('button', {name: 'Назад к заявке'}).click();
  await expect(price).toHaveValue('125,50');
  await expect(count).toHaveValue('1000');
  await page.getByRole('button', {name: 'Одобрить листинг'}).click();
  await page.getByRole('button', {name: 'Разместить акции'}).click();
  await expect(page.getByRole('heading', {name: 'Бот размещён'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', {name: 'Бот размещён'})).toBeVisible();
  await page.getByRole('button', {name: 'К заявкам'}).click();
  await expect(page.getByText('Размещён', {exact: true})).toBeVisible();
  const url = new URL(page.url());
  url.hash = '#/';
  await page.goto(url.toString());
  await expect(page.getByRole('link', {name: /Study Bot/})).toHaveCount(1);
  url.hash = '#/balance';
  await page.goto(url.toString());
  await expect(page.getByText('3 280 BC')).toBeVisible();
  url.hash = '#/portfolio';
  await page.goto(url.toString());
  await expect(page.getByText('Study Bot')).toHaveCount(0);
});

test('rejects with a reason and restores without publishing Study', async ({page}) => {
  await page.goto('/?scenario=payment-open#/admin/listings/study-bot');
  await page.getByRole('button', {name: 'Отклонить заявку'}).click();
  await expect(page.getByRole('button', {name: 'Отклонить заявку'})).toBeDisabled();
  await page.getByLabel('Причина отказа').fill('Нет подтверждения');
  await page.getByRole('button', {name: 'Отмена'}).click();
  await page.getByRole('button', {name: 'Отклонить заявку'}).click();
  await expect(page.getByLabel('Причина отказа')).toHaveValue('Нет подтверждения');
  await page.getByRole('button', {name: 'Отклонить заявку'}).click();
  await expect(page.getByRole('heading', {name: 'Заявка отклонена'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', {name: 'Заявка отклонена'})).toBeVisible();
  await page.getByRole('button', {name: 'К заявкам'}).click();
  await expect(page.getByText('Отклонена', {exact: true})).toBeVisible();
  const url = new URL(page.url());
  url.hash = '#/';
  await page.goto(url.toString());
  await expect(page.getByRole('link', {name: /Study Bot/})).toHaveCount(0);
});

test('supports keyboard back, restores focus and fits the shell at required widths', async ({page}) => {
  await page.goto('/?scenario=payment-open#/admin/listings/study-bot');
  const approve = page.getByRole('button', {name: 'Одобрить листинг'});
  await approve.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', {name: 'Подтвердить листинг'})).toBeVisible();
  await page.getByRole('button', {name: 'Назад', exact: true}).click();
  await expect(approve).toBeFocused();
  for (const width of [320, 360, 390, 430, 1100]) {
    await page.setViewportSize({width, height: 844});
    const shell = page.locator('[data-app-shell]');
    const box = await shell.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(Math.min(width, 430));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.getByRole('button', {name: 'Одобрить листинг'})).toBeVisible();
  }
});

test('exposes the pending fixture and reduces motion when requested', async ({page}) => {
  await page.goto('/?scenario=listing-pending#/admin/listings/study-bot');
  await expect(page.getByRole('heading', {name: 'Размещаем акции'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Размещаем...'})).toBeDisabled();
  await expect(page.getByRole('button', {name: 'Назад'})).toBeVisible();
  const reducedDuration = await page.locator('section').first().evaluate((element) => parseFloat(getComputedStyle(element).animationDuration));
  expect(reducedDuration).toBeLessThanOrEqual(0.08);
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await expect(page.locator('section').first()).toHaveCSS('animation-duration', '0.16s');
});
