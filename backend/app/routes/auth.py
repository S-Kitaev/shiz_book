from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pymongo import DESCENDING
from pymongo.database import Database
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.content import VISIBLE_FILTER, serialize_event
from app.crud import (
    get_user_by_username_or_email,
    normalize_email,
    normalize_username,
    user_to_public,
    write_error_log,
    write_audit,
)
from app.database import get_db
from app.dependencies import get_current_user
from app.models import User, UserRole
from app.mongo import get_mongo
from app.schemas import (
    LoginRequest,
    MessageResponse,
    TokenResponse,
    UserCreate,
    UserPublic,
    UserUpdate,
)
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip() or None
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip() or None
    return request.client.host if request.client else None


@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, request: Request, db: Session = Depends(get_db)) -> dict:
    username = normalize_username(payload.username)
    email = normalize_email(payload.email)
    ip_address = client_ip(request)

    if db.scalar(select(User).where(or_(User.username == username, User.email == email))):
        write_error_log(
            db,
            source="auth.register",
            message="Registration conflict.",
            detail="User with this username or email already exists.",
            context={"username": username, "email": email, "ip": ip_address},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Registration failed.",
        )

    user = User(
        username=username,
        email=email,
        password_hash=hash_password(payload.password),
        role=UserRole.user,
        is_active=True,
        registered_ip=ip_address,
        last_login_ip=ip_address,
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
            details={"ip": ip_address},
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        write_error_log(
            db,
            source="auth.register",
            message="Registration integrity error.",
            detail=str(exc),
            context={"username": username, "email": email, "ip": ip_address},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Registration failed.",
        ) from exc
    db.refresh(user)
    return user_to_public(user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> dict:
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

    ip_address = client_ip(request)
    user.last_login_ip = ip_address
    write_audit(
        db,
        action="auth.login",
        actor_user_id=user.id,
        entity_type="user",
        entity_id=user.id,
        details={"ip": ip_address},
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


@router.patch("/me", response_model=UserPublic)
def update_me(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    values = (
        payload.model_dump(exclude_unset=True)
        if hasattr(payload, "model_dump")
        else payload.dict(exclude_unset=True)
    )
    changed_fields: list[str] = []
    if "email" in values:
        email = normalize_email(values["email"] or "")
        if not email:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Email is required.",
            )
        if current_user.role == UserRole.superadmin and email != current_user.email:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Superadmin email cannot be changed.",
            )
        if email != current_user.email:
            existing = db.scalar(select(User).where(User.email == email, User.id != current_user.id))
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email is already used.",
                )
            current_user.email = email
            changed_fields.append("email")

    for field in ("first_name", "last_name", "avatar_url"):
        if field not in values:
            continue
        value = values[field]
        if isinstance(value, str):
            value = value.strip() or None
        if getattr(current_user, field) != value:
            changed_fields.append(field)
        setattr(current_user, field, value)

    write_audit(
        db,
        action="auth.update_profile",
        actor_user_id=current_user.id,
        entity_type="user",
        entity_id=current_user.id,
        details={"fields": changed_fields},
    )
    db.commit()
    db.refresh(current_user)
    return user_to_public(current_user)


@router.get("/me/activity")
def my_activity(
    mongo: Database = Depends(get_mongo),
    current_user: User = Depends(get_current_user),
) -> dict[str, list[dict[str, Any]]]:
    proposed_events = [
        serialize_event(document, current_user.id, current_user=current_user)
        for document in mongo.events.find({"author.id": current_user.id, **VISIBLE_FILTER})
        .sort("created_at", DESCENDING)
        .limit(50)
    ]

    votes = list(
        mongo.votes.find({"user_id": current_user.id})
        .sort("created_at", DESCENDING)
        .limit(100)
    )
    object_ids: list[ObjectId] = []
    vote_order: list[str] = []
    for vote in votes:
        event_id = str(vote.get("event_id") or "")
        try:
            object_id = ObjectId(event_id)
        except InvalidId:
            continue
        object_ids.append(object_id)
        vote_order.append(event_id)

    events_by_id = {
        str(document["_id"]): document
        for document in mongo.events.find({"_id": {"$in": object_ids}, **VISIBLE_FILTER})
    }
    voted_events = [
        serialize_event(events_by_id[event_id], current_user.id, current_user=current_user)
        for event_id in vote_order
        if event_id in events_by_id
    ]

    return {
        "proposed_events": proposed_events,
        "voted_events": voted_events,
    }


@router.post("/logout", response_model=MessageResponse)
def logout(current_user: User = Depends(get_current_user)) -> dict:
    return {
        "status": "ok",
        "detail": "JWT access tokens are stateless. Remove the token on the client.",
    }
