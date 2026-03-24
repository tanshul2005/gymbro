from google import genai
from google.genai import types
from typing import AsyncGenerator

from app.core.config import settings
from app.prompts.system_prompt import build_system_prompt

client = genai.Client(api_key=settings.GEMINI_API_KEY)

MODEL_NAME = "gemini-2.0-flash"


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
    contents.append({"role": "user", "parts": [{"text": user_message}]})
    return contents


async def stream_chat_response(
    user_message: str,
    conversation_history: list[dict],
    context: dict | None = None,
) -> AsyncGenerator[str, None]:
    """
    Stream a Gemini response token by token.

    Args:
        user_message:          the current user message
        conversation_history:  list of prior messages as {"role", "content"} dicts
        context:               optional dict with profile, stats, memories —
                               passed to build_system_prompt to personalise the prompt.
                               If None, falls back to the base GymBro prompt.
    """
    contents = _build_contents(conversation_history, user_message)
    system_prompt = build_system_prompt(context)

    response = await client.aio.models.generate_content_stream(
        model=MODEL_NAME,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
        ),
    )

    async for chunk in response:
        if chunk.text:
            yield chunk.text


async def get_chat_response(
    user_message: str,
    conversation_history: list[dict],
    context: dict | None = None,
) -> str:
    """
    Non-streaming version — used by background jobs (summaries etc.)

    Args:
        context: same optional context dict as stream_chat_response.
                 Background jobs typically pass None → base prompt.
    """
    contents = _build_contents(conversation_history, user_message)
    system_prompt = build_system_prompt(context)

    response = await client.aio.models.generate_content(
        model=MODEL_NAME,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
        ),
    )
    return response.text