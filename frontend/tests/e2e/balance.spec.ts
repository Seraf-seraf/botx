import {expect, test} from '@playwright/test';

test('claims the daily bonus once and restores it after reload', async ({page}) => {
  await page.goto('/#/balance');
  await expect(page.getByText('3 280 BC')).toBeVisible();
  const bonus = page.getByRole('button', {name: /Ежедневный бонус/});
  await bonus.dblclick({force: true});
  await expect(page.getByText('3 380 BC')).toBeVisible();
  await expect(page.getByRole('button', {name: /Бонус получен/})).toBeDisabled();
  await page.reload();
  await expect(page.getByText('3 380 BC')).toBeVisible();
  await expect(page.getByRole('button', {name: /Бонус получен/})).toBeDisabled();
  const account = await page.evaluate(() => JSON.parse(localStorage.getItem('botx.demo.v2') ?? '{}') as {operations: {id: string}[]});
  expect(account.operations.filter(({id}) => id.startsWith('bonus-'))).toHaveLength(1);
});

test('shows a payment as an outflow in the wallet and excludes it from portfolio history', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('botx.demo.v2', JSON.stringify({
      version: 2, revision: 1, balance: 317_950,
      holdings: {QST: {quantity: 3, cost: 74_400}}, claimedOn: null,
      operations: [
        {id: 'payment-one', kind: 'payment', date: 1_795_340_000_000, amount: 10_050},
        {id: 'trade-one', kind: 'buy', symbol: 'QST', quantity: 3, date: 1_795_340_000_000, amount: 74_400},
      ],
      extras: {payments: {requests: []}},
    }));
  });
  await page.goto('/#/balance');
  const payment = page.getByRole('listitem').filter({hasText: 'Оплата услуги'});
  await expect(payment).toContainText('−100,50 BC');
  await expect(page.getByText('Покупка QST')).toBeVisible();
  await page.getByRole('link', {name: 'Портфель'}).click();
  await page.getByRole('button', {name: 'История'}).click();
  await expect(page.getByText('Покупка QST')).toBeVisible();
  await expect(page.getByText('Оплата услуги')).toHaveCount(0);
});
