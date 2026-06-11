from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import AuditLog, User


def normalize_username(username: str) -> str:
    return username.strip().lower()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def get_user_by_username_or_email(db: Session, value: str) -> User | None:
    value = value.strip().lower()
    return db.scalar(select(User).where(or_(User.username == value, User.email == value)))


def user_to_public(user: User) -> dict:
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": role,
        "is_active": user.is_active,
    }


def write_audit(
    db: Session,
    *,
    action: str,
    actor_user_id: int | None,
    entity_type: str,
    entity_id: str | int,
    details: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_user_id=actor_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            details=details or {},
        )
    )
