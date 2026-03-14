from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ─── Enums ────────────────────────────────────────────────────────────────────

class SessionStatus(str, Enum):
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


# ─── Plan Exercises ───────────────────────────────────────────────────────────

class PlanExerciseCreate(BaseModel):
    exercise_name: str = Field(..., min_length=1, max_length=255)
    sets: Optional[int] = Field(None, ge=1)
    reps: Optional[int] = Field(None, ge=1)
    order_index: Optional[int] = Field(None, ge=1)


class PlanExerciseOut(BaseModel):
    exercise_name: str
    sets: Optional[int] = None
    reps: Optional[int] = None
    order_index: Optional[int] = None

    class Config:
        from_attributes = True


# ─── Plans ────────────────────────────────────────────────────────────────────

class PlanCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    exercises: List[PlanExerciseCreate] = Field(default_factory=list)


class PlanOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    plan_exercises: List[PlanExerciseOut] = Field(default_factory=list)

    class Config:
        from_attributes = True


# ─── Sets ─────────────────────────────────────────────────────────────────────

class SetCreate(BaseModel):
    set_number: int = Field(..., ge=1)
    reps: Optional[int] = Field(None, ge=0)
    weight_kg: Optional[float] = Field(None, ge=0)
    duration_seconds: Optional[int] = Field(None, ge=0)
    rest_seconds: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = None


class SetOut(BaseModel):
    id: str
    set_number: int
    reps: Optional[int] = None
    weight_kg: Optional[float] = None
    duration_seconds: Optional[int] = None
    rest_seconds: Optional[int] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


# ─── Session Exercises ────────────────────────────────────────────────────────

class SessionExerciseCreate(BaseModel):
    exercise_name: str = Field(..., min_length=1, max_length=255)
    category: Optional[str] = None
    muscle_group: Optional[str] = None
    order_index: Optional[int] = Field(None, ge=1)
    notes: Optional[str] = None


class SessionExerciseOut(BaseModel):
    id: str
    exercise_name: str
    category: Optional[str] = None
    muscle_group: Optional[str] = None
    order_index: Optional[int] = None
    notes: Optional[str] = None
    sets: List[SetOut] = Field(default_factory=list)

    class Config:
        from_attributes = True


# ─── Sessions ─────────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    plan_id: Optional[str] = None
    notes: Optional[str] = None


class SessionComplete(BaseModel):
    notes: Optional[str] = None


class SessionOut(BaseModel):
    id: str
    plan_id: Optional[str] = None
    status: SessionStatus
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None
    session_exercises: List[SessionExerciseOut] = Field(default_factory=list)

    class Config:
        from_attributes = True

# ─── Exercise Catalog ─────────────────────────────────────────────────────────
class ExerciseCatalogOut(BaseModel):
    id: str
    name: str
    category: str
    muscle_group: str
    equipment: Optional[str] = None
    description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True