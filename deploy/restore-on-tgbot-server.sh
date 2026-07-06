#!/usr/bin/env bash
# Восстановление Apart.kg на сервере TG-бота (130.61.169.93), рядом с incognito-spy-bot.
# Идемпотентный: можно запускать повторно.
set -euo pipefail

APP=/opt/apart-kg/apart-kg
BACKUP=/home/ubuntu/backup-prod-2026-05-11.db
DOMAIN=apartkg.duckdns.org
EMAIL=aytoshmuratov@gmail.com

echo "==================== 1. Каталог и код ===================="
sudo mkdir -p /opt/apart-kg
sudo chown -R ubuntu:ubuntu /opt/apart-kg
if [ -d "$APP/.git" ]; then
  cd "$APP"
  git fetch origin
  git checkout apartment
  git reset --hard origin/apartment
else
  rm -rf "$APP"
  git clone -b apartment https://github.com/aytosh/apart-kg.git "$APP"
fi
cd "$APP"

echo "==================== 2. Зависимости ===================="
npm install --prefix backend
npm install --prefix frontend

echo "==================== 3. Восстановление БД ===================="
mkdir -p "$APP/backend/prisma" "$APP/backend/uploads"
if [ -f "$BACKUP" ]; then
  cp -f "$BACKUP" "$APP/backend/prisma/prod.db"
  echo "БД восстановлена из $BACKUP"
else
  echo "ВНИМАНИЕ: бэкап $BACKUP не найден — база будет создана миграциями пустой"
fi

echo "==================== 4. Генерация .env ===================="
# VAPID-ключи (пара) через web-push из установленных зависимостей
node -e "const w=require('$APP/backend/node_modules/web-push');const v=w.generateVAPIDKeys();require('fs').writeFileSync('/tmp/vapid.env','VAPID_PUB='+v.publicKey+'\n'+'VAPID_PRIV='+v.privateKey+'\n')"
source /tmp/vapid.env
rm -f /tmp/vapid.env
JWT=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
PWH=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
cat > "$APP/backend/.env" <<EOF
DATABASE_URL="file:$APP/backend/prisma/prod.db"
JWT_SECRET="$JWT"
PORT=3000
UPLOAD_DIR="$APP/backend/uploads"
CLIENT_ORIGIN="https://$DOMAIN"
PAYMENT_PROVIDER="DEMO"
PAYMENT_WEBHOOK_SECRET="$PWH"
VAPID_PUBLIC_KEY="$VAPID_PUB"
VAPID_PRIVATE_KEY="$VAPID_PRIV"
VAPID_SUBJECT="mailto:$EMAIL"
SAVED_SEARCH_INTERVAL_MINUTES=10
EOF
echo ".env создан"

echo "==================== 5. Prisma migrate + generate ===================="
cd "$APP/backend"
npx prisma migrate deploy
npx prisma generate

echo "==================== 6. Сборка фронтенда ===================="
cd "$APP/frontend"
npm run build

echo "==================== 7. systemd ===================="
sudo tee /etc/systemd/system/apart-kg.service >/dev/null <<EOF
[Unit]
Description=Apart.kg API + static frontend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=$APP/backend
EnvironmentFile=$APP/backend/.env
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable apart-kg
sudo systemctl restart apart-kg
sleep 3
sudo systemctl status apart-kg --no-pager | head -n 8

echo "==================== 8. nginx ===================="
sudo tee /etc/nginx/sites-available/apartkg >/dev/null <<'NGINX'
server {
    server_name apartkg.duckdns.org;
    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 1d;
    }

    listen 443 ssl;
    listen [::]:443 ssl;
    ssl_certificate /etc/letsencrypt/live/apartkg.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/apartkg.duckdns.org/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
server {
    listen 80;
    listen [::]:80;
    server_name apartkg.duckdns.org;
    return 301 https://$host$request_uri;
}
NGINX
sudo ln -sf /etc/nginx/sites-available/apartkg /etc/nginx/sites-enabled/apartkg
sudo nginx -t
sudo systemctl reload nginx

echo "==================== 9. Проверка ===================="
sleep 1
echo "-- health (local) --"
curl -s http://127.0.0.1:3000/api/health; echo
echo "-- https headers --"
curl -skI https://$DOMAIN/ --resolve $DOMAIN:443:127.0.0.1 | head -n 5
echo "-- listings --"
curl -sk "https://$DOMAIN/api/listings?limit=1" --resolve $DOMAIN:443:127.0.0.1 | head -c 300; echo
echo "==================== ГОТОВО ===================="
