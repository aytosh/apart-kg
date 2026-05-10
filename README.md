# Apart.kg — веб + API

Полноценный **веб-сайт** (адаптивная вёрстка), **PWA** (установка на экран как приложение) и API: **Node.js (Express)**, **Prisma + SQLite**, **JWT**, загрузка фото, избранное, чат по объявлениям, модерация (админ).

**Бренд и домен:** Apart.kg. Логотипы: квадратная иконка `frontend/assets/icon.svg` (PWA, фавикон), полный знак с подписью `frontend/assets/logo-horizontal.svg` (презентации, письма, печать). Фиолетовая тема в `styles.css`.

## Быстрый старт

```bash
# из корня репозитория
npm run install:all          # backend + frontend зависимости
npm run db:migrate --prefix backend   # применить миграции (создаст dev.db)
npm run db:seed              # демо-данные
npm run vapid:generate       # сгенерировать VAPID-ключи (вставить в backend/.env)
npm run build                # собрать фронт (esbuild → frontend/dist/app.js)
npm run dev                  # API + esbuild --watch одной командой
```

Откройте в браузере: **http://localhost:3000**

Сервер отдаёт и API (`/api/...`), и статику из папки `frontend/`. WebSocket: `ws://localhost:3000/ws`.

### Структура фронта

`frontend/src/` — ESM-модули (entry: `src/main.js`); сборка через esbuild в `frontend/dist/app.js`. Чтобы пересобирать «на лету», запускается `npm run dev:web` (или общий `npm run dev`, который поднимает API и watcher параллельно).

### PWA

В Chrome/Edge на десктопе или Android после открытия сайта можно **установить приложение** (иконка в адресной строке или раздел «Ещё» → «Установить Apart.kg»). Работает **service worker** (`frontend/sw.js`) — кэш статики, запросы к `/api/` всегда из сети.

## Учётные записи (после seed)

| Email | Пароль | Роль |
|-------|--------|------|
| admin@demo.kg | admin123 | Администратор (модерация) |
| demo@demo.kg | demo123 | Обычный пользователь |

## Структура

| Папка | Назначение |
|-------|------------|
| [backend/](backend/) | API, БД `dev.db`, загрузки в `uploads/` |
| [frontend/](frontend/) | SPA: каталог, карта, размещение, избранное, чат, админ |
| [web-demo/](web-demo/) | Старый статический демо без сервера (опционально) |

## API (кратко)

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/listings` — фильтры: `deal`, `type`, `search`
- `POST /api/listings` — новое объявление (на модерацию)
- `GET/POST/DELETE /api/favorites/:listingId`
- `GET /api/messages/threads`, `GET /api/messages/listing/:id`, `POST /api/messages`
- `POST /api/upload` — multipart `files` (до 12), нужен JWT
- `GET /api/admin/listings/pending`, `POST .../approve`, `POST .../reject` — только `ADMIN`
- `GET /api/payments/plans`, `POST /api/payments/create`, `POST /api/payments/demo-pay/:id` — платежи (sandbox)
- `GET /api/push/public-key`, `POST /api/push/subscribe` (JWT) — Web Push подписка
- `GET/POST/PATCH/DELETE /api/saved-searches` (JWT) — сохранённые поиски с push-уведомлениями
- `POST /api/verification/start` (JWT, multipart) — селфи + документ на ID-верификацию
- `GET /api/admin/verifications`, `POST .../approve|reject` — модерация заявок
- `POST /api/reviews` (JWT) — отзыв о владельце/арендаторе после сделки
- `GET /api/reviews/user/:id`, `GET /api/reviews/profile/:id` — отзывы и публичный профиль
- `GET /api/listings?verifiedOnly=true&minTrust=70&has360=true&hasVideo=true&liveAvailable=true` — фильтры по доверию и иммерсиву
- `POST /api/upload/video` (JWT, multipart `file`) — загрузка видеообзора (mp4/webm/mov, до 80 МБ)
- `POST /api/viewings/listing/:listingId` (JWT) — запрос онлайн-показа (slot, message)
- `POST /api/viewings/:id/{accept,decline,start,end,cancel}` — переходы статуса
- `GET /api/viewings/mine` — мои запросы (как арендатор и владелец)
- WebSocket: `ws://<host>/ws?token=<JWT>` — realtime-уведомления и WebRTC-сигналинг (`rtc-join`, `rtc-offer`, `rtc-answer`, `rtc-ice`, `rtc-leave`)
- `POST /api/deals` (JWT) — создать сделку, `POST /api/deals/:id/sign/request|sign` — подпись кодом, `POST .../escrow/hold|release`, `POST .../payments/:rentPaymentId/pay`, `POST .../cancel|dispute`, `GET /api/deals/mine`
- `GET/POST/PATCH /api/developers`, `GET/POST/PATCH /api/complexes`, `GET /api/complexes/:id/feed|units`, `POST /api/complexes/:id/updates|subscribe|unsubscribe`, `GET /api/complexes/mine/subscriptions`
- `POST /api/reservations/listings/:listingId` — онлайн-бронь с авансом через эскроу, `GET /api/reservations/mine`
- `POST /api/roommates`, `GET /api/roommates/feed|matches`, `POST /api/roommates/:id/like` — Tinder-матчинг
- `POST /api/buildings/lookup` (адрес → профиль), `GET/POST /api/buildings/:id/reviews`, `POST /api/buildings/:id/membership/request`, `GET/POST /api/buildings/:id/chat`
- `GET /api/i18n` (список словарей), `GET /api/i18n/:lang`, `POST /api/i18n/listings/:id/retranslate`
- `GET /api/zh/listings|/:id` — упрощённый JSON для WeChat Mini Program и `/zh`-лендинга
- `GET /api/qr/listings/:id`, `GET /api/qr/wechat/:userId` — SVG QR-коды
- `POST /api/events` — клиентская аналитика, `GET /api/events/summary` (admin) — агрегаты за неделю
- `GET /api/config` отдаёт VAPID-ключ и `featureFlags` для фронта

