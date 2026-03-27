"""
summary_prompt.py

Builds the prompt for the weekly summary pipeline.

System prompt  → instructs Gemini to return strict JSON (no markdown)
User-turn      → formats the week's raw data into a readable block
"""

from datetime import date


# ─── System Prompt ────────────────────────────────────────────────────────────

SUMMARY_SYSTEM_PROMPT = """\
You are a weekly fitness reflection engine for a personal AI fitness coach called GymBro.

Your job is to read a user's week of fitness activity and produce a structured weekly summary.

OUTPUT RULES — follow exactly:
- Respond with ONLY a raw JSON object. No markdown, no backticks, no explanation.
- If you cannot produce a meaningful summary, respond with: {"error": "insufficient data"}

OUTPUT SCHEMA:
{
  "narrative": "<2–3 paragraph personal, encouraging weekly reflection — written in second person ('you')>",
  "highlights": ["<win or notable moment 1>", "..."],
  "concerns": ["<potential issue or missed goal 1>", "..."],
  "trends": ["<observed trend vs prior weeks 1>", "..."],
  "focus_next_week": ["<recommended priority 1>", "..."],
  "activity_score": <integer 0–100>
}

FIELD RULES:
- narrative:        2–3 paragraphs. Be warm, specific, and motivating. Reference actual numbers if available.
- highlights:       3–5 specific wins this week (e.g. "Hit a new squat PR", "Slept 8+ hours 5 nights").
- concerns:         1–3 things to watch out for. Be tactful, not harsh. Empty list [] if none.
- trends:           1–3 trends observed when comparing to recent past weeks. Empty list [] if no prior data.
- focus_next_week:  2–4 concrete, actionable priorities for next week.
- activity_score:   0 = completely inactive, 50 = moderate, 100 = exceptional week.

SCORING GUIDELINES for activity_score:
- Add 10 pts for each workout logged (cap at 50)
- Add 5 pts if avg sleep >= 7 hours
- Add 5 pts if avg steps >= 8000
- Add 5 pts if water intake logged most days
- Add 5 pts if body measurements were logged
- Add 10 pts if new achievement or goal milestone mentioned
- Add 10 pts if consistent conversations with GymBro (3+ days)
- Add 5 pts if avg post-workout mood >= 7/10 (feeling consistently good after sessions)
- Subtract 5 pts if any pre-workout mood <= 3/10 (possible burnout signal)

MOOD RULES:
- If avg pre-workout mood < 5/10 across multiple sessions, flag this in concerns as a potential burnout or motivation risk.
- If post-workout mood is consistently lower than pre-workout mood, note possible overtraining in concerns.
- Reference mood trends warmly in the narrative — never clinically.

WORKOUT ANALYSIS:
- Use the WORKOUT SESSIONS data to identify the heaviest weight lifted per exercise (potential PRs).
- Note total sets and estimated weekly volume if meaningful.
- If a specific exercise shows increasing weight vs prior weeks (from previous summaries), call it out as a positive trend.
"""


# ─── User-Turn Template ───────────────────────────────────────────────────────

