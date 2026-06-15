from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pymongo import DESCENDING
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError
from sqlalchemy.orm import Session

from app.content import (
    VISIBLE_FILTER,
    VOTABLE_STATUSES,
    can_manage_event,
    get_event_or_404,
    now_utc,
    object_id_or_404,
    serialize_comment,
    serialize_datetime,
    serialize_event,
    serialize_feed_post,
    user_snapshot,
)
from app.crud import write_audit
from app.database import get_db
from app.dependencies import get_current_user, get_optional_current_user, require_admin, require_superadmin
from app.models import User
from app.mongo import get_mongo
from app.schemas import (
    AdminPostCreate,
    CommentCreate,
    EventCreate,
    EventStatusUpdate,
    MessageResponse,
)
from app.telegram_client import publish_admin_post, publish_event_proposal

router = APIRouter(tags=["content"])


def require_event_manager(event: dict[str, Any], current_user: User) -> None:
    if not can_manage_event(event, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the event author or admins can manage this event.",
        )


def apply_event_status_update(
    *,
    mongo: Database,
    sql: Session,
    event_id: str,
    payload: EventStatusUpdate,
    current_user: User,
    require_owner_or_admin: bool,
) -> dict[str, Any]:
    event = get_event_or_404(mongo, event_id, include_hidden=True)
    if require_owner_or_admin:
        require_event_manager(event, current_user)

    before = {
        "status": event.get("status"),
        "hidden": bool(event.get("hidden", False)),
    }
    update: dict[str, Any] = {
        "status": payload.status,
        "updated_at": now_utc(),
        "moderated_by": user_snapshot(current_user),
    }
    if payload.hidden is not None:
        update["hidden"] = payload.hidden

    mongo.events.update_one({"_id": event["_id"]}, {"$set": update})
    updated = get_event_or_404(mongo, event_id, include_hidden=True)
    write_audit(
        sql,
        action="event.status_update",
        actor_user_id=current_user.id,
        entity_type="event",
        entity_id=event_id,
        details={
            "title": event.get("title"),
            "before": before,
            "after": {
                "status": updated.get("status"),
                "hidden": bool(updated.get("hidden", False)),
            },
        },
    )
    sql.commit()
    return serialize_event(updated, current_user=current_user)


def admin_post_text_or_400(payload: AdminPostCreate) -> str:
    text = payload.text if payload.text is not None else payload.body
    text = text.strip() if text else ""
    if not text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="text is required.",
        )
    return text


def comment_snapshot(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(document.get("_id")),
        "body": document.get("body"),
        "hidden": bool(document.get("hidden", False)),
        "author": document.get("author"),
        "created_at": serialize_datetime(document.get("created_at")),
    }


def event_snapshot(
    document: dict[str, Any],
    *,
    comments: list[dict[str, Any]] | None = None,
    votes: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "id": str(document.get("_id")),
        "title": document.get("title"),
        "description": document.get("description"),
        "external_url": document.get("external_url"),
        "image_url": document.get("image_url"),
        "status": document.get("status"),
        "hidden": bool(document.get("hidden", False)),
        "author": document.get("author"),
        "vote_count": document.get("vote_count", 0),
        "comment_count": document.get("comment_count", 0),
        "comments": comments or [],
        "votes": votes or [],
        "created_at": serialize_datetime(document.get("created_at")),
        "updated_at": serialize_datetime(document.get("updated_at")),
    }


def admin_post_snapshot(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(document.get("_id")),
        "title": document.get("title"),
        "body": document.get("body"),
        "hidden": bool(document.get("hidden", False)),
        "author": document.get("author"),
        "created_at": serialize_datetime(document.get("created_at")),
        "updated_at": serialize_datetime(document.get("updated_at")),
    }


def vote_snapshot(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "event_id": document.get("event_id"),
        "user_id": document.get("user_id"),
        "created_at": serialize_datetime(document.get("created_at")),
    }


