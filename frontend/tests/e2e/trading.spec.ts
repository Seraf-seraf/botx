import {expect, test} from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.route('https://telegram.org/js/**', (route) => route.fulfill({body: ''}));
});

test('S05–S06: market → asset → buy → receipt → portfolio → sell → balance', async ({page}) => {
  await page.goto('/#/');
  await page.getByRole('link', {name: /QuestBot/}).click();
  await page.getByRole('button', {name: 'Купить', exact: true}).click();
  const buy = page.getByRole('dialog', {name: 'Покупка акций'});
  await expect(buy).toBeVisible();
  await expect(buy.getByText('744 BC')).toBeVisible();
  await buy.getByRole('button', {name: 'Купить 3 акции'}).click();
  await expect(buy.getByRole('button', {name: 'Покупаем…'})).toBeDisabled();
  await expect(buy.getByRole('spinbutton')).toBeDisabled();
  await expect(page.getByRole('heading', {name: /Куплено 3 акции.*QuestBot/})).toBeVisible();
  await expect(page.getByText(/2\s536 BC/)).toBeVisible();

  await page.getByRole('link', {name: 'В портфель'}).click();
  await expect(page.getByRole('link', {name: /QuestBot.*23 акции/})).toBeVisible();
  await page.getByRole('button', {name: 'История'}).click();
  await expect(page.getByText('Покупка QST', {exact: true})).toHaveCount(2);
  await page.reload();
  await page.getByRole('link', {name: /QuestBot.*23 акции/}).click();
  await page.getByRole('button', {name: 'Продать', exact: true}).click();
  await page.getByRole('button', {name: 'Продать 3 акции'}).click();
  await expect(page.getByRole('heading', {name: /Продано 3 акции.*QuestBot/})).toBeVisible();
  await page.getByRole('link', {name: 'В портфель'}).click();
  await expect(page.getByRole('link', {name: /QuestBot.*20 акций/})).toBeVisible();
  await page.getByRole('link', {name: 'Баланс', exact: true}).click();
  await expect(page.getByText(/3\s280 BC/)).toBeVisible();
  await expect(page.getByText('Продажа QST')).toBeVisible();
});

test('S07: exact BC shortfall blocks the order, quantity controls allow recovery', async ({page}) => {
  await page.goto('/#/asset/QST/buy');
  const sheet = page.getByRole('dialog', {name: 'Покупка акций'});
  const input = sheet.getByRole('spinbutton');
  await input.fill('14');
  await expect(sheet.getByRole('alert')).toContainText('Не хватает 192 BC');
  const submit = sheet.getByRole('button', {name: 'Купить 14 акций'});
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveCSS('background-color', 'rgb(40, 52, 73)');
  await expect(sheet.getByText(/3\s472 BC/)).toHaveCSS('color', 'rgb(255, 125, 145)');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(sheet.locator('[data-invalid="true"]')).toHaveCSS('border-color', 'rgb(255, 125, 145)');
  await sheet.getByRole('button', {name: 'Уменьшить количество'}).click();
  await expect(sheet.getByRole('alert')).toHaveCount(0);
  await expect(sheet.getByRole('button', {name: 'Купить 13 акций'})).toBeEnabled();
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
  await page.mouse.click(190, 230);
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
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('botx.demo.v1') ?? '{}'));
  expect(stored.operations.filter(({id}: {id: string}) => id.startsWith('bonus-'))).toHaveLength(1);
});
