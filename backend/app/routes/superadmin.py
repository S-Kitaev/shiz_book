from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.crud import error_log_to_public, user_to_public, write_audit
from app.database import get_db
from app.dependencies import require_superadmin
from app.models import SystemErrorLog, User, UserRole
from app.schemas import ErrorLogStatusUpdate, MessageResponse, UserPublic

router = APIRouter(prefix="/api/superadmin", tags=["superadmin"])


@router.get("/error-log")
def list_error_log(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
) -> dict:
    errors = db.scalars(select(SystemErrorLog).order_by(SystemErrorLog.created_at.desc())).all()
    return {"items": [error_log_to_public(error) for error in errors]}


@router.patch("/error-log/{error_id}")
def update_error_log_status(
    error_id: int,
    payload: ErrorLogStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
) -> dict:
    error = db.get(SystemErrorLog, error_id)
    if not error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Error log item not found.")

    error.status = payload.status
    write_audit(
        db,
        action="superadmin.update_error_log",
        actor_user_id=current_user.id,
        entity_type="system_error_log",
        entity_id=error.id,
        details={"status": payload.status},
    )
    db.commit()
    db.refresh(error)
    return error_log_to_public(error)


@router.delete("/error-log/{error_id}", response_model=MessageResponse)
def delete_error_log(
    error_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
) -> dict:
    error = db.get(SystemErrorLog, error_id)
    if not error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Error log item not found.")
    if error.status != "resolved":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only resolved errors can be deleted.",
        )

    write_audit(
        db,
        action="superadmin.delete_error_log",
        actor_user_id=current_user.id,
        entity_type="system_error_log",
        entity_id=error.id,
    )
    db.delete(error)
    db.commit()
    return {"status": "ok", "detail": "Error log item deleted."}


@router.post("/users/{user_id}/remove-admin", response_model=UserPublic)
def remove_admin(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
) -> dict:
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if target.role == UserRole.superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot remove the superadmin role from this endpoint.",
        )
    if target.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is not admin.")

    target.role = UserRole.user
    write_audit(
        db,
        action="superadmin.remove_admin",
        actor_user_id=current_user.id,
        entity_type="user",
        entity_id=target.id,
    )
    db.commit()
    db.refresh(target)
    return user_to_public(target)


@router.post("/users/{user_id}/block", response_model=UserPublic)
def block_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
) -> dict:
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if target.id == current_user.id or target.role == UserRole.superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot block active superadmin.",
        )

    target.is_active = False
    write_audit(
        db,
        action="superadmin.block_user",
        actor_user_id=current_user.id,
        entity_type="user",
        entity_id=target.id,
    )
    db.commit()
    db.refresh(target)
    return user_to_public(target)
