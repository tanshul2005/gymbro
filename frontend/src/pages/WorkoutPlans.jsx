import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import WorkoutCard from "../components/WorkoutCard";
import FilterChips from "../components/FilterChips";
import client from "../api/client";

import { useNavigate } from "react-router-dom";
import { startSession } from "../api/client";

export default function WorkoutPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");

  const navigate = useNavigate();
  const [startingPlanId, setStartingPlanId] = useState(null);

  const handleStartSession = async (planId) => {
    if (startingPlanId) return;
    setStartingPlanId(planId);
    try {
      const res = await startSession({ plan_id: planId });
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
      <div style={{ padding: "36px 40px", maxWidth: "1100px", width: "100%" }}>

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
    </Layout>
  );
}