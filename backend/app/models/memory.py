from sqlalchemy import Column, String, DateTime, Text, ForeignKey, Enum, Boolean, Integer
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum
from app.core.database import Base
class FactCategoryEnum(str, enum.Enum):
    goal = "goal"
    preference = "preference"
    limitation = "limitation"
    achievement = "achievement"
    habit = "habit"
    personal = "personal"
    emotion = "emotion"   # burnout signals, motivation state, mood patterns
    event = "event"       # races, competitions, life events affecting training
    other = "other"

class MessageRoleEnum(str, enum.Enum):
    user = "user"
    assistant = "assistant"

class Conversation(Base):
    __tablename__ = "conversations"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    # Relationships
    user = relationship("User", back_populates="conversations")
    messages = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan"
    )
    summaries = relationship(
        "ConversationSummary",
        back_populates="conversation",
        cascade="all, delete-orphan"
    )
    
class Message(Base):
    __tablename__ = "messages"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String, ForeignKey("conversations.id"), nullable=False, index=True)
    role = Column(Enum(MessageRoleEnum), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # Relationships
    conversation = relationship("Conversation", back_populates="messages")

class MemoryFact(Base):
    __tablename__ = "memory_facts"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    category = Column(
        Enum(FactCategoryEnum),
        nullable=False,
        default=FactCategoryEnum.other
    )
    fact = Column(Text, nullable=False)
    source_message_id = Column(
        String,
        ForeignKey("messages.id"),
        nullable=True
    )
    is_active = Column(Boolean, default=True)
    confidence = Column(Integer, default=100)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
    # Relationships
    user = relationship("User", back_populates="memory_facts")
    source_message = relationship("Message")

class ConversationSummary(Base):
    __tablename__ = "conversation_summaries"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(
        String,
        ForeignKey("conversations.id"),
        nullable=True,   # weekly summaries are not tied to a single conversation
        index=True
    )
    user_id = Column(
        String,
        ForeignKey("users.id"),
        nullable=False,
        index=True
    )
    summary = Column(Text, nullable=False)
    week_start = Column(DateTime(timezone=True), nullable=True, index=True)
    week_end = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # Relationships
    conversation = relationship("Conversation", back_populates="summaries")