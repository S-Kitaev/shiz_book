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

### PATCH /api/auth/me

Обновить профиль текущего пользователя. Требуется авторизация.

```json
{
  "first_name": "Имя",
  "last_name": "Фамилия",
  "email": "reader1@example.com",
  "avatar_url": "https://example.com/avatar.jpg"
}
```

`avatar_url` может быть обычной ссылкой или строкой формата `data:image/...;base64,...`.
У `superadmin` email не меняется.

### GET /api/auth/me/activity

Вернуть мероприятия, предложенные текущим пользователем, и мероприятия, за которые он голосовал.
Требуется авторизация.

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

Создать предложение мероприятия и попытаться опубликовать его в Telegram.
Требуется авторизация.

```json
{
  "title": "Книжная встреча",
  "external_url": "https://example.com",
  "description": "Обсуждаем книгу и выбираем следующую.",
  "image_url": "https://example.com/image.jpg"
}
```

`image_url` может быть обычной ссылкой или строкой формата `data:image/...;base64,...`.

Новый статус: `proposed`.
Ответ содержит `telegram_status`. Ошибка Telegram не отменяет создание мероприятия.

### GET /api/events/{event_id}

Открыть карточку мероприятия.

### PATCH /api/events/{event_id}/status

Изменить статус или видимость мероприятия. Требуется авторизация.
Доступно только автору мероприятия, `admin` или `superadmin`.

```json
{
  "status": "discussion",
  "hidden": false
}
```

### DELETE /api/events/{event_id}

Удалить мероприятие вместе с его комментариями и голосами. Требуется авторизация.
Доступно только автору мероприятия, `admin` или `superadmin`.

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

### GET /api/admin/users/overview

Таблица пользователей для страницы управления. Требуется `admin` или `superadmin`.

Возвращает пользователей, IP регистрации/последнего входа и статистику активности.

### POST /api/admin/users/{user_id}/make-admin

Выдать пользователю роль `admin`. Требуется `superadmin`.

### POST /api/admin/posts

Создать админский пост в ленте и попытаться опубликовать его в Telegram.
Требуется `admin` или `superadmin`.

```json
{
  "title": "Новость клуба",
  "text": "Текст новости. Ссылки вставляются прямо в текст."
}
```

Ответ содержит `telegram_status`. Ошибка Telegram не отменяет создание поста.

### POST /api/admin/feed-posts

Legacy alias для создания админского поста. Требуется `admin` или `superadmin`.

### DELETE /api/admin/posts/{post_id}

Удалить админский пост из ленты. Требуется `superadmin`.
Перед удалением snapshot поста записывается в audit log.

### GET /api/admin/audit-log

Вернуть историю действий. Требуется `admin` или `superadmin`.
В историю пишутся создание мероприятий и постов, голоса, комментарии, смена статуса,
скрытие комментариев и удаления.

### DELETE /api/admin/audit-log

Очистить историю действий. Требуется `superadmin`.
После очистки остается запись `audit.clear`.

### GET /api/admin/telegram/status

Показать статус Telegram-конфига без токена. Требуется `admin` или `superadmin`.

### POST /api/admin/telegram/test

Отправить тестовое сообщение или вернуть dry-run payload. Требуется `admin` или `superadmin`.

### PATCH /api/admin/events/{event_id}/status

Админский alias для изменения статуса мероприятия или скрытия. Требуется `admin` или `superadmin`.

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

### GET /api/superadmin/error-log

Список системных ошибок. Требуется `superadmin`.

### PATCH /api/superadmin/error-log/{error_id}

Изменить статус ошибки. Требуется `superadmin`.

```json
{
  "status": "in_progress"
}
```

Допустимые статусы:

- `new`
- `in_progress`
- `resolved`

### DELETE /api/superadmin/error-log/{error_id}

Удалить ошибку. Требуется `superadmin`.
Удаление разрешено только для ошибок в статусе `resolved`.

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
