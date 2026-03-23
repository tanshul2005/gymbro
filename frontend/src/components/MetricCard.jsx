// src/components/MetricCard.jsx

// ─── Inject hover styles once ─────────────────────────────────────────────────
const STYLE_ID = "metric-card-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `.metric-card { transition: border-color 0.15s ease, background 0.15s ease; }
  .metric-card:hover { border-color: rgba(200,241,53,0.2) !important; background: rgba(200,241,53,0.02) !important; }`;
  document.head.appendChild(s);
}

// ─── Trend arrow ──────────────────────────────────────────────────────────────
// direction: "up" | "down" | "neutral"
// positive:  true if "up" is good for this metric (e.g. steps), false if "up" is bad (e.g. body fat)
const TrendBadge = ({ direction, positive }) => {
  if (!direction || direction === "neutral") return null;

  const isGood = (direction === "up" && positive) || (direction === "down" && !positive);
  const color = isGood ? "#c8f135" : "#ef4444";
  const arrow = direction === "up" ? "↑" : "↓";

  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: "700",
        color,
        background: isGood ? "rgba(200,241,53,0.1)" : "rgba(239,68,68,0.1)",
        borderRadius: "4px",
        padding: "2px 6px",
      }}
      aria-label={`Trend: ${direction}`}
    >
      {arrow}
    </span>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
/**
 * Props:
 *   label      string   — e.g. "Weight"
 *   value      number | string | null  — primary display value
 *   unit       string   — e.g. "kg", "steps", "hrs"
 *   subValue   string   — optional second line, e.g. "avg 7,240 steps"
 *   trend      "up" | "down" | "neutral" | null
 *   trendPositive  bool — true if "up" is a good direction for this metric
 *   loading    bool
 *   accent     bool     — lime highlight variant (for key stats)
 */
export default function MetricCard({
  label = "",
  value = null,
  unit = "",
  subValue = null,
  trend = null,
  trendPositive = true,
  loading = false,
  accent = false,
}) {
  const hasValue = value !== null && value !== undefined && value !== "";

  const displayValue = (() => {
    if (!hasValue) return "—";
    if (typeof value === "number") {
      // Format large numbers with commas, keep decimals where meaningful
      return value >= 1000
        ? value.toLocaleString("en-US", { maximumFractionDigits: 1 })
        : typeof value === "number" && !Number.isInteger(value)
        ? value.toFixed(1)
        : String(value);
    }
    return String(value);
  })();

  return (
    <div
      className="metric-card"
      style={{
        background: accent ? "rgba(200,241,53,0.04)" : "#161a24",
        border: "1px solid",
        borderColor: accent ? "rgba(200,241,53,0.2)" : "#1e2130",
        borderRadius: "12px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        minWidth: 0, // prevent grid blowout
      }}
    >
      {/* Label row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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

        <TrendBadge direction={trend} positive={trendPositive} />
      </div>

      {/* Value row */}
      {loading ? (
        <div
          style={{
            height: "32px",
            borderRadius: "6px",
            background: "#1e2130",
            animation: "mc-pulse 1.5s ease-in-out infinite",
          }}
          aria-label="Loading"
        />
      ) : (
        <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
          <span
            style={{
              fontSize: "28px",
              fontWeight: "700",
              color: accent ? "#c8f135" : "#f0f4f8",
              letterSpacing: "-0.03em",
              lineHeight: 1,
            }}
            aria-label={`${label}: ${displayValue} ${unit}`}
          >
            {displayValue}
          </span>
          {hasValue && unit && (
            <span
              style={{
                fontSize: "13px",
                fontWeight: "600",
                color: "#4a5568",
              }}
            >
              {unit}
            </span>
          )}
        </div>
      )}

      {/* Sub-value */}
      {subValue && !loading && (
        <span
          style={{
            fontSize: "11px",
            color: "#4a5568",
            lineHeight: "1.4",
          }}
        >
          {subValue}
        </span>
      )}

      <style>{`@keyframes mc-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}