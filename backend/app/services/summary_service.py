"""
summary_service.py

Weekly summary pipeline — generates a structured weekly reflection for a user.

Flow:
  1. Fetch week's conversations, metrics, body data, memory facts  (Postgres)
  2. Fetch last 4 weekly narratives  (ChromaDB)
  3. Minimum-activity guard — skip if nothing happened
  4. Build prompt → call Gemini (non-streaming)
  5. Parse JSON response
  6. Store structured record → conversation_summaries  (Postgres)
  7. Embed narrative → upsert in ChromaDB `summaries` collection
  8. Return parsed summary dict to caller
"""

import json
import logging
from datetime import date, datetime, timezone, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from google import genai
from google.genai import types

from app.core.config import settings
from app.models.memory import Conversation, Message, MemoryFact, ConversationSummary
from app.models.metrics import DailyMetrics, BodyMeasurement
from app.models.workout import WorkoutSession, SessionStatusEnum, SessionExercise, ExerciseSet
from app.prompts.summary_prompt import SUMMARY_SYSTEM_PROMPT, build_summary_prompt
from app.services.embedding_service import _get_chroma_collections, embed_text

logger = logging.getLogger(__name__)

_client = genai.Client(api_key=settings.GEMINI_API_KEY)
MODEL_NAME = "gemini-2.0-flash"

# Minimum activity to bother generating a summary
_MIN_MESSAGES = 1
_MIN_METRIC_ROWS = 0  # even 0 metric rows is fine if there are conversations


# ─── Data Fetching ────────────────────────────────────────────────────────────

async def _fetch_week_conversations(
    user_id: str,
    week_start: date,
    week_end: date,
    db: AsyncSession,
) -> list[dict]:
    """
    Return conversations (with messages) that were active during the week.
    Groups messages by conversation, ordered chronologically.
    """
    week_start_dt = datetime.combine(week_start, datetime.min.time()).replace(tzinfo=timezone.utc)
    week_end_dt = datetime.combine(week_end, datetime.max.time()).replace(tzinfo=timezone.utc)

    result = await db.execute(
        select(Conversation).where(
            Conversation.user_id == user_id,
            Conversation.updated_at >= week_start_dt,
            Conversation.updated_at <= week_end_dt,
        )
    )
    convos = result.scalars().all()

    output = []
    for convo in convos:
        msg_result = await db.execute(
            select(Message)
            .where(
                Message.conversation_id == convo.id,
                Message.created_at >= week_start_dt,
                Message.created_at <= week_end_dt,
            )
            .order_by(Message.created_at)
            .limit(40)   # cap per-conversation to keep prompt manageable
        )
        messages = msg_result.scalars().all()
        if messages:
            output.append({
                "date": convo.updated_at.date().isoformat() if convo.updated_at else str(week_start),
                "messages": [{"role": m.role.value, "content": m.content} for m in messages],
            })
    return output


async def _fetch_week_metrics(
    user_id: str,
    week_start: date,
    week_end: date,
    db: AsyncSession,
) -> tuple[list[dict], list[dict]]:
    """Return (daily_metrics_rows, body_measurement_rows) for the week."""
    dm_result = await db.execute(
        select(DailyMetrics).where(
            DailyMetrics.user_id == user_id,
            DailyMetrics.date >= week_start,
            DailyMetrics.date <= week_end,
        ).order_by(DailyMetrics.date)
    )
    daily = [
        {
            "date": row.date.isoformat(),
            "steps": row.steps,
            "calories_burned": row.calories_burned,
            "calories_consumed": row.calories_consumed,
            "sleep_hours": row.sleep_hours,
            "water_ml": row.water_ml,
            "resting_heart_rate": row.resting_heart_rate,
        }
        for row in dm_result.scalars().all()
    ]

    bm_result = await db.execute(
        select(BodyMeasurement).where(
            BodyMeasurement.user_id == user_id,
            BodyMeasurement.date >= week_start,
            BodyMeasurement.date <= week_end,
        ).order_by(BodyMeasurement.date)
    )
    body = [
        {
            "date": row.date.isoformat(),
            "weight_kg": row.weight_kg,
            "body_fat_pct": row.body_fat_pct,
            "muscle_mass_kg": row.muscle_mass_kg,
        }
        for row in bm_result.scalars().all()
    ]

    return daily, body


