from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.crud import (
    get_user_by_username_or_email,
    normalize_email,
    normalize_username,
    user_to_public,
    write_audit,
)
from app.database import get_db
from app.dependencies import get_current_user
from app.models import User, UserRole
from app.schemas import LoginRequest, MessageResponse, TokenResponse, UserCreate, UserPublic
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> dict:
    username = normalize_username(payload.username)
    email = normalize_email(payload.email)

    if db.scalar(select(User).where(or_(User.username == username, User.email == email))):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this username or email already exists.",
        )

    user = User(
        username=username,
        email=email,
        password_hash=hash_password(payload.password),
        role=UserRole.user,
        is_active=True,
    )
    db.add(user)
    try:
        db.flush()
        write_audit(
            db,
            action="auth.register",
            actor_user_id=user.id,
            entity_type="user",
            entity_id=user.id,
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this username or email already exists.",
        ) from exc
    db.refresh(user)
    return user_to_public(user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> dict:
    user = get_user_by_username_or_email(db, payload.username)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is blocked.",
        )

    write_audit(
        db,
        action="auth.login",
        actor_user_id=user.id,
        entity_type="user",
        entity_id=user.id,
    )
    db.commit()

    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
        "user": user_to_public(user),
    }


@router.get("/me", response_model=UserPublic)
def me(current_user: User = Depends(get_current_user)) -> dict:
    return user_to_public(current_user)


@router.post("/logout", response_model=MessageResponse)
def logout(current_user: User = Depends(get_current_user)) -> dict:
    return {
        "status": "ok",
        "detail": "JWT access tokens are stateless. Remove the token on the client.",
    }