@router.get("/api/feed")
def get_feed(
    limit: int = Query(default=30, ge=1, le=100),
    db: Database = Depends(get_mongo),
    current_user: User | None = Depends(get_optional_current_user),
) -> dict[str, list[dict[str, Any]]]:
    current_user_id = current_user.id if current_user else None
    events = [
        serialize_event(document, current_user_id, current_user=current_user)
        for document in db.events.find(VISIBLE_FILTER).sort("created_at", DESCENDING).limit(limit)
    ]
    posts = [
        serialize_feed_post(document)
        for document in db.feed_posts.find(VISIBLE_FILTER)
        .sort("created_at", DESCENDING)
        .limit(limit)
    ]
    items = sorted(
        [*events, *posts],
        key=lambda item: item.get("created_at") or "",
        reverse=True,
    )[:limit]
    return {"items": items}


@router.get("/api/events")
def list_events(
    db: Database = Depends(get_mongo),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User | None = Depends(get_optional_current_user),
) -> dict[str, list[dict[str, Any]]]:
    current_user_id = current_user.id if current_user else None
    events = db.events.find(VISIBLE_FILTER).sort("created_at", DESCENDING).limit(limit)
    return {"items": [serialize_event(event, current_user_id, current_user=current_user) for event in events]}


@router.post("/api/events", status_code=status.HTTP_201_CREATED)
def create_event(
    payload: EventCreate,
    db: Database = Depends(get_mongo),
    sql: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    now = now_utc()
    document = {
        "title": payload.title.strip(),
        "external_url": str(payload.external_url).strip() if payload.external_url else None,
        "description": payload.description.strip(),
        "image_url": str(payload.image_url).strip() if payload.image_url else None,
        "status": "proposed",
        "hidden": False,
        "author": user_snapshot(current_user),
        "vote_count": 0,
        "comment_count": 0,
        "votes": [],
        "created_at": now,
        "updated_at": now,
    }
    result = db.events.insert_one(document)
    document["_id"] = result.inserted_id
    telegram_result = publish_event_proposal(
        title=document["title"],
        description=document["description"],
        image_url=document.get("image_url"),
        external_url=document.get("external_url"),
    )
    document["telegram_status"] = telegram_result
    db.events.update_one(
        {"_id": result.inserted_id},
        {"$set": {"telegram_status": telegram_result}},
    )
    write_audit(
        sql,
        action="event.create",
        actor_user_id=current_user.id,
        entity_type="event",
        entity_id=str(result.inserted_id),
        details={"event": event_snapshot(document), "telegram_status": telegram_result},
    )
    sql.commit()
    response = serialize_event(document, current_user=current_user)
    response["telegram_status"] = telegram_result
    return response


@router.get("/api/events/{event_id}")
def get_event(
    event_id: str,
    db: Database = Depends(get_mongo),
    current_user: User | None = Depends(get_optional_current_user),
) -> dict[str, Any]:
    current_user_id = current_user.id if current_user else None
    return serialize_event(get_event_or_404(db, event_id), current_user_id, current_user=current_user)


@router.post("/api/events/{event_id}/vote")
def vote_event(
    event_id: str,
    db: Database = Depends(get_mongo),
    sql: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    event = get_event_or_404(db, event_id)
    if event.get("status") not in VOTABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Voting is closed for this event.",
        )

    vote = {
        "event_id": event_id,
        "user_id": current_user.id,
        "created_at": now_utc(),
    }
    try:
        db.votes.insert_one(vote)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already voted for this event.",
        ) from None

    db.events.update_one(
        {"_id": event["_id"]},
        {
            "$inc": {"vote_count": 1},
            "$addToSet": {"votes": current_user.id},
            "$set": {"updated_at": now_utc()},
        },
    )
    updated = get_event_or_404(db, event_id)
    write_audit(
        sql,
        action="event.vote",
        actor_user_id=current_user.id,
        entity_type="event",
        entity_id=event_id,
        details={"title": event.get("title"), "voter": user_snapshot(current_user)},
    )
    sql.commit()
    return serialize_event(updated, current_user=current_user)


