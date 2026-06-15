import os
from dataclasses import dataclass
from urllib.parse import quote_plus


class SettingsError(RuntimeError):
    pass


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def _required(name: str) -> str:
    value = _clean(os.getenv(name))
    if not value:
        raise SettingsError(f"{name} is required. Set it in .env.")
    return value


def _int_env(name: str, default: int) -> int:
    value = _clean(os.getenv(name))
    if value is None:
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise SettingsError(f"{name} must be an integer.") from exc


def _bool_env(name: str, default: bool = False) -> bool:
    value = _clean(os.getenv(name))
    if value is None:
        return default
    normalized = value.lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise SettingsError(f"{name} must be true or false.")


def _telegram_token() -> str | None:
    return _clean(os.getenv("TG_TOKEN")) or _clean(os.getenv("tg_token"))


def _database_url() -> str:
    explicit_url = _clean(os.getenv("DATABASE_URL"))
    if explicit_url:
        return explicit_url

    host = _clean(os.getenv("POSTGRES_HOST")) or "postgres"
    port = _clean(os.getenv("POSTGRES_PORT")) or "5432"
    database = _clean(os.getenv("POSTGRES_DB")) or "shiz_book"
    user = _clean(os.getenv("POSTGRES_USER")) or "shiz_book"
    password = _required("POSTGRES_PASSWORD")

    return (
        "postgresql+psycopg://"
        f"{quote_plus(user)}:{quote_plus(password)}@{host}:{port}/{quote_plus(database)}"
    )


def _mongo_url() -> str:
    explicit_url = _clean(os.getenv("MONGO_URL"))
    if explicit_url:
        return explicit_url

    host = _clean(os.getenv("MONGO_HOST")) or "mongo"
    port = _clean(os.getenv("MONGO_PORT")) or "27017"
    user = _clean(os.getenv("MONGO_INITDB_ROOT_USERNAME")) or "shiz_book"
    password = _required("MONGO_INITDB_ROOT_PASSWORD")

    return (
        "mongodb://"
        f"{quote_plus(user)}:{quote_plus(password)}@{host}:{port}/?authSource=admin"
    )


@dataclass(frozen=True)
class Settings:
    jwt_secret: str
    jwt_algorithm: str
    access_token_expire_minutes: int
    database_url: str
    mongo_url: str
    mongo_db: str
    superadmin_username: str | None
    superadmin_email: str | None
    superadmin_password: str | None
    tg_enabled: bool
    tg_dry_run: bool
    tg_channel_id: str | None
    tg_token: str | None

    @classmethod
    def load(cls) -> "Settings":
        settings = cls(
            jwt_secret=_required("JWT_SECRET"),
            jwt_algorithm=_clean(os.getenv("JWT_ALGORITHM")) or "HS256",
            access_token_expire_minutes=_int_env("ACCESS_TOKEN_EXPIRE_MINUTES", 60),
            database_url=_database_url(),
            mongo_url=_mongo_url(),
            mongo_db=_clean(os.getenv("MONGO_DB")) or "shiz_book",
            superadmin_username=_clean(os.getenv("SUPERADMIN_USERNAME")),
            superadmin_email=_clean(os.getenv("SUPERADMIN_EMAIL")),
            superadmin_password=_clean(os.getenv("SUPERADMIN_PASSWORD")),
            tg_enabled=_bool_env("TG_ENABLED", False),
            tg_dry_run=_bool_env("TG_DRY_RUN", True),
            tg_channel_id=_clean(os.getenv("TG_CHANNEL_ID")),
            tg_token=_telegram_token(),
        )
        settings.validate_superadmin_bootstrap()
        settings.validate_telegram()
        return settings

    def validate_superadmin_bootstrap(self) -> None:
        values = [
            self.superadmin_username,
            self.superadmin_email,
            self.superadmin_password,
        ]
        if any(values) and not all(values):
            raise SettingsError(
                "SUPERADMIN_USERNAME, SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD "
                "must be set together."
            )
        if self.superadmin_password and len(self.superadmin_password) < 8:
            raise SettingsError("SUPERADMIN_PASSWORD must be at least 8 characters.")

    def validate_telegram(self) -> None:
        if self.tg_enabled and not self.tg_token:
            raise SettingsError("TG_ENABLED=true requires TG_TOKEN or tg_token in .env.")


settings = Settings.load()
