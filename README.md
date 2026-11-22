# BOTX

Игровая биржа Telegram-ботов с виртуальной валютой BC. Приложение располагается в `frontend/`.

## Локальный запуск

Нужен Node.js 24.

```sh
cd frontend
npm ci
npm run dev
```

Дизайн BOTX в Figma задаёт экраны, состояния и исходную библиотеку значков. [Макет BOTX](https://www.figma.com/design/K9Dwu6tr9j5oOWjiuThWjF?node-id=4-171).

## Демоданные

Котировки обновляются раз в 12 секунд, пока приложение активно. Сделки, портфель, история и ежедневный бонус сохраняются в `localStorage` этого браузера. Контракт источника данных определён в `frontend/src/shared/data/contracts.ts`, его локальная реализация находится в `demo-source.ts` в той же папке. Для проверки загрузки и ошибки биржи откройте `#/?demo=loading` или `#/?demo=error`.

## Проверки и сборка

Из `frontend/` выполните:

```sh
npm run typecheck
npm run lint
npm run test -- --run
npx playwright install chromium
npm run test:e2e
npm run build
```

Playwright проверяет сценарии покупки, продажи, бонуса, клавиатурной навигации, адаптивности и работу Telegram bridge с подменой SDK. Vite собирает статическое приложение в `frontend/dist/`.
