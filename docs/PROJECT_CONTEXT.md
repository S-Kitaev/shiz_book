# Контекст проекта shiz_book

`shiz_book` - MVP сайта книжного клуба `shiz.booka.dj`.

Проект должен оставаться простым: небольшой backend на FastAPI, статический frontend, две базы данных только для реально используемых данных и запуск через Docker Compose.

## Инфраструктура

- Рабочая директория: `/opt/shiz_book`.
- Сервер: Ubuntu 24.04 LTS.
- Ресурсы VPS: 2 vCPU, 2 GB RAM, 20 GB SSD.
- Публичный домен: `shiz.booka.dj`.
- Reverse proxy: Caddy на хосте.
- Caddyfile: `/etc/hysteria/core/scripts/webpanel/Caddyfile`.

Сервер небольшой, поэтому не добавляем тяжелые сервисы, отдельный monitoring, очереди и лишние воркеры без явной необходимости.

## Reverse Proxy

Внешний HTTPS обслуживает Caddy. Ожидаемая схема:

```caddyfile
shiz.booka.dj {
    reverse_proxy /api/* 127.0.0.1:8000
    reverse_proxy 127.0.0.1:8080
}
```

Контейнеры приложения не должны быть доступны напрямую из интернета.

## Docker Compose

Текущие сервисы:

- `frontend`: nginx со статическим сайтом, локальный порт `127.0.0.1:8080`.
- `backend`: FastAPI, локальный порт `127.0.0.1:8000`.
- `postgres`: SQL-хранилище для пользователей, ролей и audit log, без внешнего порта.
- `mongo`: хранилище ленты, мероприятий, голосов и комментариев, без внешнего порта.

Запуск:

```bash
docker compose up -d --build
```

## Frontend

- `frontend/templates/index.html` - статический entrypoint для страниц `/`, `/new`, `/profile`, `/admin`.
- `frontend/css/style.css` - стили.
- `frontend/js/api.js` - запросы к backend.
- `frontend/js/ui.js` - функции рендера и форматирования.
- `frontend/js/main.js` - состояние страницы и обработчики событий.
- `frontend/nginx.conf` - отдача статики без агрессивного кеширования.

Frontend остается статическим. SPA-фреймворк сейчас не нужен.

## Backend

- `backend/main.py` - совместимый entrypoint.
- `backend/app/main.py` - FastAPI-приложение, роуты и startup.
- `backend/app/routes` - auth/RBAC и MVP endpoints.
- Healthcheck: `GET /api/health`.

Проверка:

```bash
curl http://127.0.0.1:8000/api/health
```

## Секреты

`.env` не должен попадать в git. Не выводить реальные значения переменных окружения в ответы, логи или документацию.

Шаблон безопасных значений хранится в `.env.example`.

Обязательные переменные для запуска:

- `JWT_SECRET`
- `POSTGRES_PASSWORD`
- `MONGO_INITDB_ROOT_PASSWORD`

Backend также умеет читать `DATABASE_URL`, `MONGO_URL`, `POSTGRES_HOST`, `POSTGRES_PORT`, `MONGO_HOST` и `MONGO_PORT`. В Docker Compose host/port задаются автоматически, а URL-переменные обычно остаются пустыми.

Для первичного создания главного администратора можно задать вместе:

- `SUPERADMIN_USERNAME`
- `SUPERADMIN_EMAIL`
- `SUPERADMIN_PASSWORD`

## Базовые проверки

```bash
docker compose up -d --build
docker ps
docker compose logs -f
curl -I http://127.0.0.1:8080
curl http://127.0.0.1:8000/api/health
curl -I https://shiz.booka.dj
```
