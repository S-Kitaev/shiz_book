# shiz_book

MVP сайта книжного клуба `shiz.booka.dj`.

Проект рассчитан на небольшой VPS: Ubuntu 24.04 LTS, 2 vCPU, 2 GB RAM, 20 GB SSD. Приложение запускается через Docker Compose. Внешний HTTPS обслуживает Caddy на хосте, контейнеры приложения доступны только локально или во внутренней Docker-сети.

## Структура

```text
/opt/shiz_book
├── backend
│   ├── Dockerfile
│   ├── main.py
│   └── app
├── frontend
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── css/style.css
│   ├── js/api.js
│   ├── js/main.js
│   ├── js/ui.js
│   └── templates/index.html
├── docs
│   ├── API.md
│   ├── AUTH_RBAC.md
│   ├── MVP_FUNCTIONALITY.md
│   └── PROJECT_CONTEXT.md
├── .env.example
├── docker-compose.yml
├── requirements.txt
├── README.md
└── AGENTS.md
```

## Сервисы

- `frontend`: nginx со статическим HTML/CSS/JS, порт `127.0.0.1:8080`.
- `backend`: FastAPI, порт `127.0.0.1:8000`.
- `postgres`: пользователи, роли и audit log, без внешнего порта.
- `mongo`: лента, мероприятия, голоса и комментарии, без внешнего порта.
- `Caddy`: reverse proxy на хосте, не входит в `docker-compose.yml`.

## Переменные окружения

Скопируйте `.env.example` в `.env` и замените placeholders реальными значениями. `.env` нельзя коммитить.

Используемые переменные:

| Переменная | Назначение |
| --- | --- |
| `JWT_SECRET` | Секрет для подписи JWT. Обязателен. |
| `JWT_ALGORITHM` | Алгоритм JWT, по умолчанию `HS256`. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Время жизни access token. |
| `DATABASE_URL` | Необязательный полный URL Postgres. Обычно пустой в Docker Compose. |
| `POSTGRES_HOST` | Host Postgres для backend. |
| `POSTGRES_PORT` | Port Postgres для backend. |
| `POSTGRES_DB` | Имя базы Postgres. |
| `POSTGRES_USER` | Пользователь Postgres. |
| `POSTGRES_PASSWORD` | Пароль Postgres. Обязателен. |
| `MONGO_URL` | Необязательный полный URL MongoDB. Обычно пустой в Docker Compose. |
| `MONGO_HOST` | Host MongoDB для backend. |
| `MONGO_PORT` | Port MongoDB для backend. |
| `MONGO_DB` | Имя базы MongoDB. |
| `MONGO_INITDB_ROOT_USERNAME` | Root-пользователь MongoDB. |
| `MONGO_INITDB_ROOT_PASSWORD` | Root-пароль MongoDB. Обязателен. |
| `SUPERADMIN_USERNAME` | Имя superadmin при первом запуске. |
| `SUPERADMIN_EMAIL` | Email superadmin при первом запуске. |
| `SUPERADMIN_PASSWORD` | Пароль superadmin при первом запуске. |
| `TG_ENABLED` | Включает публикацию новых мероприятий и админских постов в Telegram. |
| `TG_DRY_RUN` | Тестовый режим Telegram без реальной отправки. |
| `TG_CHANNEL_ID` | ID или username Telegram-канала, например `@your_channel`. |
| `TG_TOKEN` | Токен Telegram-бота. Предпочтительное имя переменной. |
| `tg_token` | Legacy-имя токена Telegram-бота для совместимости. |

`SUPERADMIN_USERNAME`, `SUPERADMIN_EMAIL` и `SUPERADMIN_PASSWORD` нужно задавать все вместе или не задавать совсем.

## Telegram integration

Новые мероприятия, созданные через `POST /api/events`, и текстовые админские посты, созданные через `POST /api/admin/posts`, дублируются в Telegram-канал через Telegram Bot API. У мероприятий, если `image_url` начинается с `http://` или `https://`, backend отправляет публикацию через `sendPhoto`; остальные варианты картинки остаются только в данных сайта, без загрузки файла в Telegram. Админские посты публикуются только как текст.

Настройки:

```env
TG_ENABLED=false
TG_DRY_RUN=true
TG_CHANNEL_ID=@your_channel
TG_TOKEN=
tg_token=
```

