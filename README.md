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

Котировки обновляются раз в 12 секунд, пока приложение активно. Сделки, портфель, история и ежедневный бонус сохраняются в `localStorage` этого браузера. Контракт источника данных определён в `frontend/src/shared/data/contracts.ts`, локальная реализация находится в `demo-source.ts`, а создаёт её `createAppDataSource.ts` в той же папке.

Для воспроизводимой локальной проверки используйте ссылки `/?scenario=market-loading#/`, `/?scenario=market-error#/`, `/?scenario=market-empty#/` и `/?scenario=market-paused#/`. Приложение добавляет параметр `session`: сценарий хранит данные отдельно в `sessionStorage`, а перезагрузка продолжает ту же сессию. Ссылка без `session` начинает новую. Прежние ссылки `#/?demo=loading` и `#/?demo=error` также поддерживаются.

Торговые сценарии: `/?scenario=buy-repriced#/asset/QST/buy`, `/?scenario=buy-insufficient#/asset/QST/buy`, `/?scenario=trade-unknown#/asset/QST/buy`, `/?scenario=trade-paused#/asset/QST/buy` и `/?scenario=portfolio-empty#/portfolio`. Они изолированы от обычного аккаунта и друг от друга; сохраните полный URL с параметром `session`, чтобы вернуться к прежнему состоянию. Аккаунт версии v1 читается новым источником, а изменения сохраняются в v2. Прежние операции остаются в истории с исходными суммами; комиссия применяется к новым сделкам.

Локальные сценарии оплаты услуги: `/?scenario=payment-open#/payments/study-bot`, `/?scenario=payment-expired#/payments/study-bot` и `/?scenario=payment-unknown#/payments/study-bot`. Данные и результат сохраняются в той же изолированной сессии; обычный прямой маршрут `#/payments/study-bot` использует текущий локальный аккаунт. Эти сценарии работают без платёжного сервера или внешней платёжной системы.

Административные экраны открываются по адресам `#/admin/listings`, `#/admin/listings/study-bot` и `#/admin/fees`. Для проверки состояний используйте `/?scenario=listing-pending#/admin/listings/study-bot`, `/?scenario=listing-approved#/admin/listings`, `/?scenario=listing-rejected#/admin/listings`, `/?scenario=fees-save-error#/admin/fees` и `/?scenario=fees-save-unknown#/admin/fees`. Состояние каждой такой ссылки изолировано в сессии; прямые маршруты без сценария используют обычный локальный аккаунт.

Экраны интеграций доступны по прямым адресам `#/integrations/api` и `#/integrations/mcp`. Изолированные состояния: `/?scenario=api-connected#/integrations/api`, `/?scenario=api-disconnected#/integrations/api`, `/?scenario=mcp-connected#/integrations/mcp` и `/?scenario=mcp-disconnected#/integrations/mcp`. Состояние разрешений и лимита сохраняется в локальном аккаунте или отдельной сессии сценария. Источник создаётся в `frontend/src/shared/data/createAppDataSource.ts` и соответствует интерфейсу `AppDataSource`, что позволяет позднее заменить локальную реализацию. Подключение внешних сервисов здесь не выполняется.

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

## Публикация

Публичная версия 1 работает на Sites. Её статическая сборка получена из коммита `5a2cfe2cd477c5e084f8b32a66f3473c2f29b773`. Для новой версии соберите `frontend/dist/` из `frontend/` и опубликуйте его через Sites. Публикация запускается отдельно от push в GitHub. [Открыть BOTX](https://botx.s-e-r-a-f.chatgpt.site/)

## Настройка Telegram Mini App

1. В [@BotFather](https://t.me/BotFather) выполните `/newbot`. Укажите имя **BOTX** и свободный username, который заканчивается на `bot`. Храните токен приватно. Для frontend он не нужен.
2. Откройте **/mybots → BOTX → Bot Settings → Configure Mini App → Enable Mini App**. Укажите URL `https://botx.s-e-r-a-f.chatgpt.site/`.
3. Выполните `/setmenubutton`, выберите BOTX, укажите тот же HTTPS URL и подпись **Открыть биржу**. Та же настройка есть в **Bot Settings → Menu Button**.
4. В **Edit Bot** добавьте описание и аватар. Откройте Mini App из профиля или меню бота в Telegram на телефоне и компьютере. Проверьте загрузку, кнопку «Назад», поля поиска и количества при открытой клавиатуре, отсутствие перекрытий и обновление котировок примерно через 12 секунд.

Frontend открывается из меню бота. Ответы на `/start` и другие сообщения требуют серверного обработчика. [Документация Telegram Mini Apps](https://core.telegram.org/bots/webapps#launching-the-main-mini-app)

## Лицензия

Авторский исходный код проекта предоставляется по [PolyForm Strict License 1.0.0](LICENSE): разрешены изучение исходников и запуск в личных и иных некоммерческих целях. Лицензия не разрешает изменять код, распространять копии или использовать его коммерчески без отдельного разрешения правообладателя. Шрифт Inter распространяется по [SIL Open Font License 1.1](frontend/src/shared/assets/fonts/LICENSE). Остальные сторонние компоненты и материалы сохраняют собственные условия лицензирования.
