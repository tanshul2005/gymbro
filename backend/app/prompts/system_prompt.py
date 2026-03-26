"""
system_prompt.py

Builds the system prompt injected into every Gemini call.

Without context  → returns the base GymBro prompt (used by background jobs)
With context     → injects profile, today's activity, recent stats,
                   retrieved memories, and last week's summary so the
                   assistant feels like it genuinely knows the user
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
    if not profile:
        return ""

    lines = ["## User Profile"]

    field_labels = {
        "full_name":      "Name",
        "age":            "Age",
        "gender":         "Gender",
        "height_cm":      "Height (cm)",
        "weight_kg":      "Weight (kg)",
        "fitness_goal":   "Fitness goal",
        "activity_level": "Activity level",
        "bio":            "Bio",
    }

    for key, label in field_labels.items():
        value = profile.get(key)
        if value is not None and str(value).strip():
            lines.append(f"- {label}: {value}")

    return "\n".join(lines) if len(lines) > 1 else ""


def _today_section(today: dict) -> str:
    """
    Render what the user has actually done today — metrics logged
    and any workout session completed.
    This is the most important context for questions like
    'how is my day going' or 'what have I done today'.
    Always renders — even when nothing is logged, Gemini needs to
    know that explicitly rather than falling back to weekly summaries.
    """
    lines = ["## Today's Activity (use this to answer questions about today)"]

    metrics = today.get("metrics", {}) if today else {}
    if metrics:
        metric_labels = {
            "steps":              "Steps logged",
            "calories_burned":    "Calories burned",
            "calories_consumed":  "Calories consumed",
            "sleep_hours":        "Sleep last night (hrs)",
            "water_ml":           "Water intake (ml)",
            "resting_heart_rate": "Resting heart rate (bpm)",
        }
        has_any = False
        for key, label in metric_labels.items():
            value = metrics.get(key)
            if value is not None:
                lines.append(f"- {label}: {value}")
                has_any = True
        if not has_any:
            lines.append("- No metrics logged yet today")
    else:
        lines.append("- No metrics logged yet today")

    session = today.get("workout_session") if today else None
    if session:
        name       = session.get("name", "Workout")
        status     = session.get("status", "")
        duration   = session.get("duration_mins")
        ex_count   = session.get("exercise_count", 0)
        status_str = "completed" if status == "completed" else "in progress"
        dur_str    = f", {duration} mins" if duration else ""
        lines.append(
            f"- Workout today: {name} ({status_str}{dur_str}, "
            f"{ex_count} exercise{'s' if ex_count != 1 else ''})"
        )
        exercises = session.get("exercises", [])
        for ex in exercises:
            lines.append(f"  • {ex['name']}")
            for s in ex.get("sets", []):
                parts = [f"    Set {s['set']}:"]
                if s.get("reps"):
                    parts.append(f"{s['reps']} reps")
                if s.get("weight_kg"):
                    parts.append(f"@ {s['weight_kg']}kg")
                if s.get("rest_secs"):
                    parts.append(f"rest {s['rest_secs']}s")
                lines.append(" ".join(parts))
    else:
        lines.append("- No workout logged today")

    return "\n".join(lines)


def _stats_section(stats: dict) -> str:
    if not stats:
        return ""

    lines = ["## Recent Fitness Stats (last 30 days)"]

    agg = stats.get("aggregations", {})
    stat_labels = {
        "avg_steps":           "Avg daily steps",
        "avg_calories_burned": "Avg calories burned",
        "avg_sleep_hours":     "Avg sleep hours",
        "avg_water_ml":        "Avg water intake (ml)",
        "avg_resting_hr":      "Avg resting heart rate",
        "workout_count":       "Workouts logged",
        "current_streak":      "Current streak (days)",
        "longest_streak":      "Longest streak (days)",
    }
    for key, label in stat_labels.items():
        value = agg.get(key)
        if value is not None:
            lines.append(f"- {label}: {value}")

    body = stats.get("latest_body", {})
    if body:
        body_labels = {
            "weight_kg":      "Weight (kg)",
            "body_fat_pct":   "Body fat %",
            "muscle_mass_kg": "Muscle mass (kg)",
        }
        for key, label in body_labels.items():
            value = body.get(key)
            if value is not None:
                lines.append(f"- {label}: {value}")

    return "\n".join(lines) if len(lines) > 1 else ""


def _memories_section(memories: list[dict]) -> str:
    if not memories:
        return ""

    lines = ["## What You Know About This User"]
    lines.append("(From past conversations — use naturally, never recite robotically)")

    for mem in memories:
        fact     = mem.get("fact_text", "").strip()
        category = mem.get("category", "other")
        if fact:
            lines.append(f"- [{category}] {fact}")

    return "\n".join(lines) if len(lines) > 2 else ""


def _weekly_summary_section(summary: dict) -> str:
    """
    Render last week's summary. Gemini is explicitly told to use this
    when the user asks about their week, progress, or trends.
    """
    if not summary:
        return ""

    narrative = summary.get("narrative", "").strip()
    if not narrative:
        return ""

    score    = summary.get("activity_score")
    highlights = summary.get("highlights", [])
    concerns   = summary.get("concerns", [])
    trends     = summary.get("trends", [])
    focus      = summary.get("focus_next_week", [])

    lines = [
        "## Last Week's Summary",
        "(Use this section when the user asks about their week, how they did, "
        "their progress, trends, or what they should focus on next.)",
    ]

    if score is not None:
        lines.append(f"Activity score: {score}/100")

    lines.append(narrative)

    if highlights:
        lines.append("Highlights: " + " | ".join(highlights))
    if concerns:
        lines.append("Concerns: " + " | ".join(concerns))
    if trends:
        lines.append("Trends: " + " | ".join(trends))
    if focus:
        lines.append("Focus next week: " + " | ".join(focus))

    return "\n".join(lines)


# ─── Main Builder ─────────────────────────────────────────────────────────────

def build_system_prompt(context: dict | None = None) -> str:
    """
    Assemble the full system prompt for a Gemini call.

    Args:
        context: optional dict with any of these keys:
            - profile        : dict  — user profile fields
            - today          : dict  — today's metrics + workout session
            - stats          : dict  — 30-day metrics summary
            - memories       : list  — retrieved ChromaDB facts
            - weekly_summary : dict  — most recent weekly reflection

    Returns:
        A single string passed to GenerateContentConfig(system_instruction=...)
    """
    if not context:
        return _BASE

    sections = [_BASE]

    profile_block = _profile_section(context.get("profile") or {})
    if profile_block:
        sections.append(profile_block)

    # Today comes right after profile — highest priority context
    # Always included so Gemini knows explicitly what was/wasn't logged today
    today_block = _today_section(context.get("today") or {})
    sections.append(today_block)

    stats_block = _stats_section(context.get("stats") or {})
    if stats_block:
        sections.append(stats_block)

    memories_block = _memories_section(context.get("memories") or [])
    if memories_block:
        sections.append(memories_block)

    weekly_block = _weekly_summary_section(context.get("weekly_summary") or {})
    if weekly_block:
        sections.append(weekly_block)

    if len(sections) > 1:
        sections.append(
            "## Instructions\n"
            "- For questions about TODAY (e.g. 'how is my day going', 'what have I done today'): "
            "use Today's Activity section above — be specific about what is and isn't logged.\n"
            "- IMPORTANT: If Today's Activity shows 'No metrics logged yet today' or 'No workout logged today', "
            "that means the USER has not logged data yet — NOT that you lack access. "
            "Tell them clearly what they haven't logged yet and encourage them to do so. "
            "Never say you don't have access or can't see their data.\n"
            "- For questions about THIS WEEK or PROGRESS: use Last Week's Summary section above.\n"
            "- Use profile, stats, and memories to personalise all other responses.\n"
            "- Reference data naturally — never dump raw numbers robotically.\n"
            "- If the user says something that contradicts a memory, trust the new message."
        )

    return "\n\n".join(sections)