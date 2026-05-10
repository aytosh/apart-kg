# Краткая история сессии разработки Apart.kg

Дата (ориентир): май 2026. Это не полный дамп чата, а сохранённое резюме работ по плану «Apart.kg differentiation features».

## Запрос пользователя

Продолжить доработку сайта Apart.kg (аренда/продажа жилья), сделать отстройку от конкурентов; план из вложения не редактировать; выполнить все to-do спринтов.

## Результат по спринтам

| Спринт | Кратко |
|--------|--------|
| **0** | ESM + esbuild, миграции Prisma, WebSocket `/ws`, Web Push VAPID, SavedSearch + cron |
| **1** | Верификация (селфи+док), trust-сервис (pHash, EXIF, Jaccard, телефон), отзывы, фильтры доверия |
| **2** | 360° Pannellum, видео, live-показ WebRTC + ws-сигналинг, ViewingRequest |
| **3** | Deal / RentPayment / Escrow, PDF pdfkit, подпись кодом, эскроу через Payment, UI «Мои сделки» |
| **4** | Developer/Complex/ConstructionUpdate/Reservation, таб «Новостройки», лента, push по этапам, бронь с авансом |
| **5** | Roommate (матчинг, лайки), BuildingProfile, отзывы о доме, чат жильцов, BuildingMember |
| **6** | i18n ru/kg/en/zh, автоперевод (DeepL/Google опционально), `/zh`, QR API, wechatId, каркас `wechat-miniprogram/` |
| **7** | FEATURE_FLAGS, AnalyticsEvent + `/api/events`, SW v4 + кэш listings для офлайн, `seoSnapshots.js`, README |

## Где полный чат в Cursor

Полный текст диалога хранится в Cursor (не в этом файле):  
`%USERPROFILE%\.cursor\projects\c-Users-AiteginM-Documents-Cursor\agent-transcripts\` — файлы `.jsonl`.

## Как запустить локально

```bash
npm run install:all
npm run db:migrate --prefix backend
npm run db:seed --prefix backend
npm run vapid:generate   # при необходимости
npm run build
npm run dev
```

Открыть: `http://localhost:3000`. Демо: `admin@demo.kg` / `admin123`, `demo@demo.kg` / `demo123`.
