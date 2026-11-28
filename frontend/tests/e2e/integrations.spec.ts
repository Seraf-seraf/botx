import {expect, test} from '@playwright/test';

test('API permissions, cancellation, revocation and reopening persist locally', async ({page}) => {
  const external: string[] = [];
  page.on('request', (request) => { if (['fetch', 'xhr'].includes(request.resourceType())) external.push(request.url()); });
  await page.goto('/?scenario=api-connected#/integrations/api');
  await expect(page.getByRole('heading', {name: 'Подключение бота'})).toBeVisible();
  await page.getByRole('button', {name: 'Настроить доступ'}).click();
  const checkbox = page.getByRole('checkbox', {name: /Награды/});
  await checkbox.uncheck();
  await page.getByRole('button', {name: 'Сохранить доступ'}).click();
  await page.getByRole('button', {name: 'Отмена'}).click();
  await expect(checkbox).not.toBeChecked();
  await expect(page.getByRole('button', {name: 'Сохранить доступ'})).toBeFocused();
  await page.getByRole('button', {name: 'Сохранить доступ'}).click();
  await page.getByRole('button', {name: 'Подтвердить'}).click();
  await expect(page.getByRole('heading', {name: 'Доступ сохранён'})).toBeVisible();
  await page.getByRole('button', {name: 'К интеграции'}).click();
  await expect(page.getByRole('button', {name: 'Настроить доступ'})).toBeFocused();
  await page.getByRole('button', {name: 'Отозвать ключ'}).click();
  await page.getByRole('button', {name: 'Отмена'}).click();
  await page.getByRole('button', {name: 'Отозвать ключ'}).click();
  await page.getByRole('button', {name: 'Отозвать ключ'}).click();
  await expect(page.getByRole('heading', {name: 'Ключ отозван'})).toBeVisible();
  await page.getByRole('button', {name: 'Назад к подключению'}).click();
  await expect(page.getByRole('button', {name: 'Подключить заново'})).toBeFocused();
  await page.reload();
  await expect(page.getByText('Действующего API-ключа нет.', {exact: false})).toBeVisible();
  await page.getByRole('button', {name: 'Подключить заново'}).click();
  await expect(page.getByRole('checkbox', {name: /Награды/})).not.toBeChecked();
  await page.getByRole('button', {name: 'Сохранить доступ'}).click();
  await page.getByRole('button', {name: 'Подтвердить'}).click();
  await expect(page.getByRole('heading', {name: 'Доступ сохранён'})).toBeVisible();
  expect(external).toEqual([]);
});

test('disconnected screen and keyboard remain usable at narrow widths', async ({page}) => {
  await page.setViewportSize({width: 320, height: 700});
  await page.goto('/?scenario=api-disconnected#/integrations/api');
  await expect(page.getByRole('button', {name: 'Подключить заново'})).toBeVisible();
  await page.getByRole('button', {name: 'Подключить заново'}).click();
  const checkbox = page.getByRole('checkbox', {name: /Котировки/});
  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('API screens fit supported widths and honour motion preferences', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.goto('/?scenario=api-connected#/integrations/api');
  for (const width of [320, 360, 390, 430, 1100]) {
    await page.setViewportSize({width, height: 844});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('button', {name: 'Настроить доступ'})).toBeVisible();
  }
  await page.getByRole('button', {name: 'Отозвать ключ'}).click();
  await page.getByRole('button', {name: 'Отмена'}).click();
  await expect(page.getByRole('button', {name: 'Отозвать ключ'})).toBeFocused();
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.getByRole('button', {name: 'Настроить доступ'}).click();
  await expect(page.getByRole('checkbox', {name: /Котировки/})).toBeVisible();
});


test('keyboard cancel and back restore focus to reconnect', async ({page}) => {
  await page.goto('/?scenario=api-disconnected#/integrations/api');
  const reconnect = page.getByRole('button', {name: 'Подключить заново'});
  await reconnect.focus(); await page.keyboard.press('Enter');
  await page.getByRole('button', {name: 'Отмена'}).focus(); await page.keyboard.press('Enter');
  await expect(reconnect).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('button', {name: 'Назад'}).focus(); await page.keyboard.press('Enter');
  await expect(reconnect).toBeFocused();
});

test('state and confirmation transitions honour motion settings', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.goto('/?scenario=api-connected#/integrations/api');
  await page.getByRole('button', {name: 'Настроить доступ'}).click();
  const duration = (): Promise<string> => page.locator('main section').evaluate((element) => getComputedStyle(element).animationDuration);
  expect(await duration()).toBe('0.16s');
  await page.getByRole('button', {name: 'Сохранить доступ'}).click();
  expect(await duration()).toBe('0.22s');
  await page.emulateMedia({reducedMotion: 'reduce'});
  expect(parseFloat(await duration())).toBeLessThanOrEqual(0.08);
  await page.getByRole('button', {name: 'Отмена'}).click();
  expect(parseFloat(await duration())).toBeLessThanOrEqual(0.08);
});

