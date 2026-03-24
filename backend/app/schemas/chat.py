from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional


class ChatMessageRequest(BaseModel):
    """Sent by the frontend when the user submits a message."""
    message: str
    conversation_id: Optional[str] = None  # None = start new conversation

    @field_validator("message")
    @classmethod
    def message_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Message cannot be empty")
        if len(v) > 4000:
            raise ValueError("Message too long (max 4000 characters)")
        return v


class MessageOut(BaseModel):
    """A single message returned to the frontend."""
    id: str
    conversation_id: str
    role: str          # "user" or "assistant"
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationOut(BaseModel):
    """Conversation metadata + its messages."""
    id: str
    title: Optional[str]
    created_at: datetime
    updated_at: datetime
    messages: list[MessageOut] = []

    model_config = {"from_attributes": True}


class ChatHistoryResponse(BaseModel):
    """Response for GET /chat/history."""
    conversation_id: Optional[str]
    messages: list[MessageOut]