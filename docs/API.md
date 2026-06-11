# API

Все protected endpoints используют JWT access token:

```http
Authorization: Bearer <TOKEN>
```

## Health

### GET /api/health

Проверка backend.

```bash
curl http://127.0.0.1:8000/api/health
```

## Auth

### POST /api/auth/register

Создать пользователя.

```json
{
  "username": "reader1",
  "email": "reader1@example.com",
  "password": "reader-password-123"
}
```

### POST /api/auth/login

Получить JWT access token.

```json
{
  "username": "reader1",
  "password": "reader-password-123"
}
```

### GET /api/auth/me

Вернуть текущего пользователя.

### POST /api/auth/logout

Клиентский logout для stateless JWT.

## Feed

### GET /api/feed

Публичная лента. Возвращает видимые `admin_post` и `event`.

```bash
curl -s http://127.0.0.1:8000/api/feed
```

## Events

### GET /api/events

Публичный список мероприятий.

### POST /api/events

Создать предложение мероприятия. Требуется авторизация.

```json
{
  "title": "Книжная встреча",
  "external_url": "https://example.com",
  "description": "Обсуждаем книгу и выбираем следующую.",
  "image_url": null
}
```

Новый статус: `proposed`.

### GET /api/events/{event_id}

Открыть карточку мероприятия.

### POST /api/events/{event_id}/vote

Проголосовать за мероприятие. Требуется авторизация.

Голосование открыто для статусов:

- `proposed`
- `voting`
- `discussion`

### POST /api/events/{event_id}/unvote

Снять голос. Требуется авторизация.

### DELETE /api/events/{event_id}/unvote

То же действие, альтернативный HTTP-метод.

## Comments

### GET /api/events/{event_id}/comments

Публичный список видимых комментариев мероприятия.

### POST /api/events/{event_id}/comments

Добавить комментарий. Требуется авторизация.

```json
{
  "body": "Я бы пришел на эту встречу."
}
```

## Admin

### GET /api/admin/users

Список пользователей. Требуется `admin` или `superadmin`.

### POST /api/admin/users/{user_id}/make-admin

Выдать пользователю роль `admin`. Требуется `admin` или `superadmin`.

### POST /api/admin/feed-posts

Создать админский пост в ленте. Требуется `admin` или `superadmin`.

```json
{
  "title": "Новость клуба",
  "body": "Текст новости."
}
```

### PATCH /api/admin/events/{event_id}/status

Изменить статус мероприятия или скрыть его. Требуется `admin` или `superadmin`.

```json
{
  "status": "voting",
  "hidden": false
}
```

Допустимые статусы:

- `proposed`
- `voting`
- `discussion`
- `accepted`
- `rejected`
- `completed`

### POST /api/admin/events/{event_id}/comments/{comment_id}/hide

Скрыть комментарий. Требуется `admin` или `superadmin`.

## Superadmin

### POST /api/superadmin/users/{user_id}/remove-admin

Снять роль `admin`. Требуется `superadmin`.

### POST /api/superadmin/users/{user_id}/block

Заблокировать пользователя. Требуется `superadmin`.

## Curl сценарий

Создать пользователя:

```bash
curl -s -X POST http://127.0.0.1:8000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"reader1","email":"reader1@example.com","password":"reader-password-123"}'
```

Залогиниться:

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"reader1","password":"reader-password-123"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
```

Создать мероприятие:

```bash
EVENT_ID=$(curl -s -X POST http://127.0.0.1:8000/api/events \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Книжная встреча","external_url":"https://example.com","description":"Обсуждаем книгу и выбираем следующую.","image_url":null}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
```

Проверить ленту:

```bash
curl -s http://127.0.0.1:8000/api/feed
```

Проголосовать:

```bash
curl -s -X POST http://127.0.0.1:8000/api/events/$EVENT_ID/vote \
  -H "Authorization: Bearer $TOKEN"
```

Добавить комментарий:

```bash
curl -s -X POST http://127.0.0.1:8000/api/events/$EVENT_ID/comments \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"body":"Я бы пришел на эту встречу."}'
```
