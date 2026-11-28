import {expect, test} from '@playwright/test';

test('confirms payment once, restores the receipt, and shows the shared wallet', async ({page}) => {
  await page.goto('/?scenario=payment-open#/payments/study-bot');
  await expect(page.getByRole('heading', {name: 'Запрос на оплату'})).toBeVisible();
  await page.getByRole('button', {name: 'Оплатить 100,50 BC'}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {name: 'Подтвердить 100,50 BC'}).click();
  await expect(page.getByRole('heading', {name: 'Выполняем платёж'})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Платёж выполнен'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', {name: 'Платёж выполнен'})).toBeVisible();
  await page.getByRole('button', {name: 'Готово'}).click();
  await expect(page.getByText('3 179,50 BC')).toBeVisible();
  await expect(page.getByText('Оплата Study Bot')).toBeVisible();
  await expect(page.getByRole('listitem').filter({hasText: 'Оплата Study Bot'})).toContainText('−100,50 BC');
});

test('cancel, expired and invalid requests never charge the wallet', async ({page}) => {
  await page.goto('/?scenario=payment-open#/payments/study-bot');
  await page.getByRole('button', {name: 'Отказаться'}).click();
  await expect(page.getByRole('heading', {name: 'Платёж отменён'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', {name: 'Платёж отменён'})).toBeVisible();
  await page.getByRole('button', {name: 'Готово'}).click();
  await expect(page.getByText('3 280 BC')).toBeVisible();
  await page.goto('/?scenario=payment-expired#/payments/study-bot');
  await expect(page.getByRole('heading', {name: 'Запрос недействителен'})).toBeVisible();
  await page.getByRole('button', {name: 'Закрыть'}).click();
  await expect(page.getByText('3 280 BC')).toBeVisible();
  await page.goto('/?scenario=payment-open#/payments/invalid');
  await expect(page.getByRole('heading', {name: 'Запрос не найден'})).toBeVisible();
  await page.getByRole('button', {name: 'К балансу'}).click();
  await expect(page.getByText('3 280 BC')).toBeVisible();
});

test('unknown outcome reloads and checks the original request', async ({page}) => {
  await page.goto('/?scenario=payment-unknown#/payments/study-bot');
  await page.getByRole('button', {name: 'Оплатить 100,50 BC'}).click();
  await page.getByRole('dialog').getByRole('button', {name: 'Подтвердить 100,50 BC'}).click();
  await expect(page.getByRole('heading', {name: 'Проверяем платёж'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', {name: 'Проверяем платёж'})).toBeVisible();
  await page.getByRole('button', {name: 'Проверить статус'}).click();
  await expect(page.getByRole('heading', {name: 'Платёж выполнен'})).toBeVisible();
  await page.getByRole('button', {name: 'Готово'}).click();
  await expect(page.getByText('3 179,50 BC')).toBeVisible();
  await expect(page.getByText('Оплата Study Bot')).toHaveCount(1);
});
