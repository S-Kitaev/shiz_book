from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException, status
from pymongo.database import Database

from app.models import User

VISIBLE_FILTER = {"hidden": {"$ne": True}}
VOTABLE_STATUSES = {"proposed", "voting", "discussion"}
ADMIN_ROLES = {"admin", "superadmin"}


def now_utc() -> datetime:
    return datetime.now(UTC)


def object_id_or_404(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except InvalidId as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.") from exc


def serialize_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat()


def user_snapshot(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
    }


def is_admin_user(user: User) -> bool:
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    return role in ADMIN_ROLES


def can_manage_event(document: dict[str, Any], user: User | None) -> bool:
    if not user:
        return False
    author_id = (document.get("author") or {}).get("id")
    return is_admin_user(user) or author_id == user.id


def serialize_event(
    document: dict[str, Any],
    current_user_id: int | None = None,
    *,
    current_user: User | None = None,
) -> dict[str, Any]:
    votes = document.get("votes") or []
    effective_user_id = current_user.id if current_user else current_user_id
    return {
        "id": str(document["_id"]),
        "type": "event",
        "title": document.get("title"),
        "external_url": document.get("external_url"),
        "description": document.get("description"),
        "image_url": document.get("image_url"),
        "status": document.get("status"),
        "hidden": bool(document.get("hidden", False)),
        "author": document.get("author"),
        "vote_count": document.get("vote_count", 0),
        "comment_count": document.get("comment_count", 0),
        "voted_by_current_user": bool(effective_user_id and effective_user_id in votes),
        "can_manage_by_current_user": can_manage_event(document, current_user),
        "created_at": serialize_datetime(document.get("created_at")),
        "updated_at": serialize_datetime(document.get("updated_at")),
    }


def serialize_feed_post(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(document["_id"]),
        "type": "admin_post",
        "title": document.get("title"),
        "body": document.get("body"),
        "hidden": bool(document.get("hidden", False)),
        "author": document.get("author"),
        "created_at": serialize_datetime(document.get("created_at")),
        "updated_at": serialize_datetime(document.get("updated_at")),
    }


def serialize_comment(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(document["_id"]),
        "event_id": document.get("event_id"),
        "body": document.get("body"),
        "hidden": bool(document.get("hidden", False)),
        "author": document.get("author"),
        "created_at": serialize_datetime(document.get("created_at")),
    }


def get_event_or_404(
    db: Database,
    event_id: str,
    *,
    include_hidden: bool = False,
) -> dict[str, Any]:
    query: dict[str, Any] = {"_id": object_id_or_404(event_id)}
    if not include_hidden:
        query.update(VISIBLE_FILTER)
    event = db.events.find_one(query)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found.")
    return event