def build_summary_prompt(
    week_start: date,
    week_end: date,
    conversations: list[dict],
    daily_metrics: list[dict],
    body_measurements: list[dict],
    memory_facts: list[dict],
    previous_summaries: list[str],
    week_mood: dict | None = None,
    week_sessions: list[dict] | None = None,
) -> str:
    """
    Format the week's data into the user-turn prompt for the summary call.

    Args:
        week_start:           Start of the week (Monday)
        week_end:             End of the week (Sunday)
        conversations:        List of {date, messages: [{role, content}]} dicts
        daily_metrics:        List of DailyMetrics row dicts (date, steps, sleep, etc.)
        body_measurements:    List of BodyMeasurement row dicts (date, weight_kg, etc.)
        memory_facts:         List of active MemoryFact dicts (category, fact)
        previous_summaries:   List of narrative strings from last 1–4 prior weeks
    """
    lines = [
        f"WEEK: {week_start.isoformat()} to {week_end.isoformat()}",
        "",
    ]

    # ── Conversations ─────────────────────────────────────────────────────────
    if conversations:
        lines.append("=== CONVERSATIONS WITH GYMBRO THIS WEEK ===")
        for convo in conversations:
            lines.append(f"[{convo['date']}]")
            for msg in convo["messages"]:
                prefix = "USER" if msg["role"] == "user" else "GYMBRO"
                # Truncate very long AI responses to keep prompt size manageable
                content = msg["content"]
                if len(content) > 300:
                    content = content[:300] + "…"
                lines.append(f"  {prefix}: {content}")
        lines.append("")
    else:
        lines.append("=== CONVERSATIONS: None this week ===\n")

    # ── Daily Metrics ─────────────────────────────────────────────────────────
    if daily_metrics:
        lines.append("=== DAILY METRICS THIS WEEK ===")
        for m in daily_metrics:
            parts = [f"[{m['date']}]"]
            if m.get("steps"):
                parts.append(f"steps={m['steps']}")
            if m.get("calories_burned"):
                parts.append(f"cal_burned={m['calories_burned']}")
            if m.get("calories_consumed"):
                parts.append(f"cal_consumed={m['calories_consumed']}")
            if m.get("sleep_hours") is not None:
                parts.append(f"sleep={m['sleep_hours']}h")
            if m.get("water_ml"):
                parts.append(f"water={m['water_ml']}ml")
            if m.get("resting_heart_rate"):
                parts.append(f"rhr={m['resting_heart_rate']}bpm")
            lines.append("  " + "  ".join(parts))
        lines.append("")
    else:
        lines.append("=== DAILY METRICS: None logged this week ===\n")

    # ── Body Measurements ─────────────────────────────────────────────────────
    if body_measurements:
        lines.append("=== BODY MEASUREMENTS THIS WEEK ===")
        for b in body_measurements:
            parts = [f"[{b['date']}]"]
            if b.get("weight_kg"):      parts.append(f"weight={b['weight_kg']}kg")
            if b.get("body_fat_pct"):   parts.append(f"body_fat={b['body_fat_pct']}%")
            if b.get("muscle_mass_kg"): parts.append(f"muscle={b['muscle_mass_kg']}kg")
            if b.get("chest_cm"):       parts.append(f"chest={b['chest_cm']}cm")
            if b.get("waist_cm"):       parts.append(f"waist={b['waist_cm']}cm")
            if b.get("hips_cm"):        parts.append(f"hips={b['hips_cm']}cm")
            lines.append("  " + "  ".join(parts))
        lines.append("")
    else:
        lines.append("=== BODY MEASUREMENTS: None logged this week ===\n")

    # ── Workout Sessions (actual exercise log) ───────────────────────────────
    if week_sessions:
        lines.append("=== WORKOUT SESSIONS THIS WEEK (actual exercise log) ===")
        for s in week_sessions:
            dur = f", {s['duration_mins']} mins" if s.get("duration_mins") else ""
            lines.append(f"[{s.get('date', '?')}] {s['name']}{dur}")
            for ex in s.get("exercises", []):
                lines.append(f"  {ex['name']}")
                for st in ex.get("sets", []):
                    parts = [f"    Set {st['set']}:"]
                    if st.get("reps"):      parts.append(f"{st['reps']} reps")
                    if st.get("weight_kg"): parts.append(f"@ {st['weight_kg']}kg")
                    if st.get("rest_secs"): parts.append(f"rest {st['rest_secs']}s")
                    lines.append(" ".join(parts))
        lines.append("")
    else:
        lines.append("=== WORKOUT SESSIONS: None completed this week ===\n")

    # ── Memory Facts (long-term context about this user) ──────────────────────
    if memory_facts:
        lines.append("=== WHAT WE KNOW ABOUT THIS USER (from memory) ===")
        for f in memory_facts:
            lines.append(f"  [{f['category']}] {f['fact']}")
        lines.append("")

    # ── Weekly Mood Ratings ───────────────────────────────────────────────────
    if week_mood and week_mood.get("sessions"):
        lines.append("=== MOOD RATINGS THIS WEEK (1=very low, 10=peak) ===")
        for s in week_mood["sessions"]:
            parts = [f"[{s.get('date', '?')}] {s.get('name', 'Workout')}:"]
            if "mood_before" in s:
                parts.append(f"pre={s['mood_before']}/10")
            if "mood_after" in s:
                parts.append(f"post={s['mood_after']}/10")
            lines.append("  " + "  ".join(parts))
        # Averages
        if week_mood.get("avg_mood_before") is not None:
            lines.append(f"  Avg pre-workout mood : {week_mood['avg_mood_before']}/10")
        if week_mood.get("avg_mood_after") is not None:
            lines.append(f"  Avg post-workout mood: {week_mood['avg_mood_after']}/10")
        if week_mood.get("min_mood_before") is not None and week_mood["min_mood_before"] <= 4:
            lines.append(f"  ⚠ Lowest pre-workout mood this week: {week_mood['min_mood_before']}/10")
        lines.append("")
    else:
        lines.append("=== MOOD RATINGS: Not recorded this week ===\n")

    # ── Previous Summaries (for trend analysis) ───────────────────────────────
    if previous_summaries:
        lines.append("=== PREVIOUS WEEKLY SUMMARIES (most recent first, for trend analysis) ===")
        for i, narrative in enumerate(previous_summaries, 1):
            lines.append(f"--- Week -{i} ---")
            # Trim very long narratives
            if len(narrative) > 500:
                narrative = narrative[:500] + "…"
            lines.append(narrative)
        lines.append("")
    else:
        lines.append("=== PREVIOUS SUMMARIES: None available (first week) ===\n")

    lines.append(
        "Now generate the weekly summary JSON strictly following the output schema. "
        "Be specific, warm, and use the actual data above."
    )

    return "\n".join(lines)
