import {expect, test} from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.route('https://telegram.org/js/**', (route) => route.fulfill({body: ''}));
});

test('receipt opens the trade portfolio and reload preserves the position', async ({page}) => {
  await page.goto('/?scenario=buy-insufficient#/asset/QST/buy');
  await page.getByRole('spinbutton').fill('3');
  await page.getByRole('button', {name: 'Купить 3 акции'}).click();
  await page.getByRole('link', {name: 'В портфель'}).click();
  await expect(page.getByRole('heading', {name: 'Портфель'})).toBeVisible();
  await expect(page.getByText(/2\s498,80 BC/)).toBeVisible();
  await expect(page.getByText('23 шт.')).toBeVisible();
  await expect(page.getByText('248 BC')).toBeVisible();
  await expect(page.getByText(/5\s704 BC/)).toBeVisible();
  await page.reload();
  await expect(page.getByText('23 шт.')).toBeVisible();
  await page.getByRole('button', {name: 'Назад'}).click();
  await expect(page.getByRole('button', {name: 'История'})).toBeVisible();
  await page.getByRole('button', {name: 'История'}).click();
  await expect(page.getByText('Покупка QST', {exact: true})).toHaveCount(2);
});

test('trade portfolio supports keyboard return to market and rejects an unknown operation', async ({page}) => {
  await page.goto('/?scenario=buy-insufficient#/asset/QST/buy');
  await page.getByRole('spinbutton').fill('3');
  await page.getByRole('button', {name: 'Купить 3 акции'}).click();
  await page.getByRole('link', {name: 'В портфель'}).click();
  await page.getByRole('link', {name: 'На биржу'}).press('Enter');
  await expect(page.getByRole('heading', {name: 'Биржа'})).toBeVisible();
  await page.goto('/?scenario=buy-insufficient#/portfolio/after?id=missing');
  await expect(page).toHaveURL(/#\/portfolio$/);
  await expect(page.getByRole('button', {name: 'История'})).toBeVisible();
});

test('sale updates portfolio and balance, and history preserves legacy amounts after reload', async ({page}) => {
  await page.goto('/?scenario=buy-insufficient#/asset/QST/sell');
  const sheet = page.getByRole('dialog', {name: 'Продажа акций'});
  await sheet.getByRole('spinbutton').fill('3');
  await sheet.getByRole('button', {name: 'Продать 3 акции'}).click();
  await expect(page.getByRole('heading', {name: 'Продано 3 акции'})).toBeVisible();
  await expect(page.getByText(/3\s986,80 BC/)).toBeVisible();
  await page.getByRole('link', {name: 'В портфель'}).click();
  await expect(page.getByText('17 шт.')).toBeVisible();
  await expect(page.getByText(/4\s216 BC/)).toBeVisible();
  await page.getByRole('button', {name: 'Назад'}).click();
  await expect(page.getByRole('link', {name: /QuestBot.*17 акций/})).toBeVisible();
  await page.getByRole('button', {name: 'История'}).click();
  await expect(page.getByText('Продажа QST')).toBeVisible();
  await expect(page.getByText('+706,8 BC')).toBeVisible();
  await expect(page.getByText('Покупка QST')).toBeVisible();
  await expect(page.getByText('−744 BC')).toBeVisible();
  await expect(page.getByText('Ежедневный бонус')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('link', {name: /QuestBot.*17 акций/})).toBeVisible();
  await page.getByRole('link', {name: 'Баланс', exact: true}).click();
  await expect(page.getByText(/3\s986,8 BC/)).toBeVisible();
  await expect(page.getByText('+706,8 BC')).toBeVisible();
  await expect(page.getByRole('list').getByText('Ежедневный бонус')).toBeVisible();
});

test('repriced and ordinary scenarios keep independent persisted results', async ({page}) => {
  await page.goto('/?scenario=buy-repriced#/asset/QST/buy');
  await page.getByRole('button', {name: 'Купить 3 акции'}).click();
  await page.getByRole('button', {name: 'Подтвердить новую цену'}).click();
  await expect(page.getByText(/2\s461 BC/)).toBeVisible();
  await page.getByRole('link', {name: 'В портфель'}).click();
  await expect(page.getByText('23 шт.')).toBeVisible();
  await expect(page.getByText(/5\s980 BC/)).toBeVisible();
  const repricedUrl = page.url();

  await page.goto('/?scenario=buy-insufficient#/asset/QST/buy');
  await page.getByRole('spinbutton').fill('3');
  await page.getByRole('button', {name: 'Купить 3 акции'}).click();
  await expect(page.getByText(/2\s498,80 BC/)).toBeVisible();
  await page.getByRole('link', {name: 'В портфель'}).click();
  const ordinaryUrl = page.url();
  await page.reload();
  await expect(page.getByText('23 шт.')).toBeVisible();
  await page.getByRole('button', {name: 'Назад'}).click();
  await page.getByRole('link', {name: 'Баланс', exact: true}).click();
  await expect(page.getByText(/2\s498,8 BC/)).toBeVisible();

  await page.goto(repricedUrl);
  await expect(page.getByText('23 шт.')).toBeVisible();
  await expect(page.getByText(/5\s980 BC/)).toBeVisible();
  await page.getByRole('button', {name: 'Назад'}).click();
  await page.getByRole('link', {name: 'Баланс', exact: true}).click();
  await expect(page.getByText(/2\s461 BC/)).toBeVisible();
  await page.goto(ordinaryUrl);
  await expect(page.getByText('23 шт.')).toBeVisible();
  await expect(page.getByText(/5\s704 BC/)).toBeVisible();
  await page.goto('/?scenario=buy-repriced#/portfolio');
  await expect(page.getByRole('link', {name: /QuestBot.*20 акций.*4\s960 BC/})).toBeVisible();
});

test('S05–S06: market → asset → buy → receipt → portfolio → sell → balance', async ({page}) => {
  await page.goto('/#/');
  await page.getByRole('link', {name: /QuestBot/}).click();
  await page.getByRole('button', {name: 'Купить', exact: true}).click();
  const buy = page.getByRole('dialog', {name: 'Покупка акций'});
  await expect(buy).toBeVisible();
  await expect(buy.getByText('744 BC')).toBeVisible();
  await buy.getByRole('button', {name: 'Купить 3 акции'}).click();
  await expect(page.getByRole('heading', {name: /Куплено 3 акции/})).toBeVisible();
  await expect(page.getByText(/2\s498,80 BC/)).toBeVisible();

  await page.getByRole('link', {name: 'В портфель'}).click();
  await expect(page.getByText('23 шт.')).toBeVisible();
  await page.getByRole('button', {name: 'Назад'}).click();
  await expect(page.getByRole('link', {name: /QuestBot.*23 акции/})).toBeVisible();
  await page.getByRole('button', {name: 'История'}).click();
  await expect(page.getByText('Покупка QST', {exact: true})).toHaveCount(2);
  await page.reload();
  await page.getByRole('link', {name: /QuestBot.*23 акции/}).click();
  await page.getByRole('button', {name: 'Продать', exact: true}).click();
  await page.getByRole('button', {name: 'Продать 3 акции'}).click();
  await expect(page.getByRole('heading', {name: /Продано 3 акции/})).toBeVisible();
  await page.getByRole('link', {name: 'В портфель'}).click();
  await expect(page.getByText('20 шт.')).toBeVisible();
  await page.getByRole('button', {name: 'Назад'}).click();
  await expect(page.getByRole('link', {name: /QuestBot.*20 акций/})).toBeVisible();
  await page.getByRole('link', {name: 'Баланс', exact: true}).click();
  await expect(page.getByText(/3\s205,6 BC/)).toBeVisible();
  await expect(page.getByText('Продажа QST')).toBeVisible();
});

test('S07: exact BC shortfall blocks the order, quantity controls allow recovery', async ({page}) => {
  await page.goto('/#/asset/QST/buy');
  const sheet = page.getByRole('dialog', {name: 'Покупка акций'});
  const input = sheet.getByRole('spinbutton');
  await input.fill('14');
  await expect(sheet.getByRole('alert')).toContainText('Не хватает 365,60 BC');
  const submit = sheet.getByRole('button', {name: 'Недостаточно средств'});
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveCSS('background-color', 'rgb(40, 52, 73)');
  await expect(sheet.getByText(/3\s645,60 BC/)).toHaveCSS('color', 'rgb(255, 125, 145)');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(sheet.locator('[data-invalid="true"]')).toHaveCSS('border-color', 'rgb(255, 125, 145)');
  await sheet.getByRole('button', {name: 'Уменьшить количество'}).first().click();
  await expect(sheet.getByRole('alert')).toContainText('Не хватает 105,20 BC');
  await sheet.getByRole('button', {name: 'Уменьшить количество'}).first().click();
  await expect(sheet.getByRole('alert')).toHaveCount(0);
  await expect(sheet.getByRole('button', {name: 'Купить 12 акций'})).toBeEnabled();
  await input.fill('1');
  await expect(sheet.getByRole('button', {name: 'Уменьшить количество'})).toBeDisabled();
  await sheet.getByRole('button', {name: 'Увеличить количество'}).click();
  await expect(input).toHaveValue('2');
  await sheet.getByRole('button', {name: 'Назад'}).click();
  await expect(page).toHaveURL(/#\/asset\/QST$/);

  const open = page.getByRole('button', {name: 'Купить', exact: true});
  await open.press('Enter');
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', {name: 'Отмена'}).click();
  await expect(sheet).toHaveCount(0);
  await expect(open).toBeFocused();
});

test('S04: selling all positions leads to the empty portfolio with a market link', async ({page}) => {
  for (const {symbol, quantity} of [
    {symbol: 'QST', quantity: '20'},
    {symbol: 'NEKO', quantity: '15'},
    {symbol: 'DICE', quantity: '16'},
  ]) {
    await page.goto(`/#/asset/${symbol}/sell`);
    const sheet = page.getByRole('dialog', {name: 'Продажа акций'});
    await sheet.getByRole('spinbutton').fill(quantity);
    await sheet.getByRole('button', {name: `Продать ${quantity} акций`}).click();
    await expect(page.getByRole('heading', {name: /^Продано/})).toBeVisible();
  }
  await page.getByRole('link', {name: 'В портфель'}).click();
  await expect(page.getByRole('heading', {name: 'Пока нет акций'})).toBeVisible();
  await expect(page.getByText('0 BC', {exact: true})).toBeVisible();
  await page.getByRole('link', {name: 'На биржу'}).press('Enter');
  await expect(page.getByRole('heading', {name: 'Биржа'})).toBeVisible();
});

test('S08: rapid bonus clicks yield one credit, and claimed state survives reload', async ({page}) => {
  await page.goto('/#/balance');
  const action = page.getByRole('button', {name: /Ежедневный бонус/});
  await action.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect(page.getByRole('button', {name: /Бонус получен/})).toBeDisabled();
  await expect(page.getByText(/3\s380 BC/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', {name: /Следующий бонус — завтра/})).toBeDisabled();
  await expect(page.getByText(/3\s380 BC/)).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('botx.demo.v2') ?? '{}'));
  expect(stored.operations.filter(({id}: {id: string}) => id.startsWith('bonus-'))).toHaveLength(1);
});

test('repricing requires explicit confirmation and records the new calculation', async ({page}) => {
  await page.goto('/?scenario=buy-repriced#/asset/QST/buy');
  await page.getByRole('button', {name: 'Купить 3 акции'}).click();
  await expect(page.getByText('Цена изменилась')).toBeVisible();
  await expect(page.getByText('819 BC')).toBeVisible();
  await page.getByRole('button', {name: 'Подтвердить новую цену'}).click();
  await expect(page.getByRole('heading', {name: 'Куплено 3 акции'})).toBeVisible();
  await expect(page.getByText('819 BC')).toBeVisible();
  await expect(page.getByText(/2\s461 BC/)).toBeVisible();
});

test('unknown trade survives reload and status check never submits twice', async ({page}) => {
  await page.goto('/?scenario=trade-unknown#/asset/QST/buy');
  await page.getByRole('button', {name: 'Купить 3 акции'}).click();
  await expect(page.getByRole('button', {name: 'Проверить статус'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', {name: 'Проверить статус'})).toBeVisible();
  await page.getByRole('button', {name: 'Проверить статус'}).click();
  await expect(page.getByRole('heading', {name: 'Куплено 3 акции'})).toBeVisible();
  await expect(page.getByText(/2\s498,80 BC/)).toBeVisible();
});

test('pending trade survives reload and rapid clicks do not execute twice', async ({page}) => {
  await page.goto('/?scenario=portfolio-empty#/asset/QST/buy');
  await page.getByRole('button', {name: 'Купить 3 акции'}).evaluate((button) => { button.click(); button.click(); });
  await expect(page.getByText('Операция выполняется')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', {name: 'Проверить статус'})).toBeVisible();
  await page.getByRole('button', {name: 'Проверить статус'}).click();
  await expect(page.getByRole('heading', {name: 'Куплено 3 акции'})).toBeVisible();
  await expect(page.getByText(/2\s498,80 BC/)).toBeVisible();
});

test('paused asset cannot open a trade', async ({page}) => {
  await page.goto('/?scenario=trade-paused#/asset/QST/buy');
  await expect(page.getByText('Торги приостановлены')).toBeVisible();
  await expect(page.getByRole('button', {name: /Купить/})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'На биржу'})).toBeVisible();
});

test('insufficient scenario opens with its shortfall fixture', async ({page}) => {
  await page.goto('/?scenario=buy-insufficient#/asset/QST/buy');
  await expect(page.getByRole('spinbutton')).toHaveValue('14');
  await expect(page.getByRole('alert')).toContainText('Не хватает 365,60 BC');
});

test('unknown trade remains unconfirmed on balance and portfolio until status is checked', async ({page}) => {
  await page.goto('/?scenario=trade-unknown#/asset/QST/buy');
  await page.getByRole('button', {name: 'Купить 3 акции'}).click();
  await page.getByRole('button', {name: 'Вернуться на биржу'}).click();
  await page.getByRole('link', {name: 'Баланс', exact: true}).click();
  await expect(page.getByText(/3\s280 BC/)).toBeVisible();
  await expect(page.getByText('Покупка QST', {exact: true})).toHaveCount(1);
  await page.reload();
  await expect(page.getByText(/3\s280 BC/)).toBeVisible();
  await page.getByRole('link', {name: 'Портфель', exact: true}).click();
  await expect(page.getByRole('link', {name: /QuestBot.*20 акций/})).toBeVisible();
  await page.getByRole('link', {name: /QuestBot.*20 акций/}).click();
  await page.getByRole('button', {name: 'Купить', exact: true}).click();
  await page.getByRole('button', {name: 'Проверить статус'}).click();
  await expect(page.getByRole('heading', {name: 'Куплено 3 акции'})).toBeVisible();
  await expect(page.getByText(/2\s498,80 BC/)).toBeVisible();
});

test('failed status persistence reports an error and retries the original request', async ({page}) => {
  await page.goto('/?scenario=trade-unknown#/asset/QST/buy');
  await page.getByRole('button', {name: 'Купить 3 акции'}).click();
  await page.getByRole('button', {name: 'Проверить статус'}).waitFor();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value): void {
      if (key.startsWith('botx.scenario.')) throw new Error('storage unavailable');
      original.call(this, key, value);
    };
  });
  await page.getByRole('button', {name: 'Проверить статус'}).click();
  await expect(page.getByText('Не удалось сохранить операцию. Попробуйте ещё раз.')).toBeVisible();
  await expect(page.getByRole('button', {name: 'Проверить статус'})).toBeEnabled();
  await page.reload();
  await page.getByRole('button', {name: 'Проверить статус'}).click();
  await expect(page.getByRole('heading', {name: 'Куплено 3 акции'})).toBeVisible();
  await expect(page.getByText(/2\s498,80 BC/)).toBeVisible();
});
