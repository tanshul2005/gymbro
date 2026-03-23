# backend/app/routers/profile.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, Profile
from app.schemas.user import ProfileUpdate, ProfileWithUserOut

router = APIRouter(prefix="/profile", tags=["profile"])


# ─── Helper: get or create profile ───────────────────────────────────────────
async def _get_or_create_profile(user: User, db: AsyncSession) -> Profile:
    """
    Profiles are created lazily — a user may exist without one
    if they registered before profile creation was added.
    """
    result = await db.execute(
        select(Profile).where(Profile.user_id == user.id)
    )
    profile = result.scalar_one_or_none()

    if profile is None:
        profile = Profile(user_id=user.id)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)

    return profile


def _build_response(user: User, profile: Profile) -> ProfileWithUserOut:
    return ProfileWithUserOut(
        id=profile.id,
        user_id=user.id,
        email=user.email,
        full_name=profile.full_name,
        age=profile.age,
        gender=profile.gender,
        height_cm=profile.height_cm,
        weight_kg=profile.weight_kg,
        fitness_goal=profile.fitness_goal,
        activity_level=profile.activity_level,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=profile.updated_at,
    )


# ─── GET /profile/me ──────────────────────────────────────────────────────────
@router.get("/me", response_model=ProfileWithUserOut)
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_or_create_profile(current_user, db)
    return _build_response(current_user, profile)


# ─── PUT /profile/me ──────────────────────────────────────────────────────────
@router.put("/me", response_model=ProfileWithUserOut)
async def update_profile(
    payload: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Reject empty payloads
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No fields provided for update.",
        )

    profile = await _get_or_create_profile(current_user, db)

    for field, value in updates.items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)

    return _build_response(current_user, profile)