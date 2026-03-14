
# backend/seed_exercises.py

import asyncio
import uuid
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select
from app.core.config import settings
from app.models.workout import ExerciseCatalog


engine = create_async_engine(settings.DATABASE_URL, echo=False)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


EXERCISES = [
    # ── Chest ────────────────────────────────────────────────────────────────
    ("Bench Press","strength","chest","barbell","Lie on bench, lower bar to chest, press up"),
    ("Incline Bench Press","strength","chest","barbell","Incline bench press targeting upper chest"),
    ("Decline Bench Press","strength","chest","barbell","Decline bench press targeting lower chest"),
    ("Dumbbell Flyes","strength","chest","dumbbell","Wide arc motion to stretch and squeeze chest"),
    ("Push Up","strength","chest","bodyweight","Classic push up targeting chest and triceps"),
    ("Cable Crossover","strength","chest","cable","Cable fly variation for chest isolation"),

    # ── Back ─────────────────────────────────────────────────────────────────
    ("Pull Up","strength","back","bodyweight","Hang from bar, pull chest to bar"),
    ("Barbell Row","strength","back","barbell","Hinge forward, row bar to lower chest"),
    ("Dumbbell Row","strength","back","dumbbell","Single arm row braced on bench"),
    ("Lat Pulldown","strength","back","cable","Pull bar down to upper chest"),
    ("Seated Cable Row","strength","back","cable","Sit upright, row cable to abdomen"),
    ("Deadlift","strength","back","barbell","Hip hinge to pull bar from floor"),
    ("Face Pull","strength","back","cable","Pull rope to face targeting rear delts"),

    # ── Shoulders ─────────────────────────────────────────────────────────────
    ("Overhead Press","strength","shoulders","barbell","Press bar from shoulders to overhead"),
    ("Dumbbell Shoulder Press","strength","shoulders","dumbbell","Press dumbbells overhead"),
    ("Lateral Raise","strength","shoulders","dumbbell","Raise dumbbells to sides"),
    ("Front Raise","strength","shoulders","dumbbell","Raise dumbbells forward"),
    ("Arnold Press","strength","shoulders","dumbbell","Rotating press for delts"),
    ("Upright Row","strength","shoulders","barbell","Pull bar to chin height"),

    # ── Biceps ───────────────────────────────────────────────────────────────
    ("Barbell Curl","strength","biceps","barbell","Curl bar from hips to shoulders"),
    ("Dumbbell Curl","strength","biceps","dumbbell","Alternating dumbbell curl"),
    ("Hammer Curl","strength","biceps","dumbbell","Neutral grip curl"),
    ("Preacher Curl","strength","biceps","barbell","Curl on preacher bench"),
    ("Concentration Curl","strength","biceps","dumbbell","Single arm strict curl"),

    # ── Triceps ───────────────────────────────────────────────────────────────
    ("Tricep Pushdown","strength","triceps","cable","Push cable bar down"),
    ("Skull Crusher","strength","triceps","barbell","Lower bar to forehead"),
    ("Overhead Tricep Extension","strength","triceps","dumbbell","Extend dumbbell overhead"),
    ("Close Grip Bench Press","strength","triceps","barbell","Narrow grip bench press"),
    ("Dips","strength","triceps","bodyweight","Parallel bar dips"),

    # ── Core ─────────────────────────────────────────────────────────────────
    ("Plank","strength","core","bodyweight","Hold straight body position"),
    ("Crunch","strength","core","bodyweight","Curl shoulders toward knees"),
    ("Leg Raise","strength","core","bodyweight","Raise straight legs"),
    ("Russian Twist","strength","core","bodyweight","Rotate torso seated"),
    ("Ab Wheel Rollout","strength","core","ab wheel","Roll wheel forward"),
    ("Cable Crunch","strength","core","cable","Kneel and crunch cable"),

    # ── Quadriceps ────────────────────────────────────────────────────────────
    ("Squat","strength","quadriceps","barbell","Back squat"),
    ("Leg Press","strength","quadriceps","machine","Press platform"),
    ("Lunges","strength","quadriceps","bodyweight","Step forward lunge"),
    ("Leg Extension","strength","quadriceps","machine","Extend legs"),
    ("Hack Squat","strength","quadriceps","machine","Machine squat"),
    ("Bulgarian Split Squat","strength","quadriceps","dumbbell","Rear foot elevated squat"),

    # ── Hamstrings ────────────────────────────────────────────────────────────
    ("Romanian Deadlift","strength","hamstrings","barbell","Hip hinge RDL"),
    ("Leg Curl","strength","hamstrings","machine","Leg curl machine"),
    ("Good Morning","strength","hamstrings","barbell","Bar on back hinge"),
    ("Glute Ham Raise","strength","hamstrings","bodyweight","GHR machine"),

    # ── Glutes ────────────────────────────────────────────────────────────────
    ("Hip Thrust","strength","glutes","barbell","Drive hips up"),
    ("Glute Bridge","strength","glutes","bodyweight","Bridge from floor"),
    ("Cable Kickback","strength","glutes","cable","Kick leg back"),

    # ── Calves ────────────────────────────────────────────────────────────────
    ("Standing Calf Raise","strength","calves","machine","Raise heels"),
    ("Seated Calf Raise","strength","calves","machine","Seated calf raise"),

    # ── Cardio ────────────────────────────────────────────────────────────────
    ("Treadmill Run","cardio","cardio","treadmill","Run on treadmill"),
    ("Cycling","cardio","cardio","bike","Stationary cycling"),
    ("Jump Rope","cardio","cardio","jump rope","Continuous rope jumping"),
    ("Rowing Machine","cardio","cardio","rower","Rowing machine cardio"),
]


async def seed():

    async with AsyncSessionLocal() as db:

        result = await db.execute(select(ExerciseCatalog.id).limit(1))

        if result.scalar_one_or_none():
            print("✓ Exercise catalog already seeded, skipping.")
            return

        rows = [
            ExerciseCatalog(
                id=str(uuid.uuid4()),
                name=name,
                category=category,
                muscle_group=muscle_group,
                equipment=equipment,
                description=description,
            )
            for name, category, muscle_group, equipment, description in EXERCISES
        ]

        db.add_all(rows)

        await db.commit()

        print(f"✓ Seeded {len(rows)} exercises into exercise_catalog.")


if __name__ == "__main__":
    asyncio.run(seed())