async def _fetch_memory_facts(user_id: str, db: AsyncSession) -> list[dict]:
    """Return the user's 20 most recent active memory facts."""
    result = await db.execute(
        select(MemoryFact)
        .where(MemoryFact.user_id == user_id, MemoryFact.is_active == True)
        .order_by(MemoryFact.updated_at.desc())
        .limit(20)
    )
    return [
        {"category": f.category.value, "fact": f.fact}
        for f in result.scalars().all()
    ]


async def _fetch_week_mood(
    user_id: str,
    week_start: date,
    week_end: date,
    db: AsyncSession,
) -> dict | None:
    """
    Aggregate mood_before / mood_after from completed workout sessions this week.
    Returns a dict with per-session mood pairs and computed averages/min,
    or None if no sessions with mood data exist.
    """
    week_start_dt = datetime.combine(week_start, datetime.min.time()).replace(tzinfo=timezone.utc)
    week_end_dt   = datetime.combine(week_end,   datetime.max.time()).replace(tzinfo=timezone.utc)

    result = await db.execute(
        select(WorkoutSession).where(
            WorkoutSession.user_id   == user_id,
            WorkoutSession.status    == SessionStatusEnum.completed,
            WorkoutSession.started_at >= week_start_dt,
            WorkoutSession.started_at <= week_end_dt,
        ).order_by(WorkoutSession.started_at)
    )
    sessions = result.scalars().all()

    sessions_mood = []
    all_before, all_after = [], []

    for s in sessions:
        entry = {
            "date": s.started_at.date().isoformat() if s.started_at else None,
            "name": s.name or "Workout",
        }
        if s.mood_before is not None:
            entry["mood_before"] = s.mood_before
            all_before.append(s.mood_before)
        if s.mood_after is not None:
            entry["mood_after"] = s.mood_after
            all_after.append(s.mood_after)
        if "mood_before" in entry or "mood_after" in entry:
            sessions_mood.append(entry)

    if not sessions_mood:
        return None

    def _avg(vals: list[int]) -> float | None:
        return round(sum(vals) / len(vals), 1) if vals else None

    return {
        "sessions": sessions_mood,
        "avg_mood_before": _avg(all_before),
        "avg_mood_after":  _avg(all_after),
        "min_mood_before": min(all_before) if all_before else None,
        "min_mood_after":  min(all_after)  if all_after  else None,
        "sessions_with_mood": len(sessions_mood),
    }


async def _fetch_week_sessions(
    user_id: str,
    week_start: date,
    week_end: date,
    db: AsyncSession,
) -> list[dict]:
    """
    Fetch all completed workout sessions for the week with full exercise/set detail.
    Returns a structured log for PR detection, volume analysis, and narrative generation.
    """
    week_start_dt = datetime.combine(week_start, datetime.min.time()).replace(tzinfo=timezone.utc)
    week_end_dt   = datetime.combine(week_end,   datetime.max.time()).replace(tzinfo=timezone.utc)

    result = await db.execute(
        select(WorkoutSession).where(
            WorkoutSession.user_id    == user_id,
            WorkoutSession.status     == SessionStatusEnum.completed,
            WorkoutSession.started_at >= week_start_dt,
            WorkoutSession.started_at <= week_end_dt,
        ).order_by(WorkoutSession.started_at)
    )
    sessions = result.scalars().all()
    output = []

    for session in sessions:
        ex_result = await db.execute(
            select(SessionExercise)
            .where(SessionExercise.session_id == session.id)
            .order_by(SessionExercise.order_index)
        )
        exercises = ex_result.scalars().all()

        exercises_out = []
        for ex in exercises:
            sets_result = await db.execute(
                select(ExerciseSet).where(
                    ExerciseSet.session_exercise_id == ex.id,
                    ExerciseSet.is_logged == True,   # noqa: E712
                ).order_by(ExerciseSet.set_number)
            )
            sets = sets_result.scalars().all()
            exercises_out.append({
                "name": ex.exercise_name,
                "sets": [
                    {
                        "set":       s.set_number,
                        "reps":      s.reps,
                        "weight_kg": s.weight_kg,
                        "rest_secs": s.rest_seconds,
                    }
                    for s in sets
                ],
            })

        output.append({
            "date":          session.started_at.date().isoformat() if session.started_at else None,
            "name":          session.name or "Workout",
            "duration_mins": session.duration_minutes,
            "exercises":     exercises_out,
        })

    return output


