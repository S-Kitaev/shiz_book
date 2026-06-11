from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.crud import user_to_public, write_audit
from app.database import get_db
from app.dependencies import require_admin
from app.models import User, UserRole
from app.schemas import UserPublic

router = APIRouter(prefix="/api/admin", tags=["admin"])


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
    current_user: User = Depends(require_admin),
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
