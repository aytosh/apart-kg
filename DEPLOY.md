# Деплой Apart.kg

Короткий, проверенный путь от текущего dev-стенда до боевого сервера.

---

## 0. Что уже готово

- Один процесс Node.js (Express) отдаёт **и API**, и статику фронта (`frontend/`), и `dist/app.js`.
- Миграции Prisma коммитятся в `backend/prisma/migrations/` (12 шт.).
- Сборка фронта — `npm run build` в `frontend/` (esbuild → `frontend/dist/app.js`).
- Воркфлоу для деплоя из админки уже есть: `deploy/github-repository-dispatch.example.yml`.

---

## 1. Перед деплоем — обязательные шаги

### 1.1 Сменить базу с SQLite на Postgres (для прод-нагрузки)

В `backend/prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

В `.env` на сервере:

```
DATABASE_URL="postgresql://user:pass@host:5432/apartkg"
```

Затем:

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

> SQLite оставьте только для локальной разработки. Для прод-стенда с одним инстансом и низкой нагрузкой SQLite тоже сработает, но бэкапы и масштабирование удобнее на Postgres.

### 1.2 Сгенерировать секреты

```bash
# JWT
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# Web Push (VAPID)
cd backend && npm run vapid:generate
```

Положить в `.env`:

- `JWT_SECRET` — длинная случайная строка (не дефолтная!).
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:admin@apart.kg`.
- `PAYMENT_WEBHOOK_SECRET` — случайная строка.

### 1.3 Заполнить ключи внешних сервисов

Все опциональны — без них фича просто отключается, но желательно подключить:

| Переменная | Где брать |
|---|---|
| `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`, `RECAPTCHA_VERSION=v3` | https://www.google.com/recaptcha/admin |
| `GOOGLE_CLIENT_ID` | https://console.cloud.google.com → OAuth Client (Web), Authorized origins = ваш домен |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | https://developers.facebook.com → Apps → Facebook Login |
| `DEEPL_API_KEY` или `GOOGLE_TRANSLATE_KEY` | для авто-перевода объявлений в i18n |
| `CURRENCY_RATES` | JSON-курсы (или подключите cron, который раз в час обновляет переменную) |
| `DEPLOY_WEBHOOK_URL`, `DEPLOY_WEBHOOK_SECRET` | GitHub repo + classic PAT (см. п. 4) |

### 1.4 CORS и origin

В `.env`:

```
CLIENT_ORIGIN="https://apart.kg,https://www.apart.kg"
```

Если фронт на отдельном домене — добавить туда.

---

## 2. Минимальный production-стенд (без Docker)

Сервер: Ubuntu 22.04, Node.js 20+, Postgres 14+, nginx.

```bash
# 1) Деплой кода
git clone https://github.com/<you>/apart-kg.git /var/www/apartkg
cd /var/www/apartkg
npm run install:all

# 2) Окружение
cp backend/.env.example backend/.env
# отредактировать backend/.env под продакшен (см. шаги 1.1–1.4)

# 3) Миграции и сборка
cd backend && npx prisma migrate deploy && npx prisma generate
cd ../frontend && npm run build
cd ..

# 4) PM2 как процесс-менеджер
sudo npm i -g pm2
pm2 start backend/src/server.js --name apartkg-api --cwd /var/www/apartkg
pm2 save
pm2 startup    # выполните выведенную команду
```

### nginx (HTTPS reverse proxy)

`/etc/nginx/sites-available/apartkg`:

```nginx
server {
  listen 80;
  server_name apart.kg www.apart.kg;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name apart.kg www.apart.kg;

  # SSL: certbot делает сам
  ssl_certificate     /etc/letsencrypt/live/apart.kg/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/apart.kg/privkey.pem;

  client_max_body_size 100M;   # для загрузки видео до 80 МБ

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # WebSocket (онлайн-показ, push)
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 1d;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/apartkg /etc/nginx/sites-enabled/
sudo certbot --nginx -d apart.kg -d www.apart.kg
sudo nginx -t && sudo systemctl reload nginx
```

### Бэкапы

Cron на сервере:

```cron
# каждые 6 часов: дамп Postgres + uploads
0 */6 * * * pg_dump apartkg | gzip > /var/backups/apartkg-$(date +\%F-\%H).sql.gz
0 4 * * *   tar -czf /var/backups/uploads-$(date +\%F).tar.gz /var/www/apartkg/backend/uploads
```

---

## 3. Деплой через Docker (опция)

Минимальный `Dockerfile` в корне:

