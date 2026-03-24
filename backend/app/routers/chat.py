from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, asc
import json

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.memory import Conversation, Message, MessageRoleEnum
from app.schemas.chat import ChatMessageRequest, ChatHistoryResponse, MessageOut
from app.services.llm_service import stream_chat_response

router = APIRouter(prefix="/chat", tags=["chat"])

HISTORY_CONTEXT_LIMIT = 20  # last N messages sent to Gemini as context


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _get_or_create_conversation(
    user_id: str,
    conversation_id: str | None,
    db: AsyncSession,
) -> Conversation:
    """Return existing conversation or create a new one."""
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

    # Create a new conversation
    convo = Conversation(user_id=user_id)
    db.add(convo)
    await db.flush()  # get the ID without committing yet
    return convo


async def _get_recent_messages(
    conversation_id: str,
    db: AsyncSession,
    limit: int = HISTORY_CONTEXT_LIMIT,
) -> list[dict]:
    """Fetch last N messages as plain dicts for Gemini context."""
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Send a message and stream the AI response back.

    Flow:
      1. Get or create conversation
      2. Save user message to DB
      3. Fetch recent history for context
      4. Stream Gemini response, collecting full text
      5. Save assistant message to DB
      6. Commit and stream response to client
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

    # Get context history (excludes the message we just saved)
    history = await _get_recent_messages(convo.id, db, limit=HISTORY_CONTEXT_LIMIT)
    # Remove the last entry — it's the user message we just added,
    # and stream_chat_response expects history BEFORE the current message
    if history and history[-1]["role"] == "user":
        history = history[:-1]

    async def generate():
        full_response = []

        try:
            # Stream first — yield metadata so frontend knows the conversation_id
            yield f"data: {json.dumps({'type': 'meta', 'conversation_id': convo.id})}\n\n"

            async for chunk in stream_chat_response(body.message, history):
                full_response.append(chunk)
                yield f"data: {json.dumps({'type': 'chunk', 'text': chunk})}\n\n"

            # Full response assembled — save to DB
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
            "X-Accel-Buffering": "no",  # disables nginx buffering if you deploy later
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
    # Get the user's most recent conversation
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
        .limit(1)
    )
    convo = result.scalar_one_or_none()

    if not convo:
        return ChatHistoryResponse(conversation_id=None, messages=[])

    # Get all messages for that conversation
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