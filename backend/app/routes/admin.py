from fastapi import APIRouter, Depends, HTTPException, status
from bson import ObjectId
from bson.errors import InvalidId
from pymongo.database import Database
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.crud import audit_log_to_public, user_to_admin, user_to_public, write_audit
from app.database import get_db
from app.dependencies import require_admin, require_superadmin
from app.models import AuditLog, User, UserRole
from app.mongo import get_mongo
from app.schemas import UserPublic
from app.telegram_client import send_message, telegram_status

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _counts_by_author(collection, user_ids: list[int]) -> dict[int, int]:
    counts: dict[int, int] = {}
    pipeline = [
        {"$match": {"author.id": {"$in": user_ids}}},
        {"$group": {"_id": "$author.id", "count": {"$sum": 1}}},
    ]
    for item in collection.aggregate(pipeline):
        if item["_id"] is not None:
            counts[int(item["_id"])] = int(item["count"])
    return counts


def _vote_stats(mongo: Database, user_ids: list[int]) -> dict[int, dict]:
    stats = {
        user_id: {
            "votes_cast": 0,
            "voted_events": [],
        }
        for user_id in user_ids
    }
    event_ids: set[str] = set()

    for vote in mongo.votes.find({"user_id": {"$in": user_ids}}):
        user_id = int(vote["user_id"])
        event_id = str(vote["event_id"])
        stats[user_id]["votes_cast"] += 1
        stats[user_id]["voted_events"].append({"id": event_id, "title": "Без названия"})
        event_ids.add(event_id)

    object_ids = []
    for event_id in event_ids:
        try:
            object_ids.append(ObjectId(event_id))
        except InvalidId:
            continue

    titles = {
        str(event["_id"]): event.get("title") or "Без названия"
        for event in mongo.events.find({"_id": {"$in": object_ids}}, {"title": 1})
    }
    for user_stats in stats.values():
        for event in user_stats["voted_events"]:
            event["title"] = titles.get(event["id"], event["title"])

    return stats


@router.get("/users/overview")
def users_overview(
    db: Session = Depends(get_db),
    mongo: Database = Depends(get_mongo),
    current_user: User = Depends(require_admin),
) -> dict:
    users = db.scalars(select(User).order_by(User.id)).all()
    user_ids = [user.id for user in users]
    event_counts = _counts_by_author(mongo.events, user_ids)
    comment_counts = _counts_by_author(mongo.comments, user_ids)
    vote_stats = _vote_stats(mongo, user_ids)

    items = []
    for user in users:
        votes = vote_stats.get(user.id, {"votes_cast": 0, "voted_events": []})
        stats = {
            "events_proposed": event_counts.get(user.id, 0),
            "votes_cast": votes["votes_cast"],
            "comments_written": comment_counts.get(user.id, 0),
            "voted_events": votes["voted_events"],
        }
        items.append(user_to_admin(user, stats))

    return {
        "items": items,
        "can_manage_roles": current_user.role == UserRole.superadmin,
    }


@router.get("/users", response_model=list[UserPublic])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> list[dict]:
    users = db.scalars(select(User).order_by(User.id)).all()
    return [user_to_public(user) for user in users]


@router.post("/users/{user_id}/make-admin", response_model=UserPublic)
def make_admin(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
) -> dict:
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if not target.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is blocked.")
    if target.role == UserRole.superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin cannot be managed from admin endpoint.",
        )

    target.role = UserRole.admin
    write_audit(
        db,
        action="admin.make_admin",
        actor_user_id=current_user.id,
        entity_type="user",
        entity_id=target.id,
    )
    db.commit()
    db.refresh(target)
    return user_to_public(target)


@router.get("/telegram/status")
def get_telegram_status(current_user: User = Depends(require_admin)) -> dict:
    return telegram_status()


@router.post("/telegram/test")
def test_telegram(current_user: User = Depends(require_admin)) -> dict:
    result = send_message(
        text="Тестовое сообщение shiz.booka.dj",
    )
    return {"telegram_status": result}


@router.get("/audit-log")
def list_audit_log(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> dict:
    safe_limit = min(max(limit, 1), 300)
    items = db.scalars(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(safe_limit)
    ).all()
    return {"items": [audit_log_to_public(item) for item in items]}


@router.delete("/audit-log")
def clear_audit_log(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
) -> dict:
    db.execute(delete(AuditLog))
    write_audit(
        db,
        action="audit.clear",
        actor_user_id=current_user.id,
        entity_type="audit_log",
        entity_id="all",
    )
    db.commit()
    return {"status": "ok", "detail": "Audit log cleared."}