Правило токена: backend сначала читает `TG_TOKEN`, затем `tg_token`. Токен нельзя выводить в логи, коммитить или вставлять в документацию.

Как подключить канал:

1. Создайте бота через BotFather и положите токен в `.env`.
2. Добавьте бота в Telegram-канал.
3. Сделайте бота администратором канала и выдайте ему право публиковать сообщения.
4. Укажите канал в `TG_CHANNEL_ID`: username вида `@your_channel` или числовой id.
5. Для безопасной проверки оставьте `TG_DRY_RUN=true`; для реальной публикации поставьте `TG_DRY_RUN=false` и перезапустите compose.

Проверить, что переменные есть, без вывода значений:

```bash
grep -E '^(TG_ENABLED|TG_DRY_RUN|TG_CHANNEL_ID|TG_TOKEN|tg_token)=' .env | sed -E 's/=.*/=<set>/'
```

Проверить Telegram Bot API локально на сервере:

```bash
source .env
TOKEN="${TG_TOKEN:-$tg_token}"
curl "https://api.telegram.org/bot${TOKEN}/getMe"
```

Проверить backend-конфиг Telegram:

```bash
curl http://127.0.0.1:8000/api/admin/telegram/status \
  -H "Authorization: Bearer <TOKEN>"
```

Ответ не содержит токен. Он показывает только `enabled`, `dry_run`, `channel_configured`, `token_configured`.

Проверить тестовую отправку:

```bash
curl -X POST http://127.0.0.1:8000/api/admin/telegram/test \
  -H "Authorization: Bearer <TOKEN>"
```

Проверить создание админского поста:

```bash
curl -X POST http://127.0.0.1:8000/api/admin/posts \
  -H "Authorization: Bearer <TOKEN>" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Новость клуба","text":"Текст новости со ссылками прямо внутри текста."}'
```

Проверить создание мероприятия:

```bash
curl -X POST http://127.0.0.1:8000/api/events \
  -H "Authorization: Bearer <TOKEN>" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Книжная встреча","description":"Обсуждаем книгу и выбираем следующую.","external_url":null,"image_url":null}'
```

Если `TG_DRY_RUN=true`, реального сообщения в Telegram не будет, но в ответе будет payload, который backend отправил бы. Если `TG_ENABLED=true`, `TG_DRY_RUN=false`, `TG_CHANNEL_ID` задан и бот является администратором канала с правом публикации, сообщение должно прийти в канал.

После изменения `.env` перезапустите backend:

```bash
docker compose up -d --build
```

Логи:

```bash
docker compose logs -f backend
```

## Запуск

```bash
cd /opt/shiz_book
docker compose up -d --build
```

## Rebuild

```bash
cd /opt/shiz_book
docker compose up -d --build
```

## Остановка

```bash
cd /opt/shiz_book
docker compose down
```

## Логи

Все сервисы:

```bash
docker compose logs -f
```

Только backend:

```bash
docker compose logs -f backend
```

## Проверки

Контейнеры:

```bash
docker ps
```

Frontend локально:

```bash
curl -I http://127.0.0.1:8080
```

Backend healthcheck:

```bash
curl http://127.0.0.1:8000/api/health
```

Ожидаемый ответ:

```json
{"status":"ok"}
```

Внешний сайт через Caddy:

```bash
curl -I https://shiz.booka.dj
```

Логи frontend и backend:

```bash
docker compose logs --tail=100 frontend
docker compose logs --tail=100 backend
```

## Типичный цикл разработки

1. Сделать маленькое изменение.
2. Пересобрать и поднять контейнеры:

```bash
docker compose up -d --build
```

3. Посмотреть логи:

```bash
docker compose logs -f backend
```

4. Проверить frontend, backend и внешний домен curl-командами из раздела выше.
5. Проверить изменения в браузере.
6. Перед коммитом выполнить:

```bash
git status
```

## Документация

- [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) - контекст проекта и инфраструктуры.
- [docs/API.md](docs/API.md) - текущие API endpoints.
- [docs/AUTH_RBAC.md](docs/AUTH_RBAC.md) - auth, роли и права.
- [docs/MVP_FUNCTIONALITY.md](docs/MVP_FUNCTIONALITY.md) - реализованная MVP-функциональность.