@router.delete("/api/events/{event_id}/unvote")
@router.post("/api/events/{event_id}/unvote")
def unvote_event(
    event_id: str,
    db: Database = Depends(get_mongo),
    sql: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    event = get_event_or_404(db, event_id)
    result = db.votes.delete_one({"event_id": event_id, "user_id": current_user.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vote not found.")

    db.events.update_one(
        {"_id": event["_id"]},
        {
            "$inc": {"vote_count": -1},
            "$pull": {"votes": current_user.id},
            "$set": {"updated_at": now_utc()},
        },
    )
    updated = get_event_or_404(db, event_id)
    write_audit(
        sql,
        action="event.unvote",
        actor_user_id=current_user.id,
        entity_type="event",
        entity_id=event_id,
        details={"title": event.get("title"), "voter": user_snapshot(current_user)},
    )
    sql.commit()
    return serialize_event(updated, current_user=current_user)


@router.patch("/api/events/{event_id}/status")
def update_own_event_status(
    event_id: str,
    payload: EventStatusUpdate,
    db: Database = Depends(get_mongo),
    sql: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    return apply_event_status_update(
        mongo=db,
        sql=sql,
        event_id=event_id,
        payload=payload,
        current_user=current_user,
        require_owner_or_admin=True,
    )


@router.delete("/api/events/{event_id}", response_model=MessageResponse)
def delete_event(
    event_id: str,
    db: Database = Depends(get_mongo),
    sql: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    event = get_event_or_404(db, event_id, include_hidden=True)
    require_event_manager(event, current_user)

    comments = [comment_snapshot(comment) for comment in db.comments.find({"event_id": event_id})]
    votes = [vote_snapshot(vote) for vote in db.votes.find({"event_id": event_id})]
    snapshot = event_snapshot(event, comments=comments, votes=votes)
    db.events.delete_one({"_id": event["_id"]})
    db.comments.delete_many({"event_id": event_id})
    db.votes.delete_many({"event_id": event_id})
    write_audit(
        sql,
        action="event.delete",
        actor_user_id=current_user.id,
        entity_type="event",
        entity_id=event_id,
        details={"event": snapshot, "deleted_by": user_snapshot(current_user)},
    )
    sql.commit()
    return {"status": "ok", "detail": "Event deleted."}


@router.get("/api/events/{event_id}/comments")
def list_comments(event_id: str, db: Database = Depends(get_mongo)) -> dict[str, Any]:
    get_event_or_404(db, event_id)
    comments = db.comments.find({"event_id": event_id, **VISIBLE_FILTER}).sort("created_at", 1)
    return {"items": [serialize_comment(comment) for comment in comments]}


@router.post("/api/events/{event_id}/comments", status_code=status.HTTP_201_CREATED)
def create_comment(
    event_id: str,
    payload: CommentCreate,
    db: Database = Depends(get_mongo),
    sql: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    event = get_event_or_404(db, event_id)
    now = now_utc()
    document = {
        "event_id": event_id,
        "body": payload.body.strip(),
        "hidden": False,
        "author": user_snapshot(current_user),
        "created_at": now,
    }
    result = db.comments.insert_one(document)
    db.events.update_one(
        {"_id": event["_id"]},
        {"$inc": {"comment_count": 1}, "$set": {"updated_at": now}},
    )
    document["_id"] = result.inserted_id
    write_audit(
        sql,
        action="comment.create",
        actor_user_id=current_user.id,
        entity_type="comment",
        entity_id=str(result.inserted_id),
        details={
            "event_id": event_id,
            "event_title": event.get("title"),
            "comment": comment_snapshot(document),
        },
    )
    sql.commit()
    return serialize_comment(document)


def create_admin_post_document(
    *,
    payload: AdminPostCreate,
    mongo: Database,
    sql: Session,
    current_user: User,
    publish_to_telegram: bool,
) -> dict[str, Any]:
    text = admin_post_text_or_400(payload)
    telegram_result: dict[str, Any] | None = None

    now = now_utc()
    document = {
        "title": payload.title.strip(),
        "body": text,
        "hidden": False,
        "author": user_snapshot(current_user),
        "created_at": now,
        "updated_at": now,
    }
    result = mongo.feed_posts.insert_one(document)
    document["_id"] = result.inserted_id

    if publish_to_telegram:
        telegram_result = publish_admin_post(
            title=document["title"],
            text=document["body"],
        )
        document["telegram_status"] = telegram_result
        mongo.feed_posts.update_one(
            {"_id": result.inserted_id},
            {"$set": {"telegram_status": telegram_result}},
        )

    write_audit(
        sql,
        action="admin_post.create",
        actor_user_id=current_user.id,
        entity_type="admin_post",
        entity_id=str(result.inserted_id),
        details={"post": admin_post_snapshot(document), "telegram_status": telegram_result},
    )
    sql.commit()
    response = serialize_feed_post(document)
    if telegram_result is not None:
        response["telegram_status"] = telegram_result
    return response


@router.post("/api/admin/posts", status_code=status.HTTP_201_CREATED)
def create_admin_post(
    payload: AdminPostCreate,
    db: Database = Depends(get_mongo),
    sql: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> dict[str, Any]:
    return create_admin_post_document(
        payload=payload,
        mongo=db,
        sql=sql,
        current_user=current_user,
        publish_to_telegram=True,
    )


@router.post("/api/admin/feed-posts", status_code=status.HTTP_201_CREATED)
def create_legacy_admin_feed_post(
    payload: AdminPostCreate,
    db: Database = Depends(get_mongo),
    sql: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> dict[str, Any]:
    return create_admin_post_document(
        payload=payload,
        mongo=db,
        sql=sql,
        current_user=current_user,
        publish_to_telegram=True,
    )


@router.delete("/api/admin/posts/{post_id}", response_model=MessageResponse)
def delete_admin_post(
    post_id: str,
    db: Database = Depends(get_mongo),
    sql: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
) -> dict[str, str]:
    post = db.feed_posts.find_one({"_id": object_id_or_404(post_id)})
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found.")

    db.feed_posts.delete_one({"_id": post["_id"]})
    write_audit(
        sql,
        action="admin_post.delete",
        actor_user_id=current_user.id,
        entity_type="admin_post",
        entity_id=post_id,
        details={"post": admin_post_snapshot(post), "deleted_by": user_snapshot(current_user)},
    )
    sql.commit()
    return {"status": "ok", "detail": "Admin post deleted."}


@router.patch("/api/admin/events/{event_id}/status")
def update_event_status(
    event_id: str,
    payload: EventStatusUpdate,
    db: Database = Depends(get_mongo),
    sql: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> dict[str, Any]:
    return apply_event_status_update(
        mongo=db,
        sql=sql,
        event_id=event_id,
        payload=payload,
        current_user=current_user,
        require_owner_or_admin=False,
    )


@router.post("/api/admin/events/{event_id}/comments/{comment_id}/hide")
def hide_comment(
    event_id: str,
    comment_id: str,
    db: Database = Depends(get_mongo),
    sql: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> dict[str, Any]:
    event = get_event_or_404(db, event_id, include_hidden=True)
    comment_before = db.comments.find_one({"_id": object_id_or_404(comment_id), "event_id": event_id})
    if not comment_before:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found.")

    result = db.comments.update_one(
        {"_id": object_id_or_404(comment_id), "event_id": event_id},
        {
            "$set": {
                "hidden": True,
                "moderated_by": user_snapshot(current_user),
                "moderated_at": now_utc(),
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found.")
    comment = db.comments.find_one({"_id": object_id_or_404(comment_id)})
    write_audit(
        sql,
        action="comment.hide",
        actor_user_id=current_user.id,
        entity_type="comment",
        entity_id=comment_id,
        details={
            "event_id": event_id,
            "event_title": event.get("title"),
            "comment": comment_snapshot(comment_before),
        },
    )
    sql.commit()
    return serialize_comment(comment)