def _fetch_previous_summaries(user_id: str, n: int = 4) -> list[str]:
    """
    Retrieve the last `n` weekly summary narratives from ChromaDB for trend analysis.
    Returns [] on any failure — never blocks the pipeline.
    """
    try:
        _, summaries_col = _get_chroma_collections()

        results = summaries_col.get(
            where={"user_id": user_id},
            include=["metadatas", "documents"],
        )

        if not results["ids"]:
            return []

        # Sort by timestamp descending, take last n
        items = list(zip(
            results["ids"],
            results["metadatas"],
            results["documents"],
        ))
        items.sort(key=lambda x: x[1].get("timestamp", 0), reverse=True)
        recent = items[:n]

        return [doc for _, _, doc in recent]

    except Exception as e:
        logger.error(f"_fetch_previous_summaries failed for user {user_id}: {e}")
        return []


# ─── Activity Guard ───────────────────────────────────────────────────────────

def _has_minimum_activity(
    conversations: list[dict],
    daily_metrics: list[dict],
) -> bool:
    """
    Returns True if there is enough activity to warrant a summary.
    Requires at least 1 message OR at least 1 day of metrics.
    """
    total_messages = sum(len(c["messages"]) for c in conversations)
    return total_messages >= _MIN_MESSAGES or len(daily_metrics) > _MIN_METRIC_ROWS


# ─── Gemini Call ──────────────────────────────────────────────────────────────

async def _call_gemini_for_summary(prompt: str) -> dict:
    """
    Send the assembled week data to Gemini and parse the JSON response.
    Raises on failure — callers should catch.
    """
    response = await _client.aio.models.generate_content(
        model=MODEL_NAME,
        contents=[{"role": "user", "parts": [{"text": prompt}]}],
        config=types.GenerateContentConfig(
            system_instruction=SUMMARY_SYSTEM_PROMPT,
            temperature=0.4,
        ),
    )

    raw = response.text.strip()

    # Strip markdown code fences if the model wraps in them anyway
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    parsed = json.loads(raw)

    if "error" in parsed:
        raise ValueError(f"Gemini returned error: {parsed['error']}")

    return parsed


# ─── Storage ──────────────────────────────────────────────────────────────────

async def _store_in_postgres(
    user_id: str,
    week_start: date,
    week_end: date,
    summary_dict: dict,
    db: AsyncSession,
) -> ConversationSummary:
    """
    Upsert the weekly summary into the conversation_summaries table.
    Stores the full JSON blob in the `summary` column.
    """
    week_start_dt = datetime.combine(week_start, datetime.min.time()).replace(tzinfo=timezone.utc)
    week_end_dt = datetime.combine(week_end, datetime.max.time()).replace(tzinfo=timezone.utc)

    # Check if a summary already exists for this user + week
    existing = await db.execute(
        select(ConversationSummary).where(
            ConversationSummary.user_id == user_id,
            ConversationSummary.week_start == week_start_dt,
        )
    )
    record = existing.scalar_one_or_none()

    summary_json = json.dumps(summary_dict)

    if record:
        record.summary = summary_json
        record.week_end = week_end_dt
    else:
        record = ConversationSummary(
            user_id=user_id,
            conversation_id=None,   # weekly summaries are not tied to a single conversation
            summary=summary_json,
            week_start=week_start_dt,
            week_end=week_end_dt,
        )
        db.add(record)

    await db.commit()
    await db.refresh(record)
    logger.info(f"Weekly summary stored in Postgres for user {user_id} [{week_start} → {week_end}]")
    return record


