
# backend/app/services/workout_service.py

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
from datetime import datetime, timezone
from typing import Optional

from app.models.workout import (
    WorkoutPlan,
    PlanExercise,
    WorkoutSession,
    SessionExercise,
    ExerciseSet,
    SessionStatusEnum,
    ExerciseCatalog,
)
from app.schemas.workout import (
    PlanCreate,
    SessionCreate,
    SessionComplete,
    SessionExerciseCreate,
    SetCreate,
    SetUpdate,
)


# ─── Helper ───────────────────────────────────────────────────────────────────

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ─── Plans ────────────────────────────────────────────────────────────────────

async def create_plan(
    db: AsyncSession,
    user_id: str,
    data: PlanCreate,
) -> WorkoutPlan:

    plan = WorkoutPlan(
        user_id=user_id,
        name=data.name,
        description=data.description,
    )

    db.add(plan)
    await db.flush()

    for ex in data.exercises:
        db.add(
            PlanExercise(
                plan_id=plan.id,
                exercise_name=ex.exercise_name,
                sets=ex.sets,
                reps=ex.reps,
                weight_kg=ex.weight_kg,
                order_index=ex.order_index,
            )
        )

    await db.commit()

    return await _get_plan_or_404(db, plan.id, user_id)


async def get_plans(
    db: AsyncSession,
    user_id: str,
) -> list[WorkoutPlan]:

    result = await db.execute(
        select(WorkoutPlan)
        .options(selectinload(WorkoutPlan.plan_exercises))
        .where(WorkoutPlan.user_id == user_id)
        .order_by(WorkoutPlan.created_at.desc())
    )

    return result.scalars().all()


async def _get_plan_or_404(
    db: AsyncSession,
    plan_id: str,
    user_id: str,
) -> WorkoutPlan:

    result = await db.execute(
        select(WorkoutPlan)
        .options(selectinload(WorkoutPlan.plan_exercises))
        .where(
            and_(
                WorkoutPlan.id == plan_id,
                WorkoutPlan.user_id == user_id,
            )
        )
    )

    plan = result.scalar_one_or_none()

    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    return plan


# ─── Sessions ─────────────────────────────────────────────────────────────────

async def get_session(
    db: AsyncSession,
    session_id: str,
    user_id: str,
) -> WorkoutSession:
    """Public wrapper — returns a single session with exercises+sets, or 404."""
    return await _get_session_or_404(db, session_id, user_id)

async def create_session(
    db: AsyncSession,
    user_id: str,
    data: SessionCreate,
) -> WorkoutSession:

    plan = None
    if data.plan_id:
        plan = await _get_plan_or_404(db, data.plan_id, user_id)

    session = WorkoutSession(
        user_id=user_id,
        plan_id=data.plan_id,
        name=plan.name if plan else None,
        notes=data.notes,
        status=SessionStatusEnum.in_progress,
        started_at=_utcnow(),
    )

    db.add(session)
    await db.flush()  # get session.id before adding children

    if plan and plan.plan_exercises:
        sorted_exercises = sorted(
            plan.plan_exercises,
            key=lambda e: (e.order_index or 0),
        )
        for ex in sorted_exercises:
            session_exercise = SessionExercise(
                session_id=session.id,
                exercise_name=ex.exercise_name,
                order_index=ex.order_index,
            )
            db.add(session_exercise)
            await db.flush()  # get session_exercise.id

            num_sets = ex.sets or 0
            for set_num in range(1, num_sets + 1):
                db.add(
                    ExerciseSet(
                        session_exercise_id=session_exercise.id,
                        set_number=set_num,
                        reps=ex.reps,
                        weight_kg=ex.weight_kg,
                    )
                )

    await db.commit()

    return await _get_session_or_404(db, session.id, user_id)


async def get_sessions(
    db: AsyncSession,
    user_id: str,
) -> list[WorkoutSession]:

    result = await db.execute(
        select(WorkoutSession)
        .options(
            selectinload(WorkoutSession.session_exercises)
            .selectinload(SessionExercise.sets)
        )
        .where(WorkoutSession.user_id == user_id)
        .order_by(WorkoutSession.started_at.desc())
    )

    return result.scalars().all()


async def complete_session(
    db: AsyncSession,
    session_id: str,
    user_id: str,
    data: SessionComplete,
) -> WorkoutSession:

    session = await _get_session_or_404(db, session_id, user_id)

    if session.status != SessionStatusEnum.in_progress:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Session is already {session.status.value}",
        )

    now = _utcnow()

    session.status = SessionStatusEnum.completed
    session.completed_at = now

    started = session.started_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)

    session.duration_minutes = max(
        1,
        round((now - started).total_seconds() / 60),
    )

    if data.notes:
        session.notes = data.notes

    await db.commit()

    return await _get_session_or_404(db, session_id, user_id)


