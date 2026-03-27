import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import WorkoutCard from "../components/WorkoutCard";
import FilterChips from "../components/FilterChips";
import CreatePlanModal from "../components/CreatePlanModal";
import client from "../api/client";

import { useNavigate } from "react-router-dom";
import { startSession } from "../api/client";

export default function WorkoutPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);

  const navigate = useNavigate();
  const [startingPlanId, setStartingPlanId] = useState(null);

  const handlePlanCreated = (newPlan) => {
    setPlans((prev) => [newPlan, ...prev]);
  };

  // Pre-workout mood picker state
  const [moodPlanId, setMoodPlanId] = useState(null); // plan awaiting mood pick
  const [moodBefore, setMoodBefore] = useState(null);
  const MOOD_OPTIONS = [
    { value: 2,  emoji: "😫", label: "Drained" },
    { value: 4,  emoji: "😕", label: "Low" },
    { value: 6,  emoji: "😐", label: "Okay" },
    { value: 8,  emoji: "😊", label: "Good" },
    { value: 10, emoji: "🤩", label: "Pumped" },
  ];

  // Step 1 — open picker instead of starting immediately
  const handleStartSession = (planId) => {
    if (startingPlanId) return;
    setMoodBefore(null);
    setMoodPlanId(planId);
  };

  // Step 2 — user confirms mood (or skips)
  const confirmStart = async (mood) => {
    const planId = moodPlanId;
    setMoodPlanId(null);
    if (!planId || startingPlanId) return;
    setStartingPlanId(planId);
    try {
      const payload = { plan_id: planId };
      if (mood !== null) payload.mood_before = mood;
      const res = await startSession(payload);
      navigate(`/workouts/active/${res.data.id}`);
    } catch (err) {
      setError(err?.message ?? "Failed to start session.");
      setStartingPlanId(null);
    }
  };

  useEffect(() => {
    client
      .get("/workouts/plans")
      .then((res) => setPlans(res.data))
      .catch(() => setError("Failed to load workout plans."))
      .finally(() => setLoading(false));
  }, []);

  // Derive unique muscle groups across all plans for filter chips
  const muscleGroups = [
    "all",
    ...new Set(
      plans.flatMap((p) =>
        p.plan_exercises.map((e) => e.muscle_group).filter(Boolean)
      )
    ),
  ];

  const filteredPlans =
    filter === "all"
      ? plans
      : plans.filter((p) =>
          p.plan_exercises.some((e) => e.muscle_group === filter)
        );

  return (
    <Layout>
      <div style={{ padding: "36px 40px", maxWidth: "1100px", width: "100%", overflowY: "auto", flex: 1 }}>

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: "32px",
          }}
        >
          <div>
            <p
              style={{
                fontSize: "11px",
                color: "#4a5568",
                letterSpacing: "0.1em",
                marginBottom: "6px",
              }}
            >
              TRAINING
            </p>
            <h1
              style={{
                fontSize: "26px",
                fontWeight: "700",
                color: "#f0f4f8",
                letterSpacing: "-0.02em",
              }}
            >
              Workout Plans
            </h1>
          </div>

          <div
            onClick={() => setShowModal(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid rgba(200,241,53,0.3)",
              background: "rgba(200,241,53,0.06)",
              color: "#c8f135",
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
              fontFamily: "'DM Mono', monospace",
            }}
            role="button"
            aria-label="Create new workout plan"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Plan
          </div>
        </div>

        {/* Filter chips */}
        {!loading && !error && plans.length > 0 && (
          <div style={{ marginBottom: "24px" }}>
            <FilterChips
              options={muscleGroups}
              active={filter}
              onChange={setFilter}
            />
          </div>
        )}

        {/* States */}
        {loading && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "16px",
            }}
          >
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: "180px",
                  borderRadius: "12px",
                  background: "#161a24",
                  border: "1px solid #1e2130",
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
              />
            ))}
          </div>
        )}

        {error && (
          <div
            style={{
              padding: "20px 24px",
              borderRadius: "12px",
              border: "1px solid rgba(239,68,68,0.3)",
              background: "rgba(239,68,68,0.06)",
              color: "#ef4444",
              fontSize: "13px",
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && plans.length === 0 && (
          <div
            style={{
              padding: "48px",
              borderRadius: "12px",
              border: "1px dashed #1e2130",
              textAlign: "center",
            }}
          >
            <p style={{ color: "#4a5568", fontSize: "13px", marginBottom: "8px" }}>
              No workout plans yet.
            </p>
            <p style={{ color: "#2d3748", fontSize: "12px" }}>
              Create your first plan to get started.
            </p>
          </div>
        )}

        {!loading && !error && filteredPlans.length > 0 && (
          <>
            <p
              style={{
                fontSize: "11px",
                color: "#4a5568",
                marginBottom: "16px",
              }}
            >
              {filteredPlans.length} PLAN{filteredPlans.length !== 1 ? "S" : ""}
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: "16px",
              }}
            >
              {filteredPlans.map((plan) => (
                <WorkoutCard
                  key={plan.id}
                  plan={plan}
                  onStart={() => handleStartSession(plan.id)}
                  starting={startingPlanId === plan.id}
                />
              ))}
            </div>
          </>
        )}

        {!loading && !error && filteredPlans.length === 0 && plans.length > 0 && (
          <div
            style={{
              padding: "32px",
              borderRadius: "12px",
              border: "1px dashed #1e2130",
              textAlign: "center",
              color: "#4a5568",
              fontSize: "13px",
            }}
          >
            No plans match this filter.
          </div>
        )}

      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {showModal && (
        <CreatePlanModal
          onClose={() => setShowModal(false)}
          onCreated={handlePlanCreated}
        />
      )}

      {/* ── Pre-workout mood picker ── */}
      {moodPlanId && (
        <>
          <div
            onClick={() => setMoodPlanId(null)}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0,0,0,0.65)",
              zIndex: 50,
            }}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-label="How are you feeling?"
            style={{
              position: "fixed",
              top: "50%", left: "50%",
              transform: "translate(-50%,-50%)",
              background: "#161a24",
              border: "1px solid #1e2130",
              borderRadius: "16px",
              padding: "28px 32px",
              zIndex: 60,
              width: "min(380px, 90vw)",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: "11px", color: "#4a5568", letterSpacing: "0.1em", marginBottom: "8px" }}>PRE-WORKOUT</p>
            <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#f0f4f8", marginBottom: "24px" }}>How are you feeling?</h2>
            <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginBottom: "24px" }}>
              {MOOD_OPTIONS.map(({ value, emoji, label }) => (
                <button
                  key={value}
                  onClick={() => setMoodBefore(moodBefore === value ? null : value)}
                  title={label}
                  aria-label={label}
                  style={{
                    fontSize: "26px",
                    padding: "8px",
                    borderRadius: "10px",
                    border: `2px solid ${moodBefore === value ? "#c8f135" : "transparent"}`,
                    background: moodBefore === value ? "rgba(200,241,53,0.1)" : "transparent",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    lineHeight: 1,
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            {moodBefore && (
              <p style={{ fontSize: "12px", color: "#c8f135", marginBottom: "16px", fontWeight: "600" }}>
                {MOOD_OPTIONS.find(m => m.value === moodBefore)?.label}
              </p>
            )}
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => confirmStart(null)}
                style={{
                  flex: 1, padding: "10px", borderRadius: "8px",
                  border: "1px solid #2d3748", background: "transparent",
                  color: "#4a5568", fontSize: "12px", cursor: "pointer",
                }}
              >
                Skip
              </button>
              <button
                onClick={() => confirmStart(moodBefore)}
                disabled={!moodBefore}
                style={{
                  flex: 2, padding: "10px", borderRadius: "8px",
                  border: "none",
                  background: moodBefore ? "#c8f135" : "#2d3748",
                  color: moodBefore ? "#0f1117" : "#4a5568",
                  fontSize: "13px", fontWeight: "700",
                  cursor: moodBefore ? "pointer" : "not-allowed",
                  transition: "all 0.15s ease",
                }}
                aria-label="Start workout session"
              >
                Start Workout
              </button>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
