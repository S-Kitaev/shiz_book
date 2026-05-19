# shiz_book

Минимальный сайт для shiz.booka.dj.

## Архитектура

- frontend: nginx + статическая страница
- backend: FastAPI
- reverse proxy: Caddy на VPS

## Запуск

```bash
docker compose up -d --build