import {expect, test} from '@playwright/test';

test('Telegram Back closes payment confirmation before leaving the payment page', async ({page}) => {
  await page.route('https://telegram.org/js/**', (route) => route.fulfill({contentType: 'application/javascript', body: `
    const handlers = new Set();
    const state = {visible: false};
    window.backState = state;
    window.pressBack = () => [...handlers].forEach((handler) => handler());
    window.Telegram = {WebApp: {platform: 'android', isVersionAtLeast: () => true, BackButton: {
      show() { state.visible = true; }, hide() { state.visible = false; },
      onClick(handler) { handlers.add(handler); }, offClick(handler) { handlers.delete(handler); },
    }}};
  `}));
  await page.goto('/?scenario=payment-open#/payments/study-bot');
  const payment = page.getByRole('button', {name: 'Оплатить 100,50 BC'});
  await payment.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(() => (window as Window & {pressBack: () => void}).pressBack());
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(payment).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & {backState: {visible: boolean}}).backState.visible)).toBe(true);
  await payment.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as Window & {backState: {visible: boolean}}).backState.visible)).toBe(true);
});

test('works outside Telegram when the SDK request fails', async ({page}) => {
  await page.route('https://telegram.org/js/**', (route) => route.abort());
  const crashes: string[] = [];
  page.on('pageerror', (error) => crashes.push(error.message));
  await page.goto('/#/profile');
  await expect(page.getByText('@username')).toBeVisible();
  await page.getByRole('link', {name: 'Биржа', exact: true}).click();
  await page.getByRole('link', {name: /QuestBot/}).click();
  await expect(page.getByRole('heading', {name: 'QuestBot'})).toBeVisible();
  expect(crashes).toEqual([]);
});

test('Telegram bridge uses WebApp viewport, theme, BackButton and activation', async ({page}) => {
  await page.route('https://telegram.org/js/**', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      const events = new Map();
      const backHandlers = new Set();
      window.telegramCalls = {ready: 0, expand: 0};
      const WebApp = {
        platform: 'android', colorScheme: 'dark', viewportStableHeight: 750,
        safeAreaInset: {top: 21, bottom: 12}, contentSafeAreaInset: {top: 16},
        isActive: true, initDataUnsafe: {user: {username: 'test_trader'}},
        isVersionAtLeast: () => true,
        ready() { telegramCalls.ready++; },
        expand() { telegramCalls.expand++; },
        onEvent(name, handler) { events.set(name, handler); },
        offEvent(name, handler) { if (events.get(name) === handler) events.delete(name); },
        BackButton: {
          show() {}, hide() {},
          onClick(handler) { backHandlers.add(handler); },
          offClick(handler) { backHandlers.delete(handler); },
        },
      };
      window.Telegram = {WebApp};
      window.emitHost = (event, update = {}) => {
        Object.assign(WebApp, update);
        if (event === 'back') backHandlers.forEach((handler) => handler());
        else events.get(event)?.();
      };
      Math.random = () => 0.95;
    `,
  }));
  await page.clock.install();
  await page.goto('/#/');
  const app = page.locator('[data-app-shell]');
  await expect(app).toHaveCSS('height', '750px');
  await expect(app.locator('> header')).toHaveCSS('padding-top', '37px');
  const calls = await page.evaluate(() => (window as Window & {telegramCalls?: unknown}).telegramCalls);
  expect(calls).toEqual({ready: 1, expand: 1});

  const emit = async (event: string, update?: object): Promise<void> => {
    await page.evaluate(([name, data]) => {
      (window as Window & {emitHost?: (name: string, data?: object) => void}).emitHost?.(name, data);
    }, [event, update] as const);
  };
  await emit('themeChanged', {colorScheme: 'light'});
  await expect(app).toHaveAttribute('data-telegram-theme', 'light');
  await expect(app).toHaveCSS('background-color', 'rgb(11, 16, 32)');
  await emit('viewportChanged', {viewportStableHeight: 690});
  await expect(app).toHaveCSS('height', '690px');
  await emit('contentSafeAreaChanged', {contentSafeAreaInset: {top: 24}});
  await expect(app.locator('> header')).toHaveCSS('padding-top', '45px');

  const quote = page.getByRole('link', {name: /QuestBot/});
  await expect(quote).toContainText('248 BC');
  await emit('deactivated', {isActive: false});
  await page.clock.runFor(36_000);
  await expect(quote).toContainText('248 BC');
  await emit('activated', {isActive: true});
  await page.clock.runFor(12_000);
  await expect(quote).not.toContainText('248 BC');

  await quote.click();
  await page.getByRole('button', {name: 'Купить', exact: true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await emit('back');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', {name: 'QuestBot'})).toBeVisible();
  await emit('back');
  await expect(page.getByRole('heading', {name: 'Биржа'})).toBeVisible();
  await page.getByRole('link', {name: 'Профиль'}).click();
  await expect(page.getByText('@test_trader')).toBeVisible();
});

test('browser visibility stops the 12-second timer and restarts without catch-up', async ({page}) => {
  await page.route('https://telegram.org/js/**', (route) => route.fulfill({body: 'Math.random = () => 1;'}));
  await page.clock.install();
  await page.goto('/#/');
  const quote = page.getByRole('link', {name: /QuestBot/});
  await expect(quote).toContainText('248 BC');
  const visibility = async (hidden: boolean): Promise<void> => {
    await page.evaluate((value) => {
      Object.defineProperty(document, 'hidden', {configurable: true, value});
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  };
  await visibility(true);
  await page.clock.runFor(48_000);
  await expect(quote).toContainText('248 BC');
  await visibility(false);
  await page.clock.runFor(12_000);
  await expect(quote).toContainText('252,96 BC');
});
