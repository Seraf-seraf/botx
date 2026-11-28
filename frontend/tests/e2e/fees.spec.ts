import {expect, test} from '@playwright/test';

test('fee edit header fits between back and administration, other headers stay centered', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/admin/fees');
  const header = page.locator('[data-app-shell] > header');
  const title = header.getByText('BOTX', {exact: true});
  const brand = header.getByText('Администрирование');
  const back = header.getByRole('button', {name: 'Назад'});
  const [titleBox, brandBox, backBox] = await Promise.all([title.boundingBox(), brand.boundingBox(), back.boundingBox()]);
  expect(titleBox && brandBox && backBox).toBeTruthy();
  expect(Math.abs(titleBox!.x + titleBox!.width / 2 - (backBox!.x + backBox!.width + brandBox!.x) / 2)).toBeLessThan(2);
  await page.getByRole('button', {name: 'Сохранить комиссии'}).click();
  const confirmTitle = await header.getByText('Комиссии', {exact: true}).boundingBox();
  expect(confirmTitle).toBeTruthy();
  expect(Math.abs(confirmTitle!.x + confirmTitle!.width / 2 - 195)).toBeLessThan(2);
  await page.goto('/#/admin/listings');
  const listTitle = await header.getByText('BOTX', {exact: true}).boundingBox();
  expect(listTitle).toBeTruthy();
  expect(Math.abs(listTitle!.x + listTitle!.width / 2 - 195)).toBeLessThan(2);
});

test('saved result shows distinct buy and sell rates and combines equal rates', async ({page}) => {
  await page.goto('/#/admin/fees');
  await page.getByLabel('Покупка', {exact: true}).fill('1');
  await page.getByLabel('Продажа', {exact: true}).fill('5');
  await page.getByRole('button', {name: 'Сохранить комиссии'}).click();
  await page.getByRole('button', {name: 'Сохранить', exact: true}).click();
  await expect(page.locator('div').filter({hasText: /^Покупка акций1%$/})).toBeVisible();
  await expect(page.locator('div').filter({hasText: /^Продажа акций5%$/})).toBeVisible();
  await page.getByRole('button', {name: 'К комиссиям'}).click();
  await page.getByLabel('Продажа', {exact: true}).fill('1');
  await page.getByRole('button', {name: 'Сохранить комиссии'}).click();
  await page.getByRole('button', {name: 'Сохранить', exact: true}).click();
  await expect(page.locator('div').filter({hasText: /^Торговля1%$/})).toBeVisible();
});

test('edits and confirms fees without creating history, then applies them to a new trade', async ({page}) => {
  await page.goto('/?scenario=payment-open#/admin/fees');
  const buy = page.getByLabel('Покупка', {exact: true});
  const service = page.getByLabel('Оплата услуг', {exact: true});
  await buy.fill('100,01');
  await expect(page.getByRole('button', {name: 'Сохранить комиссии'})).toBeDisabled();
  await buy.fill('1');
  await service.fill('1');
  await page.getByRole('button', {name: 'Сохранить комиссии'}).click();
  await expect(page.getByRole('heading', {name: 'Сохранить правила'})).toBeVisible();
  await page.getByRole('button', {name: 'Продолжить редактирование'}).click();
  await expect(buy).toHaveValue('1');
  await expect(service).toHaveValue('1');
  await page.getByRole('button', {name: 'Сохранить комиссии'}).click();
  await page.getByRole('button', {name: 'Сохранить', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Комиссии обновлены'})).toBeVisible();
  await page.reload();
  await expect(buy).toHaveValue('1');
  const url = new URL(page.url());
  url.hash = '#/balance';
  await page.goto(url.toString());
  await expect(page.getByText('3 280 BC')).toBeVisible();
  url.hash = '#/asset/QST/buy';
  await page.goto(url.toString());
  await expect(page.getByRole('dialog', {name: 'Покупка акций'})).toContainText('1%');
});

test('known failure preserves the draft and permits a retry', async ({page}) => {
  await page.goto('/?scenario=fees-save-error#/admin/fees');
  const buy = page.getByLabel('Покупка', {exact: true});
  await buy.fill('2,5');
  await page.getByRole('button', {name: 'Сохранить комиссии'}).click();
  await page.getByRole('button', {name: 'Сохранить', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Не удалось сохранить'})).toBeVisible();
  await page.getByRole('button', {name: 'Проверить настройки'}).click();
  await expect(buy).toHaveValue('2,5');
  await page.getByRole('button', {name: 'Сохранить комиссии'}).click();
  await page.getByRole('button', {name: 'Сохранить', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Комиссии обновлены'})).toBeVisible();
});

test('unknown result survives reload and checks the original request', async ({page}) => {
  await page.goto('/?scenario=fees-save-unknown#/admin/fees');
  await page.getByLabel('Покупка', {exact: true}).fill('3');
  await page.getByRole('button', {name: 'Сохранить комиссии'}).click();
  await page.getByRole('button', {name: 'Сохранить', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Не удалось сохранить'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Назад', exact: true}).last()).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('heading', {name: 'Не удалось сохранить'})).toBeVisible();
  await page.getByRole('button', {name: 'Проверить настройки'}).click();
  await expect(page.getByRole('heading', {name: 'Комиссии обновлены'})).toBeVisible();
  await page.getByRole('button', {name: 'К комиссиям'}).click();
  await expect(page.getByLabel('Покупка', {exact: true})).toHaveValue('3');
});
