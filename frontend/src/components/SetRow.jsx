// src/components/SetRow.jsx

const DEFAULT_DATA = { reps: "", weight_kg: "", done: false };

export default function SetRow({ setNumber, data = DEFAULT_DATA, onChange, onDelete, disabled = false }) {
  // Fix #3 — safe fallback if data is undefined
  const safeData = data ?? DEFAULT_DATA;
  const isComplete = safeData.done;

  // Fix #6 — guard onChange before calling
  const handleField = (field, value) => {
    if (typeof onChange !== "function") return;
    onChange({ ...safeData, [field]: value });
  };

  // Fix #2 + #7 — parse to number or fall back to "" for empty string
  const handleNumeric = (field, raw) => {
    const parsed = raw === "" ? "" : parseFloat(raw);
    handleField(field, isNaN(parsed) ? "" : parsed);
  };

  // Fix #5 — guard onDelete
  const handleDelete = () => {
    if (typeof onDelete === "function") onDelete();
  };

  // Fix #1 — guarantee inputs never receive undefined/null
  const repsValue = safeData.reps ?? "";
  const weightValue = safeData.weight_kg ?? "";

  const inputBase = {
    background: "#0f1117",
    border: "1px solid #1e2130",
    borderRadius: "6px",
    color: "#f0f4f8",
    fontSize: "13px",
    fontWeight: "600",
    textAlign: "center",
    width: "64px",
    padding: "6px 8px",
    outline: "none",
    transition: "border-color 0.15s ease",
  };

  // Fix #4 — CSS-based hover using a style tag, no DOM mutation
  const hoverStyleId = "set-row-hover-styles";
  if (typeof document !== "undefined" && !document.getElementById(hoverStyleId)) {
    const style = document.createElement("style");
    style.id = hoverStyleId;
    style.textContent = `
      .set-row-delete:hover { color: #e53e3e !important; }
      .set-row-input:focus { border-color: rgba(200,241,53,0.4) !important; }
    `;
    document.head.appendChild(style);
  }

  return (
    // Fix #8 — key must be applied by the parent mapping over SetRow, documented here in comment
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "32px 1fr 1fr 36px 28px",
        alignItems: "center",
        gap: "10px",
        padding: "8px 12px",
        borderRadius: "8px",
        background: isComplete ? "rgba(200,241,53,0.04)" : "transparent",
        border: "1px solid",
        borderColor: isComplete ? "rgba(200,241,53,0.15)" : "transparent",
        transition: "all 0.15s ease",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {/* Set number */}
      <span
        style={{
          fontSize: "12px",
          color: "#4a5568",
          fontWeight: "700",
          textAlign: "center",
        }}
      >
        {setNumber}
      </span>

      {/* Reps input */}
      <input
        type="number"
        min="0"
        placeholder="—"
        value={repsValue}          // Fix #1
        onChange={(e) => handleNumeric("reps", e.target.value)}  // Fix #2 #7
        disabled={disabled}
        className="set-row-input"  // Fix #4
        style={inputBase}
        aria-label={`Set ${setNumber} reps`}  // Fix #9
      />

      {/* Weight input */}
      <input
        type="number"
        min="0"
        step="0.5"
        placeholder="—"
        value={weightValue}        // Fix #1
        onChange={(e) => handleNumeric("weight_kg", e.target.value)}  // Fix #2 #7
        disabled={disabled}
        className="set-row-input"  // Fix #4
        style={inputBase}
        aria-label={`Set ${setNumber} weight in kg`}  // Fix #9
      />

      {/* Done toggle */}
      <button
        onClick={() => handleField("done", !isComplete)}
        disabled={disabled}
        aria-label={isComplete ? `Mark set ${setNumber} incomplete` : `Mark set ${setNumber} complete`}  // Fix #9
        aria-pressed={isComplete}   // Fix #9 — communicates toggle state to screen readers
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "6px",
          border: "1px solid",
          borderColor: isComplete ? "#c8f135" : "#2d3748",
          background: isComplete ? "#c8f135" : "transparent",
          color: isComplete ? "#0f1117" : "#4a5568",
          fontSize: "13px",
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s ease",
          flexShrink: 0,
        }}
      >
        ✓
      </button>

      {/* Delete */}
      <button
        onClick={handleDelete}     // Fix #5
        disabled={disabled}
        aria-label={`Delete set ${setNumber}`}  // Fix #9
        className="set-row-delete" // Fix #4
        style={{
          width: "24px",
          height: "24px",
          borderRadius: "4px",
          border: "none",
          background: "transparent",
          color: "#2d3748",
          fontSize: "16px",
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
          transition: "color 0.15s ease",
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}