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
│   ├── css
│   ├── js
│   └── templates
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

`SUPERADMIN_USERNAME`, `SUPERADMIN_EMAIL` и `SUPERADMIN_PASSWORD` нужно задавать все вместе или не задавать совсем.

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
