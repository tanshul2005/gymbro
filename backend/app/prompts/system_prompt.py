"""
system_prompt.py

Builds the system prompt injected into every Gemini call.

Without context  → returns the base GymBro prompt (used by background jobs)
With context     → injects profile, recent stats, and retrieved memories
                   so the assistant feels like it knows the user
"""

# ─── Base Prompt ──────────────────────────────────────────────────────────────

_BASE = """You are an expert AI fitness coach named GymBro. You help users with:
- Workout planning and exercise selection
- Form cues and technique advice
- Nutrition guidance and meal timing
- Recovery strategies and injury prevention
- Goal setting and progress tracking
- Motivation and accountability

Keep responses focused, practical, and encouraging.
Use bullet points for lists. Keep answers concise unless asked for detail.
Never give medical diagnoses — always recommend seeing a professional for injuries."""


# ─── Section Builders ─────────────────────────────────────────────────────────

def _profile_section(profile: dict) -> str:
    """
    Render user profile data as a readable block.
    Only includes fields that are actually present — no 'None' noise.
    """
    if not profile:
        return ""

    lines = ["## User Profile"]

    field_labels = {
        "full_name":        "Name",
        "age":              "Age",
        "gender":           "Gender",
        "height_cm":        "Height (cm)",
        "weight_kg":        "Weight (kg)",
        "fitness_goal":     "Fitness goal",
        "activity_level":   "Activity level",
        "bio":              "Bio",
    }

    for key, label in field_labels.items():
        value = profile.get(key)
        if value is not None and str(value).strip():
            lines.append(f"- {label}: {value}")

    return "\n".join(lines) if len(lines) > 1 else ""


def _stats_section(stats: dict) -> str:
    """
    Render recent fitness stats. Expects the shape returned by
    GET /metrics/summary (daily_metrics aggregations + body snapshot).
    Only renders fields that exist and are non-null.
    """
    if not stats:
        return ""

    lines = ["## Recent Fitness Stats"]

    # Daily metrics aggregations
    agg = stats.get("aggregations", {})
    stat_labels = {
        "avg_steps":            "Avg daily steps (30d)",
        "avg_calories_burned":  "Avg calories burned (30d)",
        "avg_sleep_hours":      "Avg sleep hours (30d)",
        "avg_water_ml":         "Avg water intake ml (30d)",
        "avg_resting_hr":       "Avg resting heart rate (30d)",
        "workout_count":        "Workouts logged (30d)",
        "current_streak":       "Current streak (days)",
        "longest_streak":       "Longest streak (days)",
    }
    for key, label in stat_labels.items():
        value = agg.get(key)
        if value is not None:
            lines.append(f"- {label}: {value}")

    # Latest body snapshot
    body = stats.get("latest_body", {})
    if body:
        body_labels = {
            "weight_kg":        "Weight (kg)",
            "body_fat_pct":     "Body fat %",
            "muscle_mass_kg":   "Muscle mass (kg)",
            "bmi":              "BMI",
        }
        for key, label in body_labels.items():
            value = body.get(key)
            if value is not None:
                lines.append(f"- {label}: {value}")

    return "\n".join(lines) if len(lines) > 1 else ""


def _memories_section(memories: list[dict]) -> str:
    """
    Render retrieved ChromaDB memory facts as a readable block.
    Each memory is a dict with at least: fact_text, category.
    """
    if not memories:
        return ""

    lines = ["## What You Know About This User"]
    lines.append("(Retrieved from past conversations — use naturally, don't recite robotically)")

    for mem in memories:
        fact = mem.get("fact_text", "").strip()
        category = mem.get("category", "other")
        if fact:
            lines.append(f"- [{category}] {fact}")

    return "\n".join(lines) if len(lines) > 2 else ""


# ─── Main Builder ─────────────────────────────────────────────────────────────

def build_system_prompt(context: dict | None = None) -> str:
    """
    Assemble the full system prompt for a Gemini call.

    Args:
        context: optional dict with any of these keys:
            - profile  : dict — user profile fields
            - stats    : dict — recent metrics summary
            - memories : list[dict] — retrieved ChromaDB facts

    Returns:
        A single string passed to GenerateContentConfig(system_instruction=...)
    """
    if not context:
        return _BASE

    sections = [_BASE]

    profile_block = _profile_section(context.get("profile") or {})
    if profile_block:
        sections.append(profile_block)

    stats_block = _stats_section(context.get("stats") or {})
    if stats_block:
        sections.append(stats_block)

    memories_block = _memories_section(context.get("memories") or [])
    if memories_block:
        sections.append(memories_block)

    if len(sections) > 1:
        sections.append(
            "## Instructions\n"
            "Use the profile, stats, and memory above to personalise your responses. "
            "Reference them naturally — never dump raw data at the user. "
            "If the user says something that contradicts a memory, trust the new message."
        )

    return "\n\n".join(sections)