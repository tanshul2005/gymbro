from sqlalchemy import Column, String, DateTime, Integer, Float, Text, ForeignKey, Enum, Index, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum
from app.core.database import Base


# ─── Existing models (unchanged) ──────────────────────────────────────────────

class Workout(Base):
    __tablename__ = "workouts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    notes = Column(Text)
    duration_minutes = Column(Integer)
    workout_date = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="workouts")
    exercises = relationship("Exercise", back_populates="workout", cascade="all, delete-orphan")


class Exercise(Base):
    __tablename__ = "exercises"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workout_id = Column(String, ForeignKey("workouts.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    sets = Column(Integer)
    reps = Column(Integer)
    weight_kg = Column(Float)
    duration_seconds = Column(Integer)
    notes = Column(Text)
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    workout = relationship("Workout", back_populates="exercises")


# ─── Enums ────────────────────────────────────────────────────────────────────

class SessionStatusEnum(str, enum.Enum):
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


# ─── New models ───────────────────────────────────────────────────────────────

class WorkoutPlan(Base):
    __tablename__ = "workout_plans"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="workout_plans")
    plan_exercises = relationship("PlanExercise", back_populates="plan", cascade="all, delete-orphan")
    sessions = relationship("WorkoutSession", back_populates="plan")


class PlanExercise(Base):
    __tablename__ = "plan_exercises"

    plan_id = Column(String(36), ForeignKey("workout_plans.id", ondelete="CASCADE"), primary_key=True)
    exercise_name = Column(String(255), primary_key=True)
    sets = Column(Integer, nullable=True)
    reps = Column(Integer, nullable=True)
    weight_kg = Column(Float, nullable=True)
    order_index = Column(Integer, nullable=True)

    plan = relationship("WorkoutPlan", back_populates="plan_exercises")


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_id = Column(String(36), ForeignKey("workout_plans.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=True)
    status = Column(Enum(SessionStatusEnum), nullable=False, default=SessionStatusEnum.in_progress)
    notes = Column(Text, nullable=True)
    # Mood ratings 1-10 captured pre/post session (paper Table III)
    mood_before = Column(Integer, nullable=True)   # set at session start
    mood_after = Column(Integer, nullable=True)    # set at session completion
    started_at = Column(DateTime(timezone=True), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="workout_sessions")
    plan = relationship("WorkoutPlan", back_populates="sessions")
    session_exercises = relationship("SessionExercise", back_populates="session", cascade="all, delete-orphan")


class SessionExercise(Base):
    __tablename__ = "session_exercises"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), ForeignKey("workout_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    exercise_name = Column(String(255), nullable=False)
    category = Column(String(100), nullable=True)
    muscle_group = Column(String(100), nullable=True)
    order_index = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("WorkoutSession", back_populates="session_exercises")
    sets = relationship("ExerciseSet", back_populates="session_exercise", cascade="all, delete-orphan")


class ExerciseSet(Base):
    __tablename__ = "exercise_sets"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_exercise_id = Column(String(36), ForeignKey("session_exercises.id", ondelete="CASCADE"), nullable=False, index=True)
    set_number = Column(Integer, nullable=False)
    reps = Column(Integer, nullable=True)
    weight_kg = Column(Float, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    rest_seconds = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    # True only when the user explicitly logs this set (ticks ✓).
    # Plan-seeded placeholder rows start as False so the AI doesn't count them.
    is_logged = Column(Boolean, nullable=False, server_default="false", default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session_exercise = relationship("SessionExercise", back_populates="sets")

# ─── Exercise Catalog ─────────────────────────────────────────────────────────

\
class ExerciseCatalog(Base):
    __tablename__ = "exercise_catalog"

    __table_args__ = (
        Index("ix_exercise_catalog_category_muscle", "category", "muscle_group"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    name = Column(String(255), nullable=False, unique=True, index=True)

    category = Column(String(100), nullable=False, index=True)

    muscle_group = Column(String(100), nullable=False, index=True)

    equipment = Column(String(100), nullable=True)

    description = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