## Чем мы отличаемся

Готовые «фишки», которых нет у house.kg:

- **Сохранённые поиски с push.** Включил фильтры → нажал «⭐ Сохранить поиск» → как только появится новое объявление под условие, придёт push (даже когда вкладка закрыта).
- **Trust Score объявления.** Каждое объявление получает оценку 0–100 на основе автоматических проверок: pHash-дубликаты фото, наличие EXIF/GPS, дубль описания (Jaccard), реюз телефона, ID-верификация владельца. Шкала видна в карточке и в детальном окне.
- **Верификация владельца.** Селфи + фото документа → бейдж «Проверенный владелец» после ручного одобрения. Фильтр «Только проверенные» в каталоге.
- **Рейтинги после сделки.** 1–5 звёзд + комментарий, отдельные роли LANDLORD/TENANT, средний рейтинг и количество отзывов в профиле.
- **Иммерсивный просмотр.** Загрузка панорамных фото (Pannellum-просмотрщик 360°), видеообзор прямо из формы создания объявления, **онлайн-показ через WebRTC** (1:1 видео-звонок поверх ws-сигналинга, без сторонних сервисов). Фильтры в каталоге: «Есть 360°», «Есть видео», «Доступен онлайн-показ».
- **Безопасная сделка.** Цифровая сделка с PDF-договором (pdfkit, кириллический шрифт), подпись одноразовым кодом по email/SMS, эскроу-депозит поверх внутренних платежей, автоматический график ежемесячных платежей и push-напоминаний.
- **Котлован-трекер.** Раздел «Новостройки»: ЖК с прогресс-баром по этапам стройки (Фундамент → Каркас → Фасад → Отделка → Сдан), Instagram-style лента обновлений, push при каждом этапе для подписчиков, онлайн-бронирование юнита с авансом через эскроу.
- **Сосед (комьюнити).** Roommate-анкеты со swipe-интерфейсом и lifestyle-матчингом (Jaccard по тегам + пересечение бюджетов), профиль дома с рейтингом и отзывами, чат жильцов с авто-апрувом для верифицированных арендаторов.
- **Китайский сегмент / WeChat.** i18n словари (RU/KG/EN/ZH), фоновый автоперевод объявлений (DeepL/Google), упрощённый `/zh`-лендинг, QR-коды на каждое объявление и WeChat-ID владельца, каркас WeChat Mini Program в `wechat-miniprogram/`.
- **Аналитика и feature-flags.** События пишутся в `AnalyticsEvent`, флаги через `FEATURE_FLAGS` в `.env` отдаются клиенту, чтобы быстро выключить любую «фишку».
- **PWA-offline (последние 50).** Service worker дополнительно кеширует ответы `/api/listings/*` — последние 50 просмотренных карточек открываются без сети.
- **Realtime-канал.** WebSocket + Web Push — фундамент для иммерсивного просмотра, сделок, комьюнити и live-показов.
- **SSR-снепшоты для SEO.** Скрипт `npm run seo:snapshots --prefix backend -- http://localhost:3000` рендерит главную, `/zh` и топ объявлений в статичный HTML и раздаёт их по `/seo/...` для краулеров.

## Переменные окружения

Скопируйте [backend/.env.example](backend/.env.example) в `backend/.env` и при необходимости измените `JWT_SECRET`, `PORT`, `CLIENT_ORIGIN`, `PAYMENT_PROVIDER`, `PAYMENT_WEBHOOK_SECRET`.

## Документация продукта

- [ТЗ.md](ТЗ.md), [Бизнес-план.md](Бизнес-план.md), [Расчет-расходов.md](Расчет-расходов.md)
