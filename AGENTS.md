# Инструкции для агентов в проекте shiz_book

Главный файл контекста для Codex и других агентов, работающих в `/opt/shiz_book`.

## Контекст

- Проект: MVP сайта книжного клуба `shiz.booka.dj`.
- Сервер: Ubuntu 24.04 LTS, VPS 2 vCPU / 2 GB RAM / 20 GB SSD.
- Публичный домен: `shiz.booka.dj`.
- Reverse proxy: Caddy на хосте.
- Caddyfile: `/etc/hysteria/core/scripts/webpanel/Caddyfile`.
- Запуск приложения: `docker compose up -d --build`.

Подробности: [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md).

## Текущая архитектура

- `frontend`: статический HTML/CSS/JS через nginx.
- `backend`: FastAPI.
- `postgres`: пользователи, роли и audit log.
- `mongo`: лента, мероприятия, голоса и комментарии.
- Внешний доступ идет только через Caddy.
- Локальные порты:
  - frontend: `127.0.0.1:8080`
  - backend: `127.0.0.1:8000`
- Postgres и MongoDB доступны только во внутренней Docker-сети.
- Healthcheck backend: `/api/health`.

## Правила работы

- Делать изменения маленькими, понятными и проверяемыми.
- Не добавлять новую функциональность без явного запроса.
- Не усложнять структуру проекта без необходимости.
- Не добавлять сервисы, библиотеки и папки без реальной пользы для текущего MVP.
- Не оставлять мертвый код, временные заготовки и документацию под далекое будущее.
- Сохранять модель доступа: наружу смотрит Caddy, контейнеры слушают `127.0.0.1` или внутреннюю Docker-сеть.
- Перед изменениями изучать текущие файлы и сохранять стиль проекта.
- Не трогать чужие незакоммиченные изменения, если они не относятся к задаче.

## Секреты

- `.env` существует локально и не должен попадать в git.
- Не читать и не выводить реальные значения секретов без необходимости.
- Никогда не копировать секреты в ответы, документацию, логи или коммиты.
- `.env.example` содержит только безопасные примерные значения.
- Если в коде появляется новая переменная окружения, она должна быть добавлена в `.env.example` без реального значения.

Используемые секретные/чувствительные переменные:

- `JWT_SECRET`
- `POSTGRES_PASSWORD`
- `MONGO_INITDB_ROOT_PASSWORD`
- `SUPERADMIN_USERNAME`
- `SUPERADMIN_EMAIL`
- `SUPERADMIN_PASSWORD`

## Основные команды проверки

```bash
docker compose up -d --build
docker ps
docker compose logs -f
curl -I http://127.0.0.1:8080
curl http://127.0.0.1:8000/api/health
curl -I https://shiz.booka.dj
```

Ожидаемый ответ backend:

```json
{"status":"ok"}
```

## Документация

- [docs/API.md](docs/API.md)
- [docs/AUTH_RBAC.md](docs/AUTH_RBAC.md)
- [docs/MVP_FUNCTIONALITY.md](docs/MVP_FUNCTIONALITY.md)
- [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md)
