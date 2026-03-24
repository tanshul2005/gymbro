import json
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from google import genai
from google.genai import types

from app.core.config import settings
from app.models.memory import MemoryFact, FactCategoryEnum
from app.schemas.memory import ExtractorResponse, ExtractedFact
from app.prompts.extractor_prompt import EXTRACTOR_SYSTEM_PROMPT, build_extractor_prompt
from app.services.embedding_service import store_memory_embedding, retrieve_relevant_memories as _chroma_retrieve

logger = logging.getLogger(__name__)

client = genai.Client(api_key=settings.GEMINI_API_KEY)
MODEL_NAME = "gemini-2.0-flash"

# ─── Confidence Thresholds ────────────────────────────────────────────────────

CONFIDENCE_STORE = 70      # >= 70 → store to DB
CONFIDENCE_DISCARD = 69    # <= 69 → discard silently


# ─── Extractor Call ───────────────────────────────────────────────────────────

async def extract_facts_from_message(user_message: str) -> list[ExtractedFact]:
    """
    Call Gemini with the extractor prompt and parse the JSON response.
    Returns a list of ExtractedFact objects with confidence >= CONFIDENCE_STORE.
    Returns [] on any failure so it never breaks the chat flow.
    """
    try:
        prompt = build_extractor_prompt(user_message)

        response = await client.aio.models.generate_content(
            model=MODEL_NAME,
            contents=[{"role": "user", "parts": [{"text": prompt}]}],
            config=types.GenerateContentConfig(
                system_instruction=EXTRACTOR_SYSTEM_PROMPT,
                temperature=0.1,
            ),
        )

        raw = response.text.strip()

        # Strip markdown code fences if the model wraps in them anyway
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        parsed = ExtractorResponse.model_validate_json(raw)

        high_confidence = [
            f for f in parsed.facts if f.confidence >= CONFIDENCE_STORE
        ]

        logger.info(
            f"Extractor: {len(parsed.facts)} facts found, "
            f"{len(high_confidence)} above confidence threshold"
        )
        return high_confidence

    except Exception as e:
        logger.error(f"Fact extraction failed: {e}")
        return []


# ─── Deduplication Logic ──────────────────────────────────────────────────────

_STOPWORDS = {
    "user", "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "has", "have", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "to", "of", "in", "on", "at", "for", "and",
    "or", "but", "not", "with", "their", "they", "that", "this", "it",
    "wants", "prefers", "likes", "dislikes", "enjoys", "avoids",
}


def _content_words(text: str) -> set[str]:
    return {w for w in text.lower().split() if w not in _STOPWORDS and len(w) > 2}


async def _find_duplicate(
    user_id: str,
    category: FactCategoryEnum,
    new_fact: str,
    db: AsyncSession,
) -> MemoryFact | None:
    result = await db.execute(
        select(MemoryFact).where(
            MemoryFact.user_id == user_id,
            MemoryFact.category == category,
            MemoryFact.is_active == True,
        )
    )
    existing_facts = result.scalars().all()

    if not existing_facts:
        return None

    new_words = _content_words(new_fact)
    if not new_words:
        return None

    for existing in existing_facts:
        existing_words = _content_words(existing.fact)
        if not existing_words:
            continue
        overlap = len(new_words & existing_words) / min(len(new_words), len(existing_words))
        if overlap >= 0.6:
            return existing

    return None


# ─── Store Facts ──────────────────────────────────────────────────────────────

async def store_facts(
    user_id: str,
    facts: list[ExtractedFact],
    db: AsyncSession,
    source_message_id: str | None = None,
) -> tuple[int, int]:
    """
    Persist extracted facts to Postgres with deduplication,
    then write embeddings to ChromaDB for each stored fact.

    Returns (inserted_count, updated_count)
    """
    inserted = 0
    updated = 0

    for extracted in facts:
        duplicate = await _find_duplicate(
            user_id=user_id,
            category=extracted.category,
            new_fact=extracted.fact,
            db=db,
        )

        if duplicate:
            duplicate.fact = extracted.fact
            duplicate.confidence = extracted.confidence
            duplicate.source_message_id = source_message_id
            db.add(duplicate)
            updated += 1
            fact_id = str(duplicate.id)
            created_at = duplicate.created_at
            logger.debug(f"Updated fact [{extracted.category}]: {extracted.fact}")
        else:
            new_fact = MemoryFact(
                user_id=user_id,
                category=extracted.category,
                fact=extracted.fact,
                confidence=extracted.confidence,
                source_message_id=source_message_id,
                is_active=True,
            )
            db.add(new_fact)
            await db.flush()  # get the ID before committing
            inserted += 1
            fact_id = str(new_fact.id)
            created_at = new_fact.created_at
            logger.debug(f"Inserted fact [{extracted.category}]: {extracted.fact}")

        # ── Write to ChromaDB (non-blocking — failure won't roll back Postgres) ──
        await store_memory_embedding(
            fact_id=fact_id,
            user_id=user_id,
            fact_text=extracted.fact,
            category=extracted.category.value,
            confidence=extracted.confidence,
            created_at=created_at,
        )

    if facts:
        await db.commit()

    logger.info(f"Memory store complete: {inserted} inserted, {updated} updated")
    return inserted, updated


# ─── Public Retrieval Wrapper ─────────────────────────────────────────────────

async def get_relevant_memories(
    user_id: str,
    query: str,
    top_k: int = 5,
) -> list[dict]:
    """
    Public wrapper around ChromaDB retrieval.
    Called by the chat router before every Gemini call.

    Returns a list of dicts with keys:
        fact_text, category, confidence, similarity, recency_score, combined_score
    Returns [] on any failure — never blocks chat.
    """
    try:
        return await _chroma_retrieve(
            user_id=user_id,
            query=query,
            top_k=top_k,
        )
    except Exception as e:
        logger.error(f"get_relevant_memories failed for user {user_id}: {e}")
        return []


# ─── Main Entry Point ─────────────────────────────────────────────────────────

async def process_message_for_memory(
    user_id: str,
    user_message: str,
    db: AsyncSession,
    source_message_id: str | None = None,
) -> None:
    """
    Full pipeline: extract → filter → dedup → store (Postgres + ChromaDB).
    Called as a background task from the chat router.
    Swallows all exceptions so it never affects the chat response.
    """
    try:
        facts = await extract_facts_from_message(user_message)
        if not facts:
            return

        await store_facts(
            user_id=user_id,
            facts=facts,
            db=db,
            source_message_id=source_message_id,
        )
    except Exception as e:
        logger.error(f"process_message_for_memory failed for user {user_id}: {e}")