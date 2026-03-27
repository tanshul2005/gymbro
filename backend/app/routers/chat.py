from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, asc, desc, and_
from datetime import date, datetime
import json

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, Profile
from app.models.memory import Conversation, Message, MessageRoleEnum, MemoryFact
from app.models.workout import WorkoutSession, SessionStatusEnum, SessionExercise, ExerciseSet
from app.models.metrics import DailyMetrics, BodyMeasurement
from app.schemas.chat import ChatMessageRequest, ChatHistoryResponse, MessageOut
from app.services.llm_service import stream_chat_response
from app.services.memory_service import process_message_for_memory, get_relevant_memories
from app.services.metrics_service import get_metrics_summary
from app.services.embedding_service import _get_chroma_collections

router = APIRouter(prefix="/chat", tags=["chat"])

HISTORY_CONTEXT_LIMIT = 20  # last N messages sent to Gemini as context


# ─── Context Builder ──────────────────────────────────────────────────────────

async def _build_context(
    user_id: str,
    user_message: str,
    db: AsyncSession,
) -> dict:
    """
    Assemble the full context package injected into the system prompt:
      - profile        : user's profile fields from Postgres
      - today          : today's metrics + workout session from Postgres  ← NEW
      - stats          : last-30-day metrics summary from Postgres
      - memories       : top-5 semantically relevant facts from ChromaDB
      - weekly_summary : most recent weekly narrative from ChromaDB

    Every section is individually try/catch-ed so a failure in one
    never blocks the chat response.
    """
    context = {}

    # ── Profile ──────────────────────────────────────────────────────────────
    try:
        result = await db.execute(
            select(Profile).where(Profile.user_id == user_id)
        )
        profile = result.scalar_one_or_none()

        if profile:
            context["profile"] = {
                "full_name":      profile.full_name,
                "age":            profile.age,
                "gender":         profile.gender.value if profile.gender else None,
                "height_cm":      profile.height_cm,
                "weight_kg":      profile.weight_kg,
                "fitness_goal":   profile.fitness_goal,
                "activity_level": profile.activity_level.value if profile.activity_level else None,
            }
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Context: profile fetch failed: {e}")

    # ── Today's Activity ──────────────────────────────────────────────────────
    try:
        today = date.today()
        today_data = {}

        # Today's daily metrics row
        metrics_result = await db.execute(
            select(DailyMetrics).where(
                and_(
                    DailyMetrics.user_id == user_id,
                    DailyMetrics.date == today,
                )
            )
        )
        today_metrics = metrics_result.scalar_one_or_none()

        if today_metrics:
            today_data["metrics"] = {
                "steps":              today_metrics.steps,
                "calories_burned":    today_metrics.calories_burned,
                "calories_consumed":  today_metrics.calories_consumed,
                "sleep_hours":        today_metrics.sleep_hours,
                "water_ml":           today_metrics.water_ml,
                "resting_heart_rate": today_metrics.resting_heart_rate,
                "notes":              today_metrics.notes,
            }

        # Today's body measurement snapshot
        body_result = await db.execute(
            select(BodyMeasurement).where(
                and_(
                    BodyMeasurement.user_id == user_id,
                    BodyMeasurement.date == today,
                )
            )
        )
        today_body = body_result.scalar_one_or_none()
        if today_body:
            today_data["body"] = {
                "weight_kg":      today_body.weight_kg,
                "body_fat_pct":   today_body.body_fat_pct,
                "muscle_mass_kg": today_body.muscle_mass_kg,
                "chest_cm":       today_body.chest_cm,
                "waist_cm":       today_body.waist_cm,
                "hips_cm":        today_body.hips_cm,
            }

        # Today's most recent workout session (completed or in-progress)
        today_start_dt = datetime.combine(today, datetime.min.time())
        today_end_dt   = datetime.combine(today, datetime.max.time())

        session_result = await db.execute(
            select(WorkoutSession)
            .where(
                and_(
                    WorkoutSession.user_id == user_id,
                    WorkoutSession.started_at >= today_start_dt,
                    WorkoutSession.started_at <= today_end_dt,
                )
            )
            .order_by(desc(WorkoutSession.started_at))
            .limit(1)
        )
        today_session = session_result.scalar_one_or_none()

        if today_session:
            ex_result = await db.execute(
                select(SessionExercise)
                .where(SessionExercise.session_id == today_session.id)
                .order_by(SessionExercise.order_index)
            )
            session_exercises = ex_result.scalars().all()

            exercises_detail = []
            for se in session_exercises:
                sets_result = await db.execute(
                    select(ExerciseSet)
                    .where(
                        ExerciseSet.session_exercise_id == se.id,
                        ExerciseSet.is_logged == True,   # noqa: E712 — only count actually-performed sets
                    )
                    .order_by(ExerciseSet.set_number)
                )
                sets = sets_result.scalars().all()
                exercises_detail.append({
                    "name": se.exercise_name,
                    "sets": [
                        {
                            "set":        s.set_number,
                            "reps":       s.reps,
                            "weight_kg":  s.weight_kg,
                            "rest_secs":  s.rest_seconds,
                        }
                        for s in sets
                    ],
                })

            today_data["workout_session"] = {
                "name":           today_session.name or "Workout",
                "status":         today_session.status.value,
                "duration_mins":  today_session.duration_minutes,
                "exercise_count": len(session_exercises),
                "exercises":      exercises_detail,
                "mood_before":    today_session.mood_before,
                "mood_after":     today_session.mood_after,
            }

        context["today"] = today_data

    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Context: today fetch failed: {e}")

    # ── Recent Sessions (last 7 days) — for "what did I do this week" questions ─
    try:
        from datetime import timedelta
        week_ago = datetime.combine(date.today() - timedelta(days=7), datetime.min.time())

        recent_result = await db.execute(
            select(WorkoutSession)
            .where(
                and_(
                    WorkoutSession.user_id == user_id,
                    WorkoutSession.started_at >= week_ago,
                    WorkoutSession.status == SessionStatusEnum.completed,
                )
            )
            .order_by(desc(WorkoutSession.started_at))
            .limit(10)
        )
        recent_sessions = recent_result.scalars().all()

        sessions_data = []
        for ws in recent_sessions:
            ex_result = await db.execute(
                select(SessionExercise)
                .where(SessionExercise.session_id == ws.id)
                .order_by(SessionExercise.order_index)
            )
            session_exs = ex_result.scalars().all()

            exercises_detail = []
            for se in session_exs:
                sets_result = await db.execute(
                    select(ExerciseSet)
                    .where(
                        ExerciseSet.session_exercise_id == se.id,
                        ExerciseSet.is_logged == True,  # noqa: E712
                    )
                    .order_by(ExerciseSet.set_number)
                )
                sets = sets_result.scalars().all()
                exercises_detail.append({
                    "name": se.exercise_name,
                    "muscle_group": se.muscle_group,
                    "sets": [
                        {
                            "set": s.set_number,
                            "reps": s.reps,
                            "weight_kg": s.weight_kg,
                            "rest_secs": s.rest_seconds,
                        }
                        for s in sets
                    ],
                })

            sessions_data.append({
                "date": ws.started_at.date().isoformat() if ws.started_at else None,
                "name": ws.name or "Workout",
                "duration_mins": ws.duration_minutes,
                "mood_before": ws.mood_before,
                "mood_after": ws.mood_after,
                "exercise_count": len(session_exs),
                "exercises": exercises_detail,
            })

        context["recent_sessions"] = sessions_data

    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Context: recent sessions fetch failed: {e}")

    # ── Stats (last 30 days) ──────────────────────────────────────────────────
    try:
        summary = await get_metrics_summary(db=db, user_id=user_id)

        context["stats"] = {
            "aggregations": {
                "avg_steps":              summary.avg_steps,
                "avg_calories_burned":    summary.avg_calories_burned,
                "avg_calories_consumed":  summary.avg_calories_consumed,
                "avg_sleep_hours":        summary.avg_sleep_hours,
                "avg_water_ml":           summary.total_water_ml,
                "avg_resting_hr":         summary.avg_resting_heart_rate,
                "workout_count":          summary.workout_count,
                "current_streak":         summary.current_streak,
                "longest_streak":         summary.longest_streak,
                "days_logged":            summary.days_logged,
                "weight_change_kg":       summary.weight_change_kg,
            },
            "latest_body": {
                "weight_kg":      summary.latest_weight_kg,
                "body_fat_pct":   summary.latest_body_fat_pct,
                "muscle_mass_kg": getattr(summary, "latest_muscle_mass_kg", None),
            },
        }
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Context: stats fetch failed: {e}")

    # ── Memories (ChromaDB semantic retrieval) ────────────────────────────────
    try:
        memories = await get_relevant_memories(
            user_id=user_id,
            query=user_message,
            top_k=5,
        )
        context["memories"] = memories
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Context: memory retrieval failed: {e}")

    # ── Weekly Summary (most recent — ChromaDB summaries collection) ──────────
    try:
        _, summaries_col = _get_chroma_collections()
        results = summaries_col.get(
            where={"user_id": user_id},
            include=["metadatas", "documents"],
        )
        if results["ids"]:
            items = list(zip(results["metadatas"], results["documents"]))
            items.sort(key=lambda x: x[0].get("timestamp", 0), reverse=True)
            latest_meta, latest_doc = items[0]

            # Also try to pull structured fields from Postgres for richer context
            try:
                from app.models.memory import ConversationSummary
                from sqlalchemy import desc as sa_desc
                import json as _json

                cs_result = await db.execute(
                    select(ConversationSummary)
                    .where(ConversationSummary.user_id == user_id)
                    .order_by(sa_desc(ConversationSummary.week_start))
                    .limit(1)
                )
                cs = cs_result.scalar_one_or_none()
                if cs and cs.summary:
                    structured = _json.loads(cs.summary)
                    context["weekly_summary"] = {
                        "narrative":       structured.get("narrative", latest_doc),
                        "activity_score":  structured.get("activity_score", latest_meta.get("activity_score")),
                        "highlights":      structured.get("highlights", []),
                        "concerns":        structured.get("concerns", []),
                        "trends":          structured.get("trends", []),
                        "focus_next_week": structured.get("focus_next_week", []),
                    }
                else:
                    context["weekly_summary"] = {
                        "narrative":      latest_doc,
                        "activity_score": latest_meta.get("activity_score"),
                    }
            except Exception:
                context["weekly_summary"] = {
                    "narrative":      latest_doc,
                    "activity_score": latest_meta.get("activity_score"),
                }

    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Context: weekly summary retrieval failed: {e}")

    return context


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _get_or_create_conversation(
    user_id: str,
    conversation_id: str | None,
    db: AsyncSession,
) -> Conversation:
    if conversation_id:
        result = await db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == user_id,
            )
        )
        convo = result.scalar_one_or_none()
        if not convo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found",
            )
        return convo

    convo = Conversation(user_id=user_id)
    db.add(convo)
    await db.flush()
    return convo


