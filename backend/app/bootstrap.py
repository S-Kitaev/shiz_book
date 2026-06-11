from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.crud import normalize_email, normalize_username, write_audit
from app.models import User, UserRole
from app.security import hash_password


def ensure_superadmin(db: Session) -> None:
    active_superadmin = db.scalar(
        select(User).where(User.role == UserRole.superadmin, User.is_active.is_(True))
    )
    if active_superadmin:
        return

    if not (
        settings.superadmin_username
        and settings.superadmin_email
        and settings.superadmin_password
    ):
        return

    username = normalize_username(settings.superadmin_username)
    email = normalize_email(settings.superadmin_email)
    user = db.scalar(select(User).where((User.username == username) | (User.email == email)))

    if user:
        user.username = username
        user.email = email
        user.password_hash = hash_password(settings.superadmin_password)
        user.role = UserRole.superadmin
        user.is_active = True
    else:
        user = User(
            username=username,
            email=email,
            password_hash=hash_password(settings.superadmin_password),
            role=UserRole.superadmin,
            is_active=True,
        )
        db.add(user)
        db.flush()

    write_audit(
        db,
        action="superadmin.bootstrap",
        actor_user_id=None,
        entity_type="user",
        entity_id=user.id,
        details={"username": username},
    )
    db.commit()
