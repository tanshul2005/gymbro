from google import genai
from google.genai import types
from typing import AsyncGenerator
from app.core.config import settings

client = genai.Client(api_key=settings.GEMINI_API_KEY)

MODEL_NAME = "gemini-2.0-flash"

SYSTEM_PROMPT = """You are an expert AI fitness coach named GymBro. You help users with:
- Workout planning and exercise selection
- Form cues and technique advice
- Nutrition guidance and meal timing
- Recovery strategies and injury prevention
- Goal setting and progress tracking
- Motivation and accountability

Keep responses focused, practical, and encouraging.
Use bullet points for lists. Keep answers concise unless asked for detail.
Never give medical diagnoses — always recommend seeing a professional for injuries.
"""


def _build_contents(
    conversation_history: list[dict],
    user_message: str,
) -> list[dict]:
    """
    Build the full contents list for the google-genai SDK.
    Includes history + current user message in one list.
    DB role "assistant" → "model" for Gemini.
    """
    contents = []
    for msg in conversation_history:
        role = "model" if msg["role"] == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": msg["content"]}]})
    # Append the current user message at the end
    contents.append({"role": "user", "parts": [{"text": user_message}]})
    return contents


async def stream_chat_response(
    user_message: str,
    conversation_history: list[dict],
) -> AsyncGenerator[str, None]:
    contents = _build_contents(conversation_history, user_message)

    response = await client.aio.models.generate_content_stream(
        model=MODEL_NAME,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
        ),
    )

    async for chunk in response:
        if chunk.text:
            yield chunk.text


async def get_chat_response(
    user_message: str,
    conversation_history: list[dict],
) -> str:
    """
    Non-streaming version for background jobs (summaries etc.)
    """
    contents = _build_contents(conversation_history, user_message)

    response = await client.aio.models.generate_content(
        model=MODEL_NAME,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
        ),
    )
    return response.text