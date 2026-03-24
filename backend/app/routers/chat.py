from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, asc
import json

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, Profile
from app.models.memory import Conversation, Message, MessageRoleEnum, MemoryFact
from app.schemas.chat import ChatMessageRequest, ChatHistoryResponse, MessageOut
from app.services.llm_service import stream_chat_response
from app.services.memory_service import process_message_for_memory, get_relevant_memories
from app.services.metrics_service import get_metrics_summary

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
      - profile   : user's profile fields from Postgres
      - stats     : last-30-day metrics summary from Postgres
      - memories  : top-5 semantically relevant facts from ChromaDB

    Every section is individually try/catch-ed so a failure in one
    (e.g. ChromaDB is down) never blocks the chat response.
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

    # ── Stats (last 30 days) ──────────────────────────────────────────────────
    try:
        summary = await get_metrics_summary(db=db, user_id=user_id)

        # Map MetricsSummary fields → the shape system_prompt._stats_section() expects
        context["stats"] = {
            "aggregations": {
                "avg_steps":           summary.avg_steps,
                "avg_calories_burned": summary.avg_calories_burned,
                "avg_sleep_hours":     summary.avg_sleep_hours,
                "avg_water_ml":        summary.total_water_ml,       # total → used as proxy
                "avg_resting_hr":      summary.avg_resting_heart_rate,
                "workout_count":       summary.workout_count,
                "current_streak":      summary.current_streak,
                "longest_streak":      summary.longest_streak,
            },
            "latest_body": {
                "weight_kg":    summary.latest_weight_kg,
                "body_fat_pct": summary.latest_body_fat_pct,
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
    """
    Send a message and stream the AI response back.

    Flow:
      1. Get or create conversation
      2. Save user message to DB
      3. Schedule memory extraction as background task
      4. Build context (profile + stats + memories) — NEW in Day 8
      5. Fetch recent conversation history
      6. Stream Gemini response with full context injected
      7. Save assistant message to DB
    """
    convo = await _get_or_create_conversation(
        user_id=current_user.id,
        conversation_id=body.conversation_id,
        db=db,
    )

    # Save user message
    user_msg = Message(
        conversation_id=convo.id,
        role=MessageRoleEnum.user,
        content=body.message,
    )
    db.add(user_msg)
    await db.flush()

    # Capture values before they go out of scope in the async generator
    user_msg_id = str(user_msg.id)
    user_id = str(current_user.id)
    msg_text = body.message

    # Schedule memory extraction — runs after the response is fully sent
    async def _run_memory_extraction():
        async for session in get_db():
            await process_message_for_memory(
                user_id=user_id,
                user_message=msg_text,
                db=session,
                source_message_id=user_msg_id,
            )

    background_tasks.add_task(_run_memory_extraction)

    # Build context package for this message — NEW in Day 8
    context = await _build_context(
        user_id=user_id,
        user_message=msg_text,
        db=db,
    )

    # Get conversation history (excludes message we just saved)
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
                context=context,          # ← injected here
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
    """
    Returns the most recent conversation and all its messages.
    Frontend calls this on page load to restore chat state.
    """
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
    """
    Returns all active memory facts the AI has stored about this user.
    Useful for the frontend to show 'what does the AI know about me'.

    Optional ?category= filter (goal, preference, habit, limitation,
                                achievement, personal, other)
    """
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