```dockerfile
FROM node:20-bookworm-slim
WORKDIR /app
COPY package*.json ./
COPY backend/package*.json backend/
COPY frontend/package*.json frontend/
RUN npm run install:all
COPY . .
RUN cd backend && npx prisma generate
RUN cd frontend && npm run build
EXPOSE 3000
CMD ["node", "backend/src/server.js"]
```

`docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: apartkg
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: apartkg
    volumes: [pgdata:/var/lib/postgresql/data]
  api:
    build: .
    env_file: .env
    environment:
      DATABASE_URL: postgresql://apartkg:${POSTGRES_PASSWORD}@db:5432/apartkg
    depends_on: [db]
    ports: ["3000:3000"]
    volumes:
      - ./backend/uploads:/app/backend/uploads
volumes:
  pgdata:
```

Запуск: `docker compose up -d` → миграции через `docker compose exec api npx prisma migrate deploy`.

---

## 4. Деплой из админ-панели (уже встроено)

В админке (`/admin`, роль `ADMIN`) есть кнопка «Перезапустить деплой». Она дёргает `POST /api/admin/deploy`, который шлёт `repository_dispatch` в GitHub.

В репозитории создайте `.github/workflows/deploy-from-admin.yml` по образцу `deploy/github-repository-dispatch.example.yml`. В нём напишите ваш реальный шаг (ssh + `git pull && npm run install:all && npx prisma migrate deploy && npm run build && pm2 reload apartkg-api`).

В `.env` сервера:

```
DEPLOY_WEBHOOK_URL=https://api.github.com/repos/OWNER/REPO/dispatches
DEPLOY_WEBHOOK_SECRET=<classic PAT с правом repo>
```

---

## 5. Чек-лист перед публикацией

- [ ] **БД**: Postgres, миграции применены (`npx prisma migrate deploy`).
- [ ] **`.env`**: новые `JWT_SECRET`, `VAPID_*`, `PAYMENT_WEBHOOK_SECRET`, `CLIENT_ORIGIN` с прод-доменом.
- [ ] **HTTPS**: certbot выпустил серт, nginx проксирует и API, и `/ws`.
- [ ] **Сборка**: `npm run build` в `frontend/` сделана, `frontend/dist/app.js` присутствует.
- [ ] **Сидинг**: либо запустить `npm run db:seed` для демо-данных, либо удалить демо-аккаунты после первого админа.
- [ ] **Демо-провайдер платежей**: `PAYMENT_PROVIDER=DEMO` оставляйте только если боевые платежи ещё не подключены. Иначе подключите MBank/Элсом/О!Деньги в `routes/payments.js`.
- [ ] **Промо тарифы**: `POST /api/promo/activate` сейчас активирует тариф **без реальной оплаты** (создаёт `Payment` со `status=PAID`, `provider=DEMO`). Перед прод-запуском завернуть активацию в успешный webhook платёжного шлюза.
- [ ] **reCAPTCHA / OAuth**: домен сайта добавлен в Authorized origins.
- [ ] **Бэкапы**: cron поднят, проверьте, что хотя бы один дамп успешно сложился.
- [ ] **Push-уведомления**: VAPID-ключи в `.env`, в браузере с прода кликните 🔔 и убедитесь, что уведомления приходят.
- [ ] **i18n**: `DEEPL_API_KEY` или `GOOGLE_TRANSLATE_KEY` подключены, иначе содержимое объявлений останется на языке оригинала.
- [ ] **Курсы валют**: `CURRENCY_RATES` соответствует реальности (или поднят cron, который её обновляет).
- [ ] **Логи**: `pm2 logs apartkg-api` пишет без 500-ок, в `apartkg-api error` пусто.
- [ ] **Лимит размера загрузок** в nginx (`client_max_body_size 100M;`) — иначе видеообзоры до 80 МБ не пройдут.

---

## 6. Что точно остаётся «как есть» (не блокирует деплой)

- Платежи в demo-режиме — продакшен-оплата готовится отдельно (см. п. 5 «Промо тарифы»).
- Загрузка лого агентства через UI — пока ставится URL вручную в форме «Стать агентством». Если нужно загружать файлом — переиспользуйте `POST /api/upload` и подставьте путь в `agencyLogo`.
- Push-уведомления о callback идут только подписанному пользователю-владельцу. Если он не нажал «Включить push» — увидит заявку только в кабинете.

---

## 7. Если совсем коротко

```bash
# на сервере
git pull
cd backend && npx prisma migrate deploy
cd ../frontend && npm run build
pm2 reload apartkg-api
```

Это и есть полный «деплой одной командой» после первичной настройки.