async def _get_recent_messages(
    conversation_id: str,
    db: AsyncSession,
    limit: int = HISTORY_CONTEXT_LIMIT,
) -> list[dict]:
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(asc(Message.created_at))
        .limit(limit)
    )
    messages = result.scalars().all()
    return [{"role": msg.role.value, "content": msg.content} for msg in messages]


# ─── POST /chat/message ───────────────────────────────────────────────────────

@router.post("/message")
async def send_message(
    body: ChatMessageRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    convo = await _get_or_create_conversation(
        user_id=current_user.id,
        conversation_id=body.conversation_id,
        db=db,
    )

    user_msg = Message(
        conversation_id=convo.id,
        role=MessageRoleEnum.user,
        content=body.message,
    )
    db.add(user_msg)
    await db.flush()

    user_msg_id = str(user_msg.id)
    user_id     = str(current_user.id)
    msg_text    = body.message

    async def _run_memory_extraction():
        async for session in get_db():
            await process_message_for_memory(
                user_id=user_id,
                user_message=msg_text,
                db=session,
                source_message_id=user_msg_id,
            )

    background_tasks.add_task(_run_memory_extraction)

    context = await _build_context(
        user_id=user_id,
        user_message=msg_text,
        db=db,
    )

    history = await _get_recent_messages(convo.id, db, limit=HISTORY_CONTEXT_LIMIT)
    if history and history[-1]["role"] == "user":
        history = history[:-1]

    async def generate():
        full_response = []

        try:
            yield f"data: {json.dumps({'type': 'meta', 'conversation_id': convo.id})}\n\n"

            async for chunk in stream_chat_response(
                user_message=msg_text,
                conversation_history=history,
                context=context,
            ):
                full_response.append(chunk)
                yield f"data: {json.dumps({'type': 'chunk', 'text': chunk})}\n\n"

            assistant_content = "".join(full_response)
            assistant_msg = Message(
                conversation_id=convo.id,
                role=MessageRoleEnum.assistant,
                content=assistant_content,
            )
            db.add(assistant_msg)
            await db.commit()

            yield f"data: {json.dumps({'type': 'done', 'message_id': str(assistant_msg.id)})}\n\n"

        except Exception as e:
            await db.rollback()
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ─── GET /chat/history ────────────────────────────────────────────────────────

@router.get("/history", response_model=ChatHistoryResponse)
async def get_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
        .limit(1)
    )
    convo = result.scalar_one_or_none()

    if not convo:
        return ChatHistoryResponse(conversation_id=None, messages=[])

    msg_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == convo.id)
        .order_by(asc(Message.created_at))
    )
    messages = msg_result.scalars().all()

    return ChatHistoryResponse(
        conversation_id=convo.id,
        messages=[MessageOut.model_validate(m) for m in messages],
    )


# ─── GET /chat/memories ───────────────────────────────────────────────────────

@router.get("/memories")
async def get_chat_memories(
    category: str | None = Query(default=None, description="Filter by category"),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(MemoryFact).where(
        MemoryFact.user_id == current_user.id,
        MemoryFact.is_active == True,
    )

    if category:
        query = query.where(MemoryFact.category == category)

    query = query.order_by(MemoryFact.created_at.desc()).limit(limit)

    result = await db.execute(query)
    facts = result.scalars().all()

    return {
        "total": len(facts),
        "facts": [
            {
                "id":         str(f.id),
                "category":   f.category.value,
                "fact":       f.fact,
                "confidence": f.confidence,
                "created_at": f.created_at.isoformat() if f.created_at else None,
            }
            for f in facts
        ],
    }