test('MCP access validates limit, confirms, revokes and reconnects without affecting API', async ({page}) => {
  const calls: string[] = [];
  page.on('request', (request) => { if (['fetch', 'xhr'].includes(request.resourceType())) calls.push(request.url()); });
  await page.goto('/?scenario=mcp-connected#/integrations/mcp');
  const limit = page.getByRole('textbox', {name: 'Лимит расходов'});
  await expect(limit).toHaveValue('500');
  for (const value of ['', '0', '1,234', '-1']) {
    await limit.fill(value);
    await expect(page.getByRole('button', {name: 'Сохранить разрешения'})).toBeDisabled();
    await expect(page.getByRole('alert')).toBeVisible();
  }
  await limit.fill('123,45');
  await page.getByRole('checkbox', {name: /Покупка и продажа/}).uncheck();
  await page.getByRole('button', {name: 'Сохранить разрешения'}).click();
  await expect(page.getByText('123,45 BC')).toBeVisible();
  await page.getByRole('button', {name: 'Отмена'}).click();
  await expect(limit).toHaveValue('123,45');
  await expect(page.getByRole('button', {name: 'Сохранить разрешения'})).toBeFocused();
  await page.getByRole('button', {name: 'Сохранить разрешения'}).click();
  await page.getByRole('button', {name: 'Выдать доступ', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Разрешения обновлены'})).toBeVisible();
  await page.getByRole('button', {name: 'К настройкам'}).click();
  await expect(page.getByRole('button', {name: 'Сохранить разрешения'})).toBeFocused();
  await page.getByRole('button', {name: 'Отозвать доступ'}).click();
  await page.getByRole('button', {name: 'Отмена'}).click();
  await expect(page.getByRole('button', {name: 'Отозвать доступ'})).toBeFocused();
  await page.getByRole('button', {name: 'Отозвать доступ'}).click();
  await page.getByRole('button', {name: 'Отозвать доступ'}).click();
  await expect(page.getByRole('heading', {name: 'Доступ отозван'})).toBeVisible();
  await page.getByRole('button', {name: 'К настройкам'}).click();
  await expect(page.getByRole('button', {name: 'Выдать доступ заново'})).toBeFocused();
  await page.reload();
  await page.getByRole('button', {name: 'Выдать доступ заново'}).click();
  await expect(limit).toHaveValue('123,45');
  await expect(page.getByRole('checkbox', {name: /Покупка и продажа/})).not.toBeChecked();
  await page.getByRole('button', {name: 'Отмена'}).click();
  await expect(page.getByRole('button', {name: 'Выдать доступ заново'})).toBeFocused();
  await page.goto(`${new URL(page.url()).search}#/integrations/api`);
  await expect(page.getByText('Study Bot', {exact: true})).toBeVisible();
  expect(calls).toEqual([]);
});

test('MCP form and confirmations fit supported widths and respect motion', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.goto('/?scenario=mcp-connected#/integrations/mcp');
  for (const width of [320, 360, 390, 430, 1100]) {
    await page.setViewportSize({width, height: 844});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('textbox', {name: 'Лимит расходов'})).toBeVisible();
  }
  await page.getByRole('button', {name: 'Сохранить разрешения'}).click();
  const screen = page.locator('main section');
  await expect(screen).toHaveCSS('animation-duration', '0.22s');
  await page.emulateMedia({reducedMotion: 'reduce'});
  expect(parseFloat(await screen.evaluate((element) => getComputedStyle(element).animationDuration))).toBeLessThanOrEqual(0.08);
  await page.getByRole('button', {name: 'Отмена'}).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', {name: 'Сохранить разрешения'})).toBeFocused();
});


test('MCP limit preserves the largest safe value across confirmation and reload', async ({page}) => {
  await page.goto('/?scenario=mcp-connected#/integrations/mcp');
  const field = page.getByRole('textbox', {name: 'Лимит расходов'});
  const value = '90071992547409,91';
  await field.fill(value);
  await page.getByRole('button', {name: 'Сохранить разрешения'}).click();
  await expect(page.getByText(`${value} BC`, {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Выдать доступ', exact: true}).click();
  await expect(page.getByText(`${value} BC`, {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'К настройкам'}).click();
  await expect(field).toHaveValue(value);
  await page.reload();
  await expect(field).toHaveValue(value);
  await page.getByRole('button', {name: 'Сохранить разрешения'}).click();
  await page.getByRole('button', {name: 'Выдать доступ', exact: true}).click();
  await expect(page.getByText(`${value} BC`, {exact: true})).toBeVisible();
});
