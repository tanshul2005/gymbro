// src/pages/Dashboard.jsx
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { getDashboardSummary } from "../api/client";

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatCard = ({ label, value, unit, sub, accent = false, loading = false }) => (
  <div
    style={{
      background: accent ? "rgba(200,241,53,0.06)" : "#161a24",
      border: `1px solid ${accent ? "rgba(200,241,53,0.2)" : "#1e2130"}`,
      borderRadius: "12px",
      padding: "20px 24px",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
    }}
  >
    <p style={{ fontSize: "11px", color: "#4a5568", letterSpacing: "0.1em" }}>
      {label}
    </p>
    <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
      {loading ? (
        <div
          style={{
            width: "60px",
            height: "28px",
            borderRadius: "6px",
            background: "#1e2130",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      ) : (
        <span
          style={{
            fontSize: "28px",
            fontWeight: "700",
            color: accent ? "#c8f135" : "#f0f4f8",
            lineHeight: 1,
          }}
        >
          {value ?? "—"}
        </span>
      )}
      {!loading && unit && (
        <span style={{ fontSize: "13px", color: "#4a5568" }}>{unit}</span>
      )}
    </div>
    {sub && (
      <p style={{ fontSize: "11px", color: "#4a5568" }}>{sub}</p>
    )}
  </div>
);

const SectionHeader = ({ title, action, actionPath }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "16px",
    }}
  >
    <h2
      style={{
        fontSize: "12px",
        fontWeight: "600",
        color: "#4a5568",
        letterSpacing: "0.1em",
      }}
    >
      {title}
    </h2>
    {action && actionPath && (
      <Link
        to={actionPath}
        style={{
          fontSize: "11px",
          color: "#c8f135",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "'DM Mono', monospace",
          textDecoration: "none",
        }}
      >
        {action}
      </Link>
    )}
  </div>
);

const EmptyState = ({ message }) => (
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
    {message}
  </div>
);

