# Apart.kg WeChat Mini Program

Каркас мини-программы WeChat для каталога Apart.kg. Этот код можно открыть в **WeChat DevTools** после регистрации `appid` на [WeChat Open Platform](https://mp.weixin.qq.com/) (тип «Mini Program»).

## Структура

```
wechat-miniprogram/
├── app.js          // глобальный конфиг, baseUrl
├── app.json        // навигация, страницы, темизация
├── app.wxss        // глобальные стили
├── project.config.json // настройки DevTools
├── pages/
│   ├── index/      // каталог
│   ├── detail/     // карточка объявления
│   └── more/       // лендинг и контакты
└── utils/          // обёртки fetch
```

## Подключение к API

В `app.js` укажите `baseUrl` боевого сервера Apart.kg, например `https://apart.kg`. Все страницы используют `wx.request` поверх упрощённого endpoint-набора `/api/zh/*` (он отдаёт уменьшенные превью, переведённые заголовки и `wechatId` владельца).

## Как открыть

1. Установите [WeChat DevTools](https://developers.weixin.qq.com/miniprogram/en/dev/devtools/download.html).
2. Создайте мини-программу и пропишите свой `appid` в `project.config.json`.
3. Откройте папку `wechat-miniprogram/` в DevTools.
4. Переключите домен запросов на свой `apart.kg` в настройках мини-программы (доверенные домены).

## Что нужно докрутить перед публикацией

- Заменить `appid` на реальный.
- Зарегистрировать `request domain` в кабинете мини-программы.
- Настроить customer-service кнопку (`button open-type="contact"`) для общения с владельцем.
- Добавить шаблоны сообщений для push-нотификаций (через WeChat Subscribe Message API).
