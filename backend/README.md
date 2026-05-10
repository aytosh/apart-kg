# Apart.kg API

Express + Prisma (SQLite) + JWT.

## Команды

| Команда | Описание |
|---------|----------|
| `npm install` | Зависимости |
| `npm run db:migrate` | Применить миграции (рекомендуется) |
| `npx prisma db push` | Быстрая синхронизация без истории (для прототипа) |
| `npx prisma db seed` | Демо-пользователи и объявления |
| `npm run dev` | Сервер с автоперезапуском (`node --watch`) |
| `npm start` | Запуск без watch |
| `npm run vapid:generate` | Сгенерировать VAPID-ключи для Web Push |
| `npx prisma studio` | Просмотр таблиц в браузере |

## Realtime и push

- WebSocket: `ws://<host>/ws?token=<JWT>` — авторизация на handshake; используется для онлайн-уведомлений и (Sprint 2) сигналинга WebRTC.
- Web Push: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` в `.env` — без них push-уведомления отключаются автоматически.
- `POST /api/push/subscribe` (JWT) — браузер регистрирует свою подписку.
- `notifyUser(userId, payload)` (`src/realtime/notify.js`) — отправляет уведомление и в WS, и в push.

## Сохранённые поиски (`SavedSearch`)

- `GET /api/saved-searches` — список (JWT).
- `POST /api/saved-searches` — `{ name, filters, notify }`.
- `PATCH /api/saved-searches/:id` — переключение notify / переименование.
- `DELETE /api/saved-searches/:id` — удалить.
- Cron `src/jobs/savedSearches.js` каждые `SAVED_SEARCH_INTERVAL_MINUTES` (по умолчанию 10) проверяет `ACTIVE`-объявления, появившиеся после `lastNotifiedAt`, и шлёт `notifyUser(...)`.

## Trust pipeline (`src/services/trust.js`)

При каждом создании объявления автоматически:

1. Считается **dHash 64-bit** каждого фото (`sharp` → 9×8 grayscale → разностный хэш) и сохраняется в `PhotoHash`. Если хэш близок (Hamming ≤ 8) к фото другого владельца — флаг `duplicatePhotos`.
2. Из EXIF (`exifr`) проверяется наличие метаданных и GPS — если все фото без них, флаги `missingExif` / `missingGps`.
3. Описание разбивается на биграммы и сравнивается (Jaccard) с последними 200 объявлениями. ≥ 0.85 — `textDuplicate`.
4. Если телефон владельца встречается в ≥ 5 объявлениях других пользователей — `suspiciousPhone`.
5. Если владелец не имеет `verifiedLevel = ID` — `unverifiedOwner` (мягкий штраф).

Итоговый score = `100 − штрафы`, при `< 40` объявление помечается `requiresManual` и попадает в очередь модерации. Backfill: `npm run trust:recompute -- --force`.

## Верификация и отзывы

- `Verification` — селфи + документ; одобряется/отклоняется через `/api/admin/verifications/...`. После одобрения у пользователя `verifiedLevel = ID` и `verifiedAt`.
- `Review` — связан с `Deal` (Sprint 3) или standalone; пересчитывает `User.ratingAvg`/`ratingCount` через `recomputeUserRating`.

## Иммерсивный просмотр (Sprint 2)

- `Listing.tourPhotos` — JSON `[{path, type:'flat'|'panorama360', label}]`. Сам просмотрщик (Pannellum) живёт на фронте; бэкенд только хранит метку типа.
- `Listing.videoUrl` — путь к загруженному видео (`POST /api/upload/video`).
- `Listing.liveAvailable` — флаг готовности владельца проводить онлайн-показы.
- `ViewingRequest` — заявка на онлайн-показ (PENDING → CONFIRMED → STARTED → ENDED). Сохраняется уникальный `roomId`.
- WebRTC сигналинг идёт через `/ws`. Клиент шлёт `{ type: 'rtc-join', roomId }`, сервер проверяет `viewingRequest` и записывает участника в комнату; затем `rtc-offer/answer/ice` ретранслируются другому участнику той же комнаты.
- Видео-звонок 1:1 на нативном `RTCPeerConnection`, STUN — Google. TURN — добавим, когда появится платный домен.

## Переменные

См. `.env.example`. Обязательно задайте `JWT_SECRET` в продакшене.

## Папки

- `prisma/dev.db` — SQLite (в `.gitignore`)
- `uploads/` — загруженные изображения (в `.gitignore`)

## Порт по умолчанию

`3000`. Интерфейс: `http://localhost:3000` (статика из `../frontend`).

## Платежи (MVP)

- `GET /api/payments/plans` — тарифы и список провайдеров (пока `DEMO` включён).
- `POST /api/payments/create` — создать платёж (JWT).
- `POST /api/payments/demo-pay/:id` — имитация успешной оплаты (JWT, только sandbox).
- Админ: `GET /api/admin/dashboard`, `GET /api/admin/payments/recent`.

## Импорт объявлений без риелторов (preview)

Скрипт `npm run import:owners` читает **только JSON** (массив или `items`/`data`) и делает черновой фильтр «похоже на собственника».

**Не подходят** главные страницы сайтов (`https://house.kg`, `https://apartment.kg` и т.п.) — браузер получает **HTML**, не JSON, поэтому будет ошибка про `<!DOCTYPE`.

Примеры:

```bash
# Публичные JSON-фиды (если у вас есть разрешённый URL)
IMPORT_SOURCES="https://example.com/feed.json" npm run import:owners
```

```bash
# Локальный файл (относительный путь от папки backend)
IMPORT_SOURCES="data/my-listings.json" npm run import:owners
```

```bash
# Сразу импорт в БД (создаст объявления в статусе PENDING)
IMPORT_SOURCES="data/my-listings.json" IMPORT_TO_DB=true IMPORT_USER_EMAIL="demo@demo.kg" npm run import:owners
```

Результат: `backend/data/owner-import-preview.json`

Важно:
- использовать только источники, где разрешён импорт по ToS/договору;
- фильтр эвристический (слова вроде «риелтор/агентство»), перед публикацией нужна модерация.