const SessionCard = ({ session }) => {
  const date = session.started_at
    ? new Date(session.started_at).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "Unknown date";

  return (
    <div
      style={{
        background: "#161a24",
        border: "1px solid #1e2130",
        borderRadius: "10px",
        padding: "14px 18px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div>
        <p style={{ fontSize: "13px", fontWeight: "600", color: "#f0f4f8", marginBottom: "3px" }}>
          {session.name}
        </p>
        <p style={{ fontSize: "11px", color: "#4a5568" }}>
          {date} · {session.exercise_count} exercise{session.exercise_count !== 1 ? "s" : ""}
        </p>
      </div>
      {session.duration_mins != null && (
        <span
          style={{
            fontSize: "12px",
            fontWeight: "600",
            color: "#c8f135",
            background: "rgba(200,241,53,0.08)",
            border: "1px solid rgba(200,241,53,0.15)",
            borderRadius: "6px",
            padding: "3px 8px",
          }}
        >
          {session.duration_mins}m
        </span>
      )}
    </div>
  );
};

const WeightChangeChip = ({ value }) => {
  if (value == null) return <span style={{ color: "#f0f4f8", fontSize: "28px", fontWeight: 700, lineHeight: 1 }}>—</span>;
  const positive = value > 0;
  const color = positive ? "#f87171" : "#c8f135";
  const sign = positive ? "+" : "";
  return (
    <span style={{ fontSize: "28px", fontWeight: "700", color, lineHeight: 1 }}>
      {sign}{value}
    </span>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    const fetch = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await getDashboardSummary(controller.signal);
        setData(res.data);
      } catch (err) {
        if (!err.isCancelled) setError(err.message || "Failed to load dashboard.");
      } finally {
        setLoading(false);
      }
    };

    fetch();
    return () => controller.abort();
  }, []);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const username = user?.email ? user.email.split("@")[0] : "Athlete";

  const today    = data?.today    ?? {};
  const progress = data?.progress ?? {};
  const sessions = data?.recent_sessions ?? [];
  const tip      = data?.latest_tip ?? null;

  return (
    <Layout>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <div style={{ padding: "36px 40px", maxWidth: "1100px", width: "100%" }}>

        {/* Header */}
        <div style={{ marginBottom: "36px" }}>
          <p style={{ fontSize: "12px", color: "#4a5568", marginBottom: "6px" }}>
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          <h1
            style={{
              fontSize: "26px",
              fontWeight: "700",
              color: "#f0f4f8",
              letterSpacing: "-0.02em",
            }}
          >
            {greeting()},{" "}
            <span style={{ color: "#c8f135" }}>{username}</span>
          </h1>
        </div>

        {/* Error banner */}
        {error && (
          <div
            style={{
              marginBottom: "24px",
              padding: "12px 16px",
              borderRadius: "8px",
              background: "rgba(248,113,113,0.08)",
              border: "1px solid rgba(248,113,113,0.2)",
              color: "#f87171",
              fontSize: "13px",
            }}
          >
            {error}
          </div>
        )}

        {/* Today's Snapshot */}
        <div style={{ marginBottom: "36px" }}>
          <SectionHeader title="TODAY'S SNAPSHOT" />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "12px",
            }}
          >
            <StatCard
              label="STEPS"
              value={today.steps?.toLocaleString() ?? null}
              sub="Goal: 10,000"
              accent
              loading={loading}
            />
            <StatCard
              label="CALORIES BURNED"
              value={today.calories_burned}
              unit="kcal"
              loading={loading}
            />
            <StatCard
              label="SLEEP"
              value={today.sleep_hours}
              unit="hrs"
              loading={loading}
            />
            <StatCard
              label="WATER"
              value={today.water_ml ? Math.round(today.water_ml) : null}
              unit="ml"
              loading={loading}
            />
          </div>
        </div>

        {/* Middle row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "24px",
            marginBottom: "36px",
          }}
        >
          {/* Progress */}
          <div>
            <SectionHeader title="PROGRESS" />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "12px",
              }}
            >
              <StatCard
                label="CURRENT STREAK"
                value={progress.current_streak ?? null}
                unit="days"
                loading={loading}
              />
              <StatCard
                label="WORKOUTS THIS MONTH"
                value={progress.workouts_this_month ?? null}
                loading={loading}
              />
              <StatCard
                label="WEIGHT"
                value={progress.weight_kg ?? null}
                unit="kg"
                loading={loading}
              />
              {/* Weight change — green if loss, red if gain */}
              <div
                style={{
                  background: "#161a24",
                  border: "1px solid #1e2130",
                  borderRadius: "12px",
                  padding: "20px 24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <p style={{ fontSize: "11px", color: "#4a5568", letterSpacing: "0.1em" }}>
                  WEIGHT CHANGE
                </p>
                <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                  {loading ? (
                    <div style={{ width: "60px", height: "28px", borderRadius: "6px", background: "#1e2130", animation: "pulse 1.5s ease-in-out infinite" }} />
                  ) : (
                    <>
                      <WeightChangeChip value={progress.weight_change_kg} />
                      {progress.weight_change_kg != null && (
                        <span style={{ fontSize: "13px", color: "#4a5568" }}>kg</span>
                      )}
                    </>
                  )}
                </div>
                <p style={{ fontSize: "11px", color: "#4a5568" }}>last 30 days</p>
              </div>
            </div>
          </div>

          {/* Recent Workouts */}
          <div>
            <SectionHeader title="RECENT WORKOUTS" action="View all →" actionPath="/workouts" />
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    style={{
                      height: "62px",
                      borderRadius: "10px",
                      background: "#161a24",
                      border: "1px solid #1e2130",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <EmptyState message="No workouts logged yet. Start your first session." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {sessions.map((s) => (
                  <SessionCard key={s.id} session={s} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* AI Tip */}
        {(loading || tip) && (
          <div style={{ marginBottom: "36px" }}>
            <SectionHeader title="LATEST AI TIP" action="Open chat →" actionPath="/chat" />
            {loading ? (
              <div
                style={{
                  height: "64px",
                  borderRadius: "12px",
                  background: "#161a24",
                  border: "1px solid #1e2130",
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
              />
            ) : (
              <div
                style={{
                  padding: "16px 20px",
                  borderRadius: "12px",
                  background: "rgba(200,241,53,0.04)",
                  border: "1px solid rgba(200,241,53,0.12)",
                  fontSize: "13px",
                  color: "#cbd5e1",
                  lineHeight: "1.6",
                }}
              >
                {tip}
              </div>
            )}
          </div>
        )}

        {/* Quick Actions */}
        <div>
          <SectionHeader title="QUICK ACTIONS" />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "12px",
            }}
          >
            {[
              { label: "Log Today's Metrics", sub: "Steps, sleep, calories", path: "/metrics" },
              { label: "Start a Workout",     sub: "Begin a new session",    path: "/workouts" },
              { label: "Ask AI Coach",        sub: "Get personalized advice", path: "/chat"    },
            ].map((action) => (
              <Link
                key={action.path}
                to={action.path}
                style={{
                  display: "block",
                  padding: "18px 20px",
                  borderRadius: "12px",
                  border: "1px solid #1e2130",
                  background: "#161a24",
                  textDecoration: "none",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(200,241,53,0.3)";
                  e.currentTarget.style.background   = "rgba(200,241,53,0.04)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#1e2130";
                  e.currentTarget.style.background   = "#161a24";
                }}
              >
                <p style={{ fontSize: "13px", fontWeight: "600", color: "#f0f4f8", marginBottom: "4px" }}>
                  {action.label}
                </p>
                <p style={{ fontSize: "11px", color: "#4a5568" }}>{action.sub}</p>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </Layout>
  );
}
