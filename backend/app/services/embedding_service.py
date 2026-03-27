import logging
import time
from datetime import datetime, timezone

import chromadb
from chromadb.config import Settings as ChromaSettings
from google import genai

from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Gemini Client ───────────────────────────────────────────────────────────
# gemini-embedding-001 is the current stable embedding model (text-embedding-004 deprecated Jan 2026).
# It works with the standard v1beta SDK default — no api_version override needed.
_embedding_client = genai.Client(api_key=settings.GEMINI_API_KEY)
EMBEDDING_MODEL = "gemini-embedding-001"

# ─── ChromaDB Lazy Client ─────────────────────────────────────────────────────
# Initialized on first use — prevents startup crash if ChromaDB is unreachable.

_chroma_client = None
_episodes_collection = None
_summaries_collection = None


def _get_chroma_collections():
    """
    Return (episodes_collection, summaries_collection).
    Creates the ChromaDB HttpClient and collections on first call.
    Raises on connection failure — callers should catch.
    """
    global _chroma_client, _episodes_collection, _summaries_collection

    if _episodes_collection is not None:
        return _episodes_collection, _summaries_collection

    _chroma_client = chromadb.HttpClient(
        host=settings.CHROMA_HOST,
        port=settings.CHROMA_PORT,
        settings=ChromaSettings(anonymized_telemetry=False),
    )

    _episodes_collection = _chroma_client.get_or_create_collection(
        name="episodes",
        metadata={"hnsw:space": "cosine"},
    )
    _summaries_collection = _chroma_client.get_or_create_collection(
        name="summaries",
        metadata={"hnsw:space": "cosine"},
    )

    logger.info("ChromaDB collections initialised (episodes, summaries)")
    return _episodes_collection, _summaries_collection


# ─── Embedding ────────────────────────────────────────────────────────────────

async def embed_text(text: str) -> list[float]:
    """
    Generate an embedding vector for a text string using Gemini text-embedding-004.
    Returns a list of floats. Raises on failure — callers should handle.
    """
    response = await _embedding_client.aio.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=text,
    )
    return response.embeddings[0].values


# ─── Store ────────────────────────────────────────────────────────────────────

async def store_memory_embedding(
    fact_id: str,
    user_id: str,
    fact_text: str,
    category: str,
    confidence: int,
    created_at: datetime | None = None,
) -> None:
    """
    Embed a memory fact and upsert it into the episodes ChromaDB collection.

    Metadata stored alongside the vector:
      - user_id     : for filtering by user on retrieval
      - category    : fact category (goal, habit, preference, etc.)
      - confidence  : extraction confidence score
      - timestamp   : unix epoch — used for recency scoring during retrieval
      - fact_text   : raw text — returned as context string without extra DB lookup
    """
    # ── Cosine dedup (Section IV-B) ──────────────────────────────────────────
    # ChromaDB stores cosine *distance* (0 = identical, 2 = opposite).
    # Similarity = 1 - distance, so threshold 0.92 → max distance 0.08.
    _COSINE_DEDUP_THRESHOLD = 0.92

    try:
        episodes, _ = _get_chroma_collections()
        vector = await embed_text(fact_text)

        # Only run the similarity check if the collection has at least one doc
        # for this user (query will error with n_results > collection size).
        existing_count = episodes.count()
        if existing_count > 0:
            dedup_result = episodes.query(
                query_embeddings=[vector],
                n_results=1,
                where={"user_id": user_id},
                include=["distances"],
            )
            ids_found = dedup_result.get("ids", [[]])[0]
            distances_found = dedup_result.get("distances", [[]])[0]

            if ids_found and distances_found:
                top_similarity = 1.0 - distances_found[0]
                if top_similarity >= _COSINE_DEDUP_THRESHOLD:
                    logger.debug(
                        f"Skipping duplicate fact {fact_id}: cosine similarity "
                        f"{top_similarity:.4f} >= {_COSINE_DEDUP_THRESHOLD} "
                        f"(nearest: {ids_found[0]})"
                    )
                    return

        ts = (created_at or datetime.now(timezone.utc)).timestamp()

        episodes.upsert(
            ids=[fact_id],
            embeddings=[vector],
            metadatas=[{
                "user_id": user_id,
                "category": category,
                "confidence": confidence,
                "timestamp": ts,
                "fact_text": fact_text,
            }],
            documents=[fact_text],
        )
        logger.debug(f"Stored embedding for fact {fact_id} [{category}]")

    except Exception as e:
        logger.error(f"Failed to store embedding for fact {fact_id}: {e}")
        # Swallow — ChromaDB write failure must never break the chat flow


# ─── Retrieve ─────────────────────────────────────────────────────────────────

_RECENCY_WEIGHT = 0.3   # 30% recency influence, 70% semantic similarity
_RECENCY_HALF_LIFE_DAYS = 60.0  # facts older than ~60 days lose half their recency score


def _recency_score(timestamp: float) -> float:
    """
    Returns a 0–1 score based on how recent the fact is.
    Uses exponential decay with a 60-day half-life.
    """
    age_days = (time.time() - timestamp) / 86400.0
    return 2 ** (-age_days / _RECENCY_HALF_LIFE_DAYS)


async def retrieve_relevant_memories(
    user_id: str,
    query: str,
    top_k: int = 5,
) -> list[dict]:
    """
    Retrieve the most relevant memory facts for a user given the current query.

    Steps:
      1. Embed the query
      2. Similarity search in ChromaDB (filtered to user_id), fetch top_k * 3 candidates
      3. Rerank by combining similarity score + recency score
      4. Return top_k results as list of dicts with keys:
           fact_text, category, confidence, similarity, recency, combined_score

    Returns [] on any failure so it never breaks the chat flow.
    """
    try:
        episodes, _ = _get_chroma_collections()
        query_vector = await embed_text(query)

        candidates_n = min(top_k * 3, 30)

        results = episodes.query(
            query_embeddings=[query_vector],
            n_results=candidates_n,
            where={"user_id": user_id},
            include=["metadatas", "distances"],
        )

        if not results["ids"] or not results["ids"][0]:
            return []

        ids = results["ids"][0]
        metadatas = results["metadatas"][0]
        distances = results["distances"][0]

        reranked = []
        for _id, meta, distance in zip(ids, metadatas, distances):
            # ChromaDB cosine distance → similarity (1 = identical, 0 = orthogonal)
            similarity = 1.0 - distance
            recency = _recency_score(meta.get("timestamp", 0.0))
            combined = (1 - _RECENCY_WEIGHT) * similarity + _RECENCY_WEIGHT * recency

            reranked.append({
                "fact_id": _id,
                "fact_text": meta.get("fact_text", ""),
                "category": meta.get("category", "other"),
                "confidence": meta.get("confidence", 0),
                "similarity": round(similarity, 4),
                "recency_score": round(recency, 4),
                "combined_score": round(combined, 4),
            })

        # Sort by combined score descending, take top_k
        reranked.sort(key=lambda x: x["combined_score"], reverse=True)
        top = reranked[:top_k]

        logger.info(
            f"Retrieved {len(top)} memories for user {user_id} "
            f"(from {len(ids)} candidates)"
        )
        return top

    except Exception as e:
        logger.error(f"Memory retrieval failed for user {user_id}: {e}")
        return []