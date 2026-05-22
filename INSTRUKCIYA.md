# Apart.kg — инструкция

## Назначение

Веб + PWA для объявлений недвижимости: API (Express + Prisma/SQLite), JWT, чат, модерация, платежи (sandbox).

## Запуск

```bash
cd backend   # или из корня — см. package.json scripts
npm run install:all
npm run db:migrate --prefix backend
npm run db:seed
npm run dev
```

Сайт: http://localhost:3000

## Демо-логины (после seed)

| Email | Пароль | Роль |
|-------|--------|------|
| admin@demo.kg | admin123 | Админ |
| demo@demo.kg | demo123 | Пользователь |

## Git

```bash
git remote -v   # github.com/aytosh/apart-kg
git push origin apartment
```

Подробности API и фич — [README.md](README.md).
