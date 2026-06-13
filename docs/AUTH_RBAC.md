# Auth и роли

В проекте реализована базовая auth/RBAC-система для MVP.

## Роли

### user

Обычный участник книжного клуба.

Права:

- зарегистрироваться;
- войти на сайт;
- видеть главную страницу;
- предлагать мероприятия;
- голосовать;
- обсуждать мероприятия.

### admin

Администратор сайта.

Права:

- все права `user`;
- создавать админские посты;
- модерировать предложения;
- видеть страницу управления пользователями и статистикой;
- не может менять роли пользователей;
- не может управлять `superadmin`.

### superadmin

Главный администратор.

Права:

- все права `admin`;
- выдавать роль `admin`;
- снимать роль `admin`;
- блокировать пользователей;
- видеть список пользователей и админов;
- в системе должен быть только один активный `superadmin`.

Ограничение одного активного `superadmin` дополнительно защищено partial unique index в Postgres.

## Backend dependencies

Реализованы dependency-функции:

- `get_current_user`
- `require_role`
- `require_admin`
- `require_superadmin`

Права проверяются на backend endpoint, а не только во frontend.

## JWT

Используется JWT access token.

- Секрет берется из `JWT_SECRET`.
- `JWT_SECRET` должен быть задан в `.env`.
- Если `JWT_SECRET` отсутствует, backend падает при старте с понятной ошибкой.
- Access token хранится на клиенте в `localStorage`.

Refresh token пока не реализован. Следующий безопасный этап: добавить таблицу `refresh_tokens`, хранить только hash refresh-токена, добавить ротацию и отзыв токенов.

## Пароли

Пароли не хранятся в открытом виде.

Backend использует `bcrypt`:

- при регистрации сохраняется только hash;
- при логине пароль сравнивается с hash.

## База данных

Используется Postgres.

Таблицы MVP:

- `users`
- `audit_log`

Для ролей на MVP выбран один `role` field в таблице `users`, потому что у пользователя может быть только одна активная роль из `user`, `admin`, `superadmin`. Это проще, чем `user_roles`, и достаточно для текущих правил.

Миграции пока не введены. Backend использует `SQLAlchemy Base.metadata.create_all()` на старте. Это выбранный MVP-подход для маленького проекта. Когда схема начнет меняться чаще, нужно добавить Alembic и перейти на явные миграции.

## Superadmin bootstrap

При первом запуске можно создать `superadmin` через `.env`:

```env
SUPERADMIN_USERNAME=superadmin
SUPERADMIN_EMAIL=superadmin@example.com
SUPERADMIN_PASSWORD=replace-with-strong-password
```

Нужно задать все три переменные вместе. Если активный `superadmin` уже есть, bootstrap не создает второго.

## API endpoints

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
GET  /api/admin/users
GET  /api/admin/users/overview
POST /api/admin/users/{user_id}/make-admin
POST /api/superadmin/users/{user_id}/remove-admin
POST /api/superadmin/users/{user_id}/block
```

## Ручные проверки curl

Создать пользователя:

```bash
curl -s -X POST http://127.0.0.1:8000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"reader1","email":"reader1@example.com","password":"reader-password-123"}'
```

Залогиниться пользователем:

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"reader1","password":"reader-password-123"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
```

Проверить `/me`:

```bash
curl -s http://127.0.0.1:8000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

Получить token superadmin:

```bash
SUPER_TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"superadmin","password":"replace-with-strong-password"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
```

Проверить страницу управления:

```bash
curl -s http://127.0.0.1:8000/api/admin/users/overview \
  -H "Authorization: Bearer $SUPER_TOKEN"
```

Выдать admin пользователю через superadmin:

```bash
curl -s -X POST http://127.0.0.1:8000/api/admin/users/2/make-admin \
  -H "Authorization: Bearer $SUPER_TOKEN"
```

Снять admin через superadmin endpoint:

```bash
curl -s -X POST http://127.0.0.1:8000/api/superadmin/users/2/remove-admin \
  -H "Authorization: Bearer $SUPER_TOKEN"
```
