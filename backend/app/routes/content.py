from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pymongo import DESCENDING
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from app.content import (
    VISIBLE_FILTER,
    VOTABLE_STATUSES,
    get_event_or_404,
    now_utc,
    object_id_or_404,
    serialize_comment,
    serialize_event,
    serialize_feed_post,
    user_snapshot,
)
from app.dependencies import get_current_user, require_admin
from app.models import User
from app.mongo import get_mongo
from app.schemas import (
    AdminPostCreate,
    CommentCreate,
    EventCreate,
    EventStatusUpdate,
)

router = APIRouter(tags=["content"])


@router.get("/api/feed")
def get_feed(
    limit: int = Query(default=30, ge=1, le=100),
    db: Database = Depends(get_mongo),
) -> dict[str, list[dict[str, Any]]]:
    events = [
        serialize_event(document)
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
) -> dict[str, list[dict[str, Any]]]:
    events = db.events.find(VISIBLE_FILTER).sort("created_at", DESCENDING).limit(limit)
    return {"items": [serialize_event(event) for event in events]}


@router.post("/api/events", status_code=status.HTTP_201_CREATED)
def create_event(
    payload: EventCreate,
    db: Database = Depends(get_mongo),
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
    return serialize_event(document, current_user.id)


@router.get("/api/events/{event_id}")
def get_event(event_id: str, db: Database = Depends(get_mongo)) -> dict[str, Any]:
    return serialize_event(get_event_or_404(db, event_id))


@router.post("/api/events/{event_id}/vote")
def vote_event(
    event_id: str,
    db: Database = Depends(get_mongo),
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
    return serialize_event(updated, current_user.id)


@router.delete("/api/events/{event_id}/unvote")
@router.post("/api/events/{event_id}/unvote")
def unvote_event(
    event_id: str,
    db: Database = Depends(get_mongo),
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
    return serialize_event(updated, current_user.id)


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
    return serialize_comment(document)


@router.post("/api/admin/feed-posts", status_code=status.HTTP_201_CREATED)
def create_admin_post(
    payload: AdminPostCreate,
    db: Database = Depends(get_mongo),
    current_user: User = Depends(require_admin),
) -> dict[str, Any]:
    now = now_utc()
    document = {
        "title": payload.title.strip(),
        "body": payload.body.strip(),
        "hidden": False,
        "author": user_snapshot(current_user),
        "created_at": now,
        "updated_at": now,
    }
    result = db.feed_posts.insert_one(document)
    document["_id"] = result.inserted_id
    return serialize_feed_post(document)


@router.patch("/api/admin/events/{event_id}/status")
def update_event_status(
    event_id: str,
    payload: EventStatusUpdate,
    db: Database = Depends(get_mongo),
    current_user: User = Depends(require_admin),
) -> dict[str, Any]:
    event = get_event_or_404(db, event_id, include_hidden=True)
    update: dict[str, Any] = {
        "status": payload.status,
        "updated_at": now_utc(),
        "moderated_by": user_snapshot(current_user),
    }
    if payload.hidden is not None:
        update["hidden"] = payload.hidden

    db.events.update_one({"_id": event["_id"]}, {"$set": update})
    updated = get_event_or_404(db, event_id, include_hidden=True)
    return serialize_event(updated, current_user.id)


@router.post("/api/admin/events/{event_id}/comments/{comment_id}/hide")
def hide_comment(
    event_id: str,
    comment_id: str,
    db: Database = Depends(get_mongo),
    current_user: User = Depends(require_admin),
) -> dict[str, Any]:
    get_event_or_404(db, event_id, include_hidden=True)
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
    return serialize_comment(comment)
