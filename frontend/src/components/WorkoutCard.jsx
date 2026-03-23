export default function WorkoutCard({ plan, onStart, starting = false }) {
  const exerciseCount = plan.plan_exercises?.length ?? 0;

  const formattedDate = new Date(plan.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      style={{
        background: "#161a24",
        border: "1px solid #1e2130",
        borderRadius: "12px",
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        cursor: "pointer",
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(200,241,53,0.25)";
        e.currentTarget.style.background = "rgba(200,241,53,0.03)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#1e2130";
        e.currentTarget.style.background = "#161a24";
      }}
    >
      {/* Plan name + date */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h3
          style={{
            fontSize: "14px",
            fontWeight: "700",
            color: "#f0f4f8",
            letterSpacing: "-0.01em",
            maxWidth: "75%",
          }}
        >
          {plan.name}
        </h3>
        <span style={{ fontSize: "10px", color: "#4a5568" }}>{formattedDate}</span>
      </div>

      {/* Description */}
      {plan.description && (
        <p
          style={{
            fontSize: "12px",
            color: "#8892a4",
            lineHeight: "1.5",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {plan.description}
        </p>
      )}

      {/* Exercise list */}
      {exerciseCount > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {plan.plan_exercises
            .slice()
            .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
            .slice(0, 4)
            .map((ex, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  background: "#0f1117",
                }}
              >
                <span style={{ fontSize: "12px", color: "#8892a4" }}>
                  {ex.exercise_name}
                </span>
                {(ex.sets || ex.reps) && (
                  <span style={{ fontSize: "11px", color: "#4a5568" }}>
                    {ex.sets && `${ex.sets} sets`}
                    {ex.sets && ex.reps && " × "}
                    {ex.reps && `${ex.reps} reps`}
                  </span>
                )}
              </div>
            ))}
          {exerciseCount > 4 && (
            <p style={{ fontSize: "11px", color: "#4a5568", paddingLeft: "10px" }}>
              +{exerciseCount - 4} more exercise{exerciseCount - 4 !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      ) : (
        <p style={{ fontSize: "12px", color: "#2d3748" }}>No exercises added.</p>
      )}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: "4px",
          borderTop: "1px solid #1e2130",
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); if (typeof onStart === "function") onStart(); }}
          disabled={starting}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            fontSize: "11px",
            color: starting ? "#4a5568" : "#c8f135",
            fontWeight: "600",
            cursor: starting ? "not-allowed" : "pointer",
          }}
          aria-label={`Start session for ${plan.name}`}
        >
          {starting ? "Starting…" : "Start Session →"}
        </button>
      </div>
    </div>
  );
}