async def _get_session_or_404(
    db: AsyncSession,
    session_id: str,
    user_id: str,
) -> WorkoutSession:

    result = await db.execute(
        select(WorkoutSession)
        .options(
            selectinload(WorkoutSession.session_exercises)
            .selectinload(SessionExercise.sets)
        )
        .where(
            and_(
                WorkoutSession.id == session_id,
                WorkoutSession.user_id == user_id,
            )
        )
    )

    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return session


# ─── Session Exercises ────────────────────────────────────────────────────────

async def add_exercise_to_session(
    db: AsyncSession,
    session_id: str,
    user_id: str,
    data: SessionExerciseCreate,
) -> SessionExercise:

    session = await _get_session_or_404(db, session_id, user_id)

    if session.status != SessionStatusEnum.in_progress:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot add exercises to a completed or cancelled session",
        )

    order_index = data.order_index

    if order_index is None:
        result = await db.execute(
            select(func.max(SessionExercise.order_index))
            .where(SessionExercise.session_id == session_id)
        )
        max_order = result.scalar_one()
        order_index = (max_order or 0) + 1

    session_exercise = SessionExercise(
        session_id=session_id,
        exercise_name=data.exercise_name,
        category=data.category,
        muscle_group=data.muscle_group,
        order_index=order_index,
        notes=data.notes,
    )

    db.add(session_exercise)
    await db.commit()

    result = await db.execute(
        select(SessionExercise)
        .options(selectinload(SessionExercise.sets))
        .where(SessionExercise.id == session_exercise.id)
    )

    return result.scalar_one()


# ─── Exercise Sets ────────────────────────────────────────────────────────────

async def log_set(
    db: AsyncSession,
    session_id: str,
    session_exercise_id: str,
    user_id: str,
    data: SetCreate,
) -> ExerciseSet:

    session = await _get_session_or_404(db, session_id, user_id)

    if session.status != SessionStatusEnum.in_progress:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot log sets on a completed or cancelled session",
        )

    result = await db.execute(
        select(SessionExercise).where(
            and_(
                SessionExercise.id == session_exercise_id,
                SessionExercise.session_id == session_id,
            )
        )
    )

    session_exercise = result.scalar_one_or_none()

    if not session_exercise:
        raise HTTPException(
            status_code=404,
            detail="Exercise not found in this session",
        )

    exercise_set = ExerciseSet(
        session_exercise_id=session_exercise_id,
        set_number=data.set_number,
        reps=data.reps,
        weight_kg=data.weight_kg,
        duration_seconds=data.duration_seconds,
        rest_seconds=data.rest_seconds,
        notes=data.notes,
        is_logged=True,   # marks this as an actually-performed set
    )

    db.add(exercise_set)
    await db.commit()

    await db.refresh(exercise_set)

    return exercise_set

# ─── Update Set ─────────────────────────────────────────────────────────────

async def update_set(
    db: AsyncSession,
    session_id: str,
    session_exercise_id: str,
    set_id: str,
    user_id: str,
    data: SetUpdate,
) -> ExerciseSet:

    session = await _get_session_or_404(db, session_id, user_id)

    if session.status != SessionStatusEnum.in_progress:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update sets on a completed or cancelled session",
        )

    result = await db.execute(
        select(ExerciseSet)
        .where(
            and_(
                ExerciseSet.id == set_id,
                ExerciseSet.session_exercise_id == session_exercise_id,
            )
        )
    )
    exercise_set = result.scalar_one_or_none()

    if not exercise_set:
        raise HTTPException(status_code=404, detail="Set not found")

    if data.reps is not None:
        exercise_set.reps = data.reps
    if data.weight_kg is not None:
        exercise_set.weight_kg = data.weight_kg
    if data.notes is not None:
        exercise_set.notes = data.notes

    await db.commit()
    await db.refresh(exercise_set)

    return exercise_set


# ─── Delete Set ─────────────────────────────────────────────────────────────

async def delete_set(
    db: AsyncSession,
    session_id: str,
    session_exercise_id: str,
    set_id: str,
    user_id: str,
) -> None:

    # Validate session ownership
    session = await _get_session_or_404(db, session_id, user_id)

    if session.status != SessionStatusEnum.in_progress:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete sets from a completed or cancelled session",
        )

    # Find the set, verify it belongs to the correct exercise+session
    result = await db.execute(
        select(ExerciseSet)
        .where(
            and_(
                ExerciseSet.id == set_id,
                ExerciseSet.session_exercise_id == session_exercise_id,
            )
        )
    )
    exercise_set = result.scalar_one_or_none()

    if not exercise_set:
        raise HTTPException(status_code=404, detail="Set not found")

    await db.delete(exercise_set)
    await db.commit()


# ─── Exercise Catalog ─────────────────────────────────────────────────────────

async def get_catalog(
    db: AsyncSession,
    category: Optional[str] = None,
    muscle_group: Optional[str] = None,
) -> list[ExerciseCatalog]:

    query = select(ExerciseCatalog).order_by(ExerciseCatalog.name)

    if category:
        query = query.where(ExerciseCatalog.category == category)

    if muscle_group:
        query = query.where(ExerciseCatalog.muscle_group == muscle_group)

    result = await db.execute(query)
    return result.scalars().all()