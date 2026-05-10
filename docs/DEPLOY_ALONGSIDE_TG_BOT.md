# Деплой Apart.kg на тот же сервер, что и Telegram-бот (incognitospybot)

Цель: **не смешивать** окружения бота и веба — отдельные папки, **отдельные `.env`**, отдельные порты (или отдельный поддомен в nginx).

## Что у бота обычно (Dialog Spy / incognito)

| Ресурс | Типичное значение |
|--------|-------------------|
| Папка | `~/incognito-spy-bot` (или как у вас в `DEPLOY.md` бота) |
| Порт (webhook в Docker) | **8080** внутри/снаружи в `docker-compose` |
| Webhook path | `/webhook` |
| БД бота | свой `bot.db` в volume/папке бота |
| Переменные | только в **`.env` бота** (`BOT_TOKEN`, `WEBHOOK_URL`, …) |

**Не копируйте** `JWT_SECRET`, `DATABASE_URL` от Apart в `.env` бота и наоборот.

## Что у Apart.kg

| Ресурс | Рекомендация |
|--------|----------------|
| Папка | **`/opt/apart-kg`** или `~/apart-kg` (отдельно от бота) |
| Порт Node | **3000** по умолчанию; если занят — **`PORT=3001`** в `.env` Apart |
| БД | **свой** файл SQLite, например `/opt/apart-kg/app/backend/data/prod.db` |
| Загрузки | **`UPLOAD_DIR`** отдельная директория, например `/opt/apart-kg/app/backend/uploads` |
| Переменные | только **`backend/.env`** Apart (см. `.env.example`) |

Проверка конфликта портов на сервере:

```bash
sudo ss -tlnp | grep -E ':3000|:3001|:8080'
```

- Если **8080** занят ботом — это нормально, Apart слушает **3000** или **3001**.
- Если **3000** занят другим сервисом — в `backend/.env` задайте `PORT=3001`.

---

## 1. Подготовка на сервере (Ubuntu)

Установите Node **20 LTS** (или 22):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential
node -v && npm -v
```

Создайте пользователя/папку (пример):

```bash
sudo mkdir -p /opt/apart-kg
sudo chown "$USER:$USER" /opt/apart-kg
```

Скопируйте проект с ПК (из папки `My/Apartmant`):

```powershell
scp -r "C:\Users\AiteginM\Documents\Cursor\My\Apartmant" user@ВАШ_IP:/opt/apart-kg/app
```

Или через `git clone`, если репозиторий в Git.

---

## 2. Сборка и `.env` (только Apart)

```bash
cd /opt/apart-kg/app
npm run install:all
cp backend/.env.example backend/.env
nano backend/.env
```

**Обязательно в проде:**

- `JWT_SECRET` — длинная случайная строка (уникальная, не как у бота).
- `DATABASE_URL` — **абсолютный путь**, например:
  `file:/opt/apart-kg/app/backend/data/prod.db`
- `UPLOAD_DIR` — абсолютный путь:
  `/opt/apart-kg/app/backend/uploads`
- `PORT` — например `3000` или `3001`
- `CLIENT_ORIGIN` — **ваш публичный URL сайта**, через запятую если несколько:
  `https://apart.example.com,https://www.apart.example.com`
- `VAPID_*` — сгенерировать на сервере: `npm run vapid:generate --prefix backend` и вставить ключи.

Создайте каталоги под БД и загрузки:

```bash
mkdir -p backend/data backend/uploads
npm run db:migrate:deploy --prefix backend
npm run db:seed --prefix backend   # опционально, только для демо; на проде лучше без seed или свой seed
npm run build
```

Проверка вручную:

```bash
cd /opt/apart-kg/app/backend && NODE_ENV=production node src/server.js
# или из корня: npm start --prefix backend
```

Откройте `http://СЕРВЕР_IP:3000` (или ваш `PORT`). Должен открыться фронт и `/api/health`.

---

## 3. systemd (автозапуск, отдельный unit от бота)

Шаблон: [deploy/systemd/apart-kg.service.example](../deploy/systemd/apart-kg.service.example).

```bash
cd /opt/apart-kg/app
sudo cp deploy/systemd/apart-kg.service.example /etc/systemd/system/apart-kg.service
sudo nano /etc/systemd/system/apart-kg.service   # поправьте User, WorkingDirectory, EnvironmentFile
sudo systemctl daemon-reload
sudo systemctl enable --now apart-kg
sudo systemctl status apart-kg
```

Юнит **`incognito-spy-bot`** и **`apart-kg`** — разные файлы, разные `WorkingDirectory`, без общего `EnvironmentFile`.

---

## 4. Nginx: один сервер, два сервиса

### Вариант A (предпочтительно): поддомен для сайта

- `apart.example.com` → `proxy_pass http://127.0.0.1:3000;`
- Корень домена или другой `server_name` для бота: `location /webhook` → `http://127.0.0.1:8080/webhook;`

Так **нет конфликта** «кто владеет `/`»: бот только по пути webhook, сайт — на поддомене.

Пример фрагмента: [deploy/nginx/apart-subdomain.conf.example](../deploy/nginx/apart-subdomain.conf.example).

### Вариант B: один домен, разные пути

Сложнее для SPA (нужен `base` или прокси без поломки путей). Проще использовать поддомен.

После правок:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 5. HTTPS

Используйте **certbot** для домена Apart и для домена бота (если разные). Webhook Telegram требует HTTPS на публичном URL.

---

## 6. Обновление сайта без касания бота

```bash
cd /opt/apart-kg/app
git pull   # или новый scp
npm run install:all
npm run db:migrate:deploy --prefix backend
npm run build
sudo systemctl restart apart-kg
```

Бот **не перезапускать**, если не трогали его папку и `.env`.

---

## Чек-лист «перемешки не будет»

- [ ] Разные каталоги: бот ≠ `/opt/apart-kg`
- [ ] Разные `.env` файлы
- [ ] Разные порты (или явно задан `PORT` у Apart)
- [ ] Разные БД: `bot.db` ≠ `prod.db` Apart
- [ ] `CLIENT_ORIGIN` Apart = реальный URL фронта, не URL бота
- [ ] В nginx webhook бота и прокси Apart не указывают на один и тот же upstream по ошибке

Если пришлёте схему: **один домен или два**, **docker у бота или systemd** — можно сузить конфиг под ваш сервер построчно.
