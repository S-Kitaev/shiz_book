from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole
from app.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

ROLE_LEVELS = {
    UserRole.user: 1,
    UserRole.admin: 2,
    UserRole.superadmin: 3,
}


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired access token.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        user_id = decode_access_token(token)
    except ValueError as exc:
        raise credentials_error from exc

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise credentials_error
    return user


def get_optional_current_user(
    token: str | None = Depends(optional_oauth2_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    if not token:
        return None
    try:
        user_id = decode_access_token(token)
    except ValueError:
        return None

    user = db.get(User, user_id)
    if not user or not user.is_active:
        return None
    return user


def require_role(required_role: UserRole) -> Callable[[User], User]:
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        current_level = ROLE_LEVELS.get(current_user.role, 0)
        required_level = ROLE_LEVELS[required_role]
        if current_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"{required_role.value} role is required.",
            )
        return current_user

    return dependency


def require_admin(current_user: User = Depends(require_role(UserRole.admin))) -> User:
    return current_user


def require_superadmin(current_user: User = Depends(require_role(UserRole.superadmin))) -> User:
    return current_user
