// src/pages/Progress.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "../components/Layout";
import MetricCard from "../components/MetricCard";
import MetricChart from "../components/MetricChart";
import LogMetricModal from "../components/LogMetricModal";
import { getDailyMetrics, getMetricsSummary } from "../api/client";

// ─── Inject styles once ───────────────────────────────────────────────────────
const STYLE_ID = "progress-page-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    .pg-log-btn:hover { background: rgba(200,241,53,0.12) !important; border-color: rgba(200,241,53,0.4) !important; }
    .pg-chart-tab:hover:not(.pg-chart-tab-active) { color: #8892a4 !important; }
    @keyframes pg-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
  `;
  document.head.appendChild(s);
}

// ─── Chart tab config ─────────────────────────────────────────────────────────
// Maps to DailyMetricsResponse fields
const CHART_TABS = [
  { key: "steps",             label: "Steps",     unit: "steps" },
  { key: "calories_burned",   label: "Calories",  unit: "kcal"  },
  { key: "sleep_hours",       label: "Sleep",     unit: "hrs"   },
  { key: "water_ml",          label: "Water",     unit: "ml"    },
  { key: "resting_heart_rate",label: "Heart Rate",unit: "bpm"   },
];

// ─── Trend derivation ─────────────────────────────────────────────────────────
// Compares latest vs average → "up" | "down" | "neutral"
const deriveTrend = (latest, avg) => {
  if (latest === null || latest === undefined) return null;
  if (avg === null || avg === undefined) return null;
  const diff = latest - avg;
  if (Math.abs(diff) < 0.01) return "neutral";
  return diff > 0 ? "up" : "down";
};

// weight_change_kg: positive = gained, negative = lost
const weightTrend = (changeKg) => {
  if (changeKg === null || changeKg === undefined) return null;
  if (Math.abs(changeKg) < 0.01) return "neutral";
  return changeKg > 0 ? "up" : "down";
};

// ─── Skeleton card ────────────────────────────────────────────────────────────
const SkeletonCard = () => (
  <div
    style={{
      background: "#161a24",
      border: "1px solid #1e2130",
      borderRadius: "12px",
      padding: "20px",
      height: "96px",
      animation: "pg-pulse 1.5s ease-in-out infinite",
    }}
    aria-label="Loading"
  />
);

export default function Progress() {
  // ── Data state ─────────────────────────────────────────────────────────────
  const [summary, setSummary] = useState(null);
  const [dailyMetrics, setDailyMetrics] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(null);
  const [metricsError, setMetricsError] = useState(null);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [activeChart, setActiveChart] = useState("steps");

  // ── Abort refs ─────────────────────────────────────────────────────────────
  const mountedRef = useRef(true);
  const summaryControllerRef = useRef(null);
  const metricsControllerRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      summaryControllerRef.current?.abort();
      metricsControllerRef.current?.abort();
    };
  }, []);

  // ── Fetch summary ──────────────────────────────────────────────────────────
  const fetchSummary = useCallback(async () => {
    summaryControllerRef.current?.abort();
    const controller = new AbortController();
    summaryControllerRef.current = controller;

    setSummaryLoading(true);
    setSummaryError(null);

    try {
      const res = await getMetricsSummary(controller.signal);
      if (!mountedRef.current) return;
      setSummary(res.data);
    } catch (err) {
      if (!mountedRef.current || err?.isCancelled) return;
      setSummaryError(err?.message ?? "Failed to load summary.");
    } finally {
      if (mountedRef.current) setSummaryLoading(false);
    }
  }, []);

  // ── Fetch daily metrics (last 30 days) ─────────────────────────────────────
  const fetchDailyMetrics = useCallback(async () => {
    metricsControllerRef.current?.abort();
    const controller = new AbortController();
    metricsControllerRef.current = controller;

    setMetricsLoading(true);
    setMetricsError(null);

    try {
      const res = await getDailyMetrics({ limit: 30 }, controller.signal);
      if (!mountedRef.current) return;
      setDailyMetrics(res.data ?? []);
    } catch (err) {
      if (!mountedRef.current || err?.isCancelled) return;
      setMetricsError(err?.message ?? "Failed to load metrics.");
    } finally {
      if (mountedRef.current) setMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    fetchDailyMetrics();
  }, [fetchSummary, fetchDailyMetrics]);

  // ── Modal saved callback — selective refetch ───────────────────────────────
  const handleSaved = useCallback((tab) => {
    if (tab === "daily") {
      fetchSummary();
      fetchDailyMetrics();
    } else {
      // body measurements only affect summary cards
      fetchSummary();
    }
  }, [fetchSummary, fetchDailyMetrics]);

  // ── Derived trend values ───────────────────────────────────────────────────
  const trends = summary
    ? {
        weight:   weightTrend(summary.weight_change_kg),
        bodyFat:  null, // no historical avg in summary — omit
        steps:    deriveTrend(summary.latest_steps, summary.avg_steps),
        calories: deriveTrend(summary.latest_calories_burned, summary.avg_calories_burned),
        sleep:    null, // avg sleep has no "latest" comparator in summary
        streak:   null,
      }
    : {};

  // ── Sub-value strings ──────────────────────────────────────────────────────
  const subValues = summary
    ? {
        weight: summary.weight_change_kg !== null && summary.weight_change_kg !== undefined
          ? `${summary.weight_change_kg > 0 ? "+" : ""}${summary.weight_change_kg?.toFixed(1)} kg change`
          : null,
        steps: summary.avg_steps !== null && summary.avg_steps !== undefined
          ? `avg ${Math.round(summary.avg_steps).toLocaleString()} steps`
          : null,
        calories: summary.avg_calories_burned !== null && summary.avg_calories_burned !== undefined
          ? `avg ${Math.round(summary.avg_calories_burned).toLocaleString()} kcal`
          : null,
        sleep: summary.avg_sleep_hours !== null && summary.avg_sleep_hours !== undefined
          ? `avg ${summary.avg_sleep_hours?.toFixed(1)} hrs`
          : null,
        streak: summary.longest_streak
          ? `best ${summary.longest_streak} days`
          : null,
      }
    : {};

  return (
    <Layout>
      <div style={{ padding: "36px 40px", maxWidth: "1000px", width: "100%" }}>

        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "32px",
          }}
        >
          <div>
            <p style={{ fontSize: "11px", color: "#4a5568", letterSpacing: "0.1em", marginBottom: "6px" }}>
              TRACKING
            </p>
            <h1 style={{ fontSize: "26px", fontWeight: "700", color: "#f0f4f8", letterSpacing: "-0.02em" }}>
              Progress
            </h1>
          </div>

          <button
            className="pg-log-btn"
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
              transition: "all 0.15s ease",
            }}
            aria-label="Log today's metrics"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Log Today
          </button>
        </div>

        {/* ── Summary error ── */}
        {summaryError && (
          <div
            style={{
              padding: "14px 18px",
              borderRadius: "10px",
              border: "1px solid rgba(239,68,68,0.3)",
              background: "rgba(239,68,68,0.06)",
              color: "#ef4444",
              fontSize: "13px",
              marginBottom: "24px",
            }}
          >
            {summaryError}
          </div>
        )}

        {/* ── Metric cards grid ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "14px",
            marginBottom: "36px",
          }}
        >
          {summaryLoading ? (
            // Skeleton placeholders
            [1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <MetricCard
                label="Weight"
                value={summary?.latest_weight_kg ?? null}
                unit="kg"
                subValue={subValues.weight}
                trend={trends.weight}
                trendPositive={false}
                accent
              />
              <MetricCard
                label="Body Fat"
                value={summary?.latest_body_fat_pct ?? null}
                unit="%"
                trend={trends.bodyFat}
                trendPositive={false}
              />
              <MetricCard
                label="Steps"
                value={summary?.latest_steps ?? null}
                unit="steps"
                subValue={subValues.steps}
                trend={trends.steps}
                trendPositive
              />
              <MetricCard
                label="Sleep"
                value={summary?.avg_sleep_hours ?? null}
                unit="hrs"
                subValue={subValues.sleep}
                trend={trends.sleep}
                trendPositive
              />
              <MetricCard
                label="Calories Burned"
                value={summary?.latest_calories_burned ?? null}
                unit="kcal"
                subValue={subValues.calories}
                trend={trends.calories}
                trendPositive
              />
              <MetricCard
                label="Streak"
                value={summary?.current_streak ?? null}
                unit="days"
                subValue={subValues.streak}
                trend={null}
                trendPositive
                accent
              />
            </>
          )}
        </div>

        {/* ── Workout count strip ── */}
        {!summaryLoading && summary && (
          <div
            style={{
              display: "flex",
              gap: "24px",
              padding: "14px 20px",
              borderRadius: "10px",
              background: "#161a24",
              border: "1px solid #1e2130",
              marginBottom: "36px",
              flexWrap: "wrap",
            }}
          >
            {[
              { label: "Workouts Logged",  value: summary.workout_count },
              { label: "Days Tracked",     value: summary.days_logged   },
              { label: "Longest Streak",   value: `${summary.longest_streak} days` },
              {
                label: "Avg Water",
                value: summary.total_water_ml
                  ? `${(summary.total_water_ml / Math.max(summary.days_logged, 1) / 1000).toFixed(1)} L/day`
                  : "—",
              },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "10px", color: "#4a5568", fontWeight: "700", letterSpacing: "0.08em" }}>
                  {label.toUpperCase()}
                </span>
                <span style={{ fontSize: "18px", fontWeight: "700", color: "#f0f4f8" }}>
                  {value ?? "—"}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Chart section ── */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <p style={{ fontSize: "11px", color: "#4a5568", letterSpacing: "0.1em" }}>
              30-DAY TREND
            </p>

            {/* Chart tab switcher */}
            <div style={{ display: "flex", gap: "4px" }}>
              {CHART_TABS.map((t) => (
                <button
                  key={t.key}
                  className={`pg-chart-tab${activeChart === t.key ? " pg-chart-tab-active" : ""}`}
                  onClick={() => setActiveChart(t.key)}
                  style={{
                    background: activeChart === t.key ? "rgba(200,241,53,0.1)" : "transparent",
                    border: "1px solid",
                    borderColor: activeChart === t.key ? "rgba(200,241,53,0.3)" : "#1e2130",
                    borderRadius: "6px",
                    padding: "5px 12px",
                    fontSize: "11px",
                    fontWeight: "600",
                    color: activeChart === t.key ? "#c8f135" : "#4a5568",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  aria-label={`Show ${t.label} chart`}
                  aria-pressed={activeChart === t.key}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Metrics error */}
          {metricsError && (
            <div
              style={{
                padding: "14px 18px",
                borderRadius: "10px",
                border: "1px solid rgba(239,68,68,0.3)",
                background: "rgba(239,68,68,0.06)",
                color: "#ef4444",
                fontSize: "13px",
                marginBottom: "16px",
              }}
            >
              {metricsError}
            </div>
          )}

          {/* Active chart */}
          {(() => {
            const tab = CHART_TABS.find((t) => t.key === activeChart);
            return (
              <MetricChart
                data={dailyMetrics}
                dataKey={tab.key}
                unit={tab.unit}
                label={`${tab.label} — last 30 days`}
                height={220}
                loading={metricsLoading}
                accent
              />
            );
          })()}
        </div>
      </div>

      {/* ── Log metric modal ── */}
      {showModal && (
        <LogMetricModal
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </Layout>
  );
}