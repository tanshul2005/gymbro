
# backend/app/routers/workouts.py

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.workout import (
    PlanCreate,
    PlanOut,
    SessionCreate,
    SessionOut,
    SessionComplete,
    SessionExerciseCreate,
    SessionExerciseOut,
    SetCreate,
    SetOut,
    ExerciseCatalogOut,
)
from app.services import workout_service

router = APIRouter(prefix="/workouts", tags=["workouts"])


# ─── Plans ────────────────────────────────────────────────────────────────────

@router.post(
    "/plans",
    response_model=PlanOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_plan(
    data: PlanCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await workout_service.create_plan(db, current_user.id, data)


@router.get(
    "/plans",
    response_model=list[PlanOut],
)
async def get_plans(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await workout_service.get_plans(db, current_user.id)


# ─── Sessions ─────────────────────────────────────────────────────────────────

@router.post(
    "/sessions",
    response_model=SessionOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_session(
    data: SessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await workout_service.create_session(db, current_user.id, data)


@router.get(
    "/sessions",
    response_model=list[SessionOut],
)
async def get_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await workout_service.get_sessions(db, current_user.id)


@router.put(
    "/sessions/{session_id}",
    response_model=SessionOut,
    status_code=status.HTTP_200_OK,
)
async def complete_session(
    session_id: str,
    data: SessionComplete,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await workout_service.complete_session(
        db,
        session_id,
        current_user.id,
        data,
    )


# ─── Session Exercises ────────────────────────────────────────────────────────

@router.post(
    "/sessions/{session_id}/exercises",
    response_model=SessionExerciseOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_exercise(
    session_id: str,
    data: SessionExerciseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await workout_service.add_exercise_to_session(
        db,
        session_id,
        current_user.id,
        data,
    )


# ─── Exercise Sets ────────────────────────────────────────────────────────────

@router.post(
    "/sessions/{session_id}/exercises/{session_exercise_id}/sets",
    response_model=SetOut,
    status_code=status.HTTP_201_CREATED,
)
async def log_set(
    session_id: str,
    session_exercise_id: str,
    data: SetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await workout_service.log_set(
        db,
        session_id,
        session_exercise_id,
        current_user.id,
        data,
    )

# ─── Exercise Catalog ─────────────────────────────────────────────────────────

@router.get(
    "/catalog",
    response_model=list[ExerciseCatalogOut],
)
async def get_catalog(
    category: Optional[str] = None,
    muscle_group: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await workout_service.get_catalog(db, category, muscle_group)