async def _store_in_chromadb(
    record_id: str,
    user_id: str,
    narrative: str,
    week_start: date,
    activity_score: int,
) -> None:
    """
    Embed the narrative and upsert into the ChromaDB `summaries` collection.
    Failure is logged but never raises — ChromaDB is best-effort.
    """
    try:
        _, summaries_col = _get_chroma_collections()
        vector = await embed_text(narrative)
        ts = datetime.combine(week_start, datetime.min.time()).replace(tzinfo=timezone.utc).timestamp()

        summaries_col.upsert(
            ids=[record_id],
            embeddings=[vector],
            metadatas=[{
                "user_id": user_id,
                "week_start_ts": ts,
                "activity_score": activity_score,
                "timestamp": ts,
            }],
            documents=[narrative],
        )
        logger.debug(f"Weekly summary narrative embedded in ChromaDB [{record_id}]")
    except Exception as e:
        logger.error(f"ChromaDB summary storage failed for user {user_id}: {e}")


# ─── Main Entry Point ─────────────────────────────────────────────────────────

async def generate_weekly_summary(
    user_id: str,
    week_start: date,
    week_end: date,
    db: AsyncSession,
) -> dict | None:
    """
    Full weekly summary pipeline for a single user.

    Returns the parsed summary dict on success, None if below activity threshold.
    Raises on unexpected errors — callers (scheduler + router) should catch.
    """
    logger.info(f"Generating weekly summary for user {user_id} [{week_start} → {week_end}]")

    # 1. Fetch data
    conversations = await _fetch_week_conversations(user_id, week_start, week_end, db)
    daily_metrics, body_measurements = await _fetch_week_metrics(user_id, week_start, week_end, db)
    memory_facts = await _fetch_memory_facts(user_id, db)
    week_mood = await _fetch_week_mood(user_id, week_start, week_end, db)
    week_sessions = await _fetch_week_sessions(user_id, week_start, week_end, db)

    # 2. Activity guard
    if not _has_minimum_activity(conversations, daily_metrics):
        logger.info(f"Skipping summary for user {user_id} — insufficient activity this week")
        return None

    # 3. Previous summaries for trend analysis
    previous_summaries = _fetch_previous_summaries(user_id, n=4)

    # 4. Build prompt
    prompt = build_summary_prompt(
        week_start=week_start,
        week_end=week_end,
        conversations=conversations,
        daily_metrics=daily_metrics,
        body_measurements=body_measurements,
        memory_facts=memory_facts,
        previous_summaries=previous_summaries,
        week_mood=week_mood,
        week_sessions=week_sessions,
    )

    # 5. Call Gemini
    summary_dict = await _call_gemini_for_summary(prompt)
    logger.info(
        f"Summary generated for user {user_id}: "
        f"activity_score={summary_dict.get('activity_score')}, "
        f"highlights={len(summary_dict.get('highlights', []))}"
    )

    # 6. Store in Postgres
    record = await _store_in_postgres(
        user_id=user_id,
        week_start=week_start,
        week_end=week_end,
        summary_dict=summary_dict,
        db=db,
    )

    # 7. Embed narrative in ChromaDB
    narrative = summary_dict.get("narrative", "")
    if narrative:
        await _store_in_chromadb(
            record_id=str(record.id),
            user_id=user_id,
            narrative=narrative,
            week_start=week_start,
            activity_score=summary_dict.get("activity_score", 0),
        )

    return summary_dict


# ─── Week Helpers ─────────────────────────────────────────────────────────────

def get_week_bounds(offset: int = 0) -> tuple[date, date]:
    """
    Return (week_start, week_end) for the ISO week shifted by `offset` weeks.
    offset=0  → current week (Mon–Sun)
    offset=1  → last week
    """
    today = date.today()
    # ISO weekday: Monday=1, Sunday=7
    monday = today - timedelta(days=today.weekday())       # this week's Monday
    week_start = monday - timedelta(weeks=offset)
    week_end = week_start + timedelta(days=6)              # Sunday
    return week_start, week_end
