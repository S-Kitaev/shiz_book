from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.crud import user_to_public, write_audit
from app.database import get_db
from app.dependencies import require_superadmin
from app.models import User, UserRole
from app.schemas import UserPublic

router = APIRouter(prefix="/api/superadmin", tags=["superadmin"])


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
