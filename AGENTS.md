## Общая информация

- Проект: shiz_book.
- Домен сайта: shiz.booka.dj.
- Публичный IP сервера: 31.172.79.28.
- Основная рабочая директория проекта: /opt/shiz_book.
- Операционная система: Ubuntu 24.04 LTS.
- Тип сервера: VPS.
- Назначение сервера: личный VPN-сервер, веб-сервер для сайта shiz.booka.dj
- Docker-хост для frontend/backend контейнеров.

## Аппаратные параметры VPS

- CPU: 2 vCPU.
- RAM: 2 GB.
- SSD: 20 GB.

Сервер маломощный, поэтому проект должен оставаться легким. Не рекомендуется поднимать тяжелые сервисы, лишние базы данных, мониторинг, CI/CD и другие ресурсоемкие компоненты на этом же VPS без необходимости.

## Сетевые параметры

- Публичный домен: shiz.booka.dj.
- Публичный IP: 31.172.79.28.
- DNS-запись: shiz.booka.dj A 31.172.79.28.
- Проверка DNS: ```nslookup shiz.booka.dj```

## Reverse proxy

На сервере используется Caddy.
Команда перезапуска Caddy: 
```bash
sudo systemctl restart hysteria-caddy.service
```
Текущий блок сайта в Caddy должен проксировать запросы в Docker-контейнеры:
```
shiz.booka.dj {
    reverse_proxy /api/* 127.0.0.1:8000
    reverse_proxy 127.0.0.1:8080
}
```

## Docker

На сервере установлен Docker.

Проект запускается через Docker Compose.
```bash
docker compose up -d --build
```

Команда просмотра логов проекта
```bash
docker compose logs -f.
```
## Структура проекта

Основная папка проекта: /opt/shiz_book.

Минимальная структура проекта:
```
/opt/shiz_book
├── frontend
│   ├── Dockerfile
│   ├── css
│   │   └── style.css
│   ├── js
│   │   └── main.js
│   └── templates
│       └── index.html
├── backend
│   ├── Dockerfile
│   └── main.py
├── .gitignore
├── docker-compose.yml
├── requirements.txt
├── README.md
└── AGENTS.md
```

## Frontend

- Frontend расположен здесь: /opt/shiz_book/frontend.
- Главная HTML-страница расположена здесь: /opt/shiz_book/frontend/templates/index.html.
- CSS расположен здесь: /opt/shiz_book/frontend/css.
- JavaScript расположен здесь: /opt/shiz_book/frontend/js.
- Frontend-контейнер доступен только локально на сервере по адресу: 127.0.0.1:8080.
- Команда проверки frontend: curl -I http://127.0.0.1:8080.

## Backend

- Backend расположен здесь: /opt/shiz_book/backend.
- Главный файл backend расположен здесь: /opt/shiz_book/backend/main.py.
- Backend framework: FastAPI.
- Backend-контейнер доступен только локально на сервере по адресу: 127.0.0.1:8000.
- Healthcheck endpoint: /api/health.
- Команда проверки backend: curl http://127.0.0.1:8000/api/health.
- Ожидаемый ответ backend: {"status":"ok"}.



## Основные команды обслуживания

Пересобрать и запустить проект:
```bash
cd /opt/shiz_book
docker compose up -d --build
```
Проверить frontend:
```bash
curl -I http://127.0.0.1:8080
```
Проверить backend:
```bash
curl http://127.0.0.1:8000/api/health
```
Проверить внешний сайт:
```bash
curl -I https://shiz.booka.dj
```
Проверить Caddy:
```bash
sudo caddy validate --config /etc/hysteria/core/scripts/webpanel/Caddyfile
```
Перезапустить Caddy:
```bash
sudo systemctl restart hysteria-caddy.service
```
Посмотреть логи Caddy:
```bash
sudo journalctl -u hysteria-caddy.service -n 100 --no-pager
```
Посмотреть логи Docker Compose:
```bash
cd /opt/shiz_book
docker compose logs -f
```
