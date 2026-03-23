// src/components/MetricChart.jsx
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ─── Formatters ───────────────────────────────────────────────────────────────
const formatDate = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  // Guard invalid dates
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const formatValue = (value, unit) => {
  if (value === null || value === undefined) return "—";
  if (typeof value !== "number") return String(value);
  const formatted =
    value >= 1000
      ? value.toLocaleString("en-US", { maximumFractionDigits: 1 })
      : Number.isInteger(value)
      ? String(value)
      : value.toFixed(1);
  return unit ? `${formatted} ${unit}` : formatted;
};

// ─── Custom tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label, unit }) => {
  if (!active || !payload || payload.length === 0) return null;

  const raw = payload[0]?.value;
  if (raw === null || raw === undefined) return null;

  return (
    <div
      style={{
        background: "#161a24",
        border: "1px solid #1e2130",
        borderRadius: "8px",
        padding: "10px 14px",
      }}
    >
      <p style={{ fontSize: "11px", color: "#4a5568", marginBottom: "4px" }}>
        {formatDate(label)}
      </p>
      <p style={{ fontSize: "14px", fontWeight: "700", color: "#c8f135", margin: 0 }}>
        {formatValue(raw, unit)}
      </p>
    </div>
  );
};

// ─── Empty state ──────────────────────────────────────────────────────────────
const EmptyState = ({ message }) => (
  <div
    style={{
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <p style={{ fontSize: "12px", color: "#2d3748" }}>{message}</p>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
/**
 * Props:
 *   data        DailyMetricsResponse[]  — array from GET /metrics/daily
 *   dataKey     string   — field to plot, e.g. "steps", "calories_burned", "sleep_hours"
 *   unit        string   — display unit appended to values, e.g. "steps", "kcal", "hrs"
 *   label       string   — chart title shown above
 *   height      number   — chart height in px (default 200)
 *   loading     bool
 *   accent      bool     — use lime fill (default true)
 */
export default function MetricChart({
  data = [],
  dataKey = "steps",
  unit = "",
  label = "",
  height = 200,
  loading = false,
  accent = true,
}) {
  // ── Guard: filter out entries where the target field is null/undefined ──────
  const cleanData = (data ?? [])
    .filter((d) => d != null && d[dataKey] !== null && d[dataKey] !== undefined)
    .map((d) => ({
      date: d.date ?? "",
      value: typeof d[dataKey] === "number" ? d[dataKey] : null,
    }))
    // Sort ascending by date string — ISO date strings sort correctly lexically
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const fillColor = accent ? "#c8f135" : "#8892a4";
  const strokeColor = accent ? "#c8f135" : "#4a5568";

  return (
    <div
      style={{
        background: "#161a24",
        border: "1px solid #1e2130",
        borderRadius: "12px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      {/* Title */}
      {label && (
        <span
          style={{
            fontSize: "10px",
            fontWeight: "700",
            color: "#4a5568",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
      )}

      {/* Chart area */}
      <div style={{ height: `${height}px`, width: "100%" }}>
        {loading ? (
          <div
            style={{
              height: "100%",
              borderRadius: "8px",
              background: "#1e2130",
              animation: "mc-chart-pulse 1.5s ease-in-out infinite",
            }}
            aria-label="Loading chart"
          />
        ) : cleanData.length < 2 ? (
          <EmptyState
            message={
              cleanData.length === 0
                ? "No data logged yet."
                : "Log at least 2 days to see a trend."
            }
          />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={cleanData}
              margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
            >
              <defs>
                <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={fillColor} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={fillColor} stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1e2130"
                vertical={false}
              />

              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 10, fill: "#4a5568" }}
                axisLine={false}
                tickLine={false}
                // Show max 5 ticks to avoid crowding
                interval={Math.max(0, Math.floor(cleanData.length / 5) - 1)}
              />

              <YAxis
                tick={{ fontSize: 10, fill: "#4a5568" }}
                axisLine={false}
                tickLine={false}
                // v3-stable: tickFormatter as function
                tickFormatter={(v) =>
                  v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
                }
                width={48}
              />

              {/* v3: content prop receives all tooltip props, pass unit through closure */}
              <Tooltip
                content={(props) => <CustomTooltip {...props} unit={unit} />}
                cursor={{ stroke: "#2d3748", strokeWidth: 1 }}
              />

              <Area
                type="monotone"
                dataKey="value"
                stroke={strokeColor}
                strokeWidth={2}
                fill={`url(#grad-${dataKey})`}
                // v3-stable: dot as object, not component
                dot={false}
                activeDot={{
                  r: 4,
                  fill: strokeColor,
                  stroke: "#0f1117",
                  strokeWidth: 2,
                }}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <style>{`
        @keyframes mc-chart-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  );
}