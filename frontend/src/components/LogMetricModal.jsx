// src/components/LogMetricModal.jsx
import { useState, useEffect, useRef } from "react";
import { logDailyMetrics, logBodyMeasurements } from "../api/client";

// ─── Inject styles once ───────────────────────────────────────────────────────
const STYLE_ID = "log-metric-modal-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    .lm-input:focus { border-color: rgba(200,241,53,0.4) !important; }
    .lm-tab-active { border-bottom: 2px solid #c8f135 !important; color: #f0f4f8 !important; }
    .lm-tab:hover:not(.lm-tab-active) { color: #8892a4 !important; }
    .lm-submit:hover:not(:disabled) { background: #d4f53c !important; }
    .lm-cancel:hover { color: #f0f4f8 !important; }
  `;
  document.head.appendChild(s);
}

// ─── Field configs ────────────────────────────────────────────────────────────
// Mapped 1:1 to DailyMetricsCreate and BodyMeasurementCreate
const DAILY_FIELDS = [
  { key: "steps",               label: "Steps",              unit: "steps", type: "integer", min: 0,   max: 100000 },
  { key: "calories_burned",     label: "Calories Burned",    unit: "kcal",  type: "integer", min: 0,   max: 10000  },
  { key: "calories_consumed",   label: "Calories Consumed",  unit: "kcal",  type: "integer", min: 0,   max: 20000  },
  { key: "sleep_hours",         label: "Sleep",              unit: "hrs",   type: "float",   min: 0,   max: 24     },
  { key: "water_ml",            label: "Water",              unit: "ml",    type: "integer", min: 0,   max: 20000  },
  { key: "resting_heart_rate",  label: "Resting Heart Rate", unit: "bpm",   type: "integer", min: 20,  max: 250    },
];

const BODY_FIELDS = [
  { key: "weight_kg",      label: "Weight",       unit: "kg",  type: "float", min: 0,  max: 500 },
  { key: "body_fat_pct",   label: "Body Fat",     unit: "%",   type: "float", min: 0,  max: 100 },
  { key: "muscle_mass_kg", label: "Muscle Mass",  unit: "kg",  type: "float", min: 0,  max: 500 },
  { key: "chest_cm",       label: "Chest",        unit: "cm",  type: "float", min: 0,  max: 300 },
  { key: "waist_cm",       label: "Waist",        unit: "cm",  type: "float", min: 0,  max: 300 },
  { key: "hips_cm",        label: "Hips",         unit: "cm",  type: "float", min: 0,  max: 300 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const emptyForm = (fields) =>
  Object.fromEntries(fields.map((f) => [f.key, ""]));

const parseField = (value, type) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const n = type === "integer" ? parseInt(value, 10) : parseFloat(value);
  return isNaN(n) ? undefined : n;
};

const buildPayload = (form, fields) => {
  const payload = {};
  fields.forEach(({ key, type }) => {
    const parsed = parseField(form[key], type);
    if (parsed !== undefined) payload[key] = parsed;
  });
  return payload;
};

const hasAtLeastOne = (payload) => Object.keys(payload).length > 0;

// ─── FieldRow ─────────────────────────────────────────────────────────────────
function FieldRow({ field, value, onChange }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 96px 40px",
        alignItems: "center",
        gap: "10px",
      }}
    >
      <label
        htmlFor={`lm-${field.key}`}
        style={{ fontSize: "12px", color: "#8892a4", fontWeight: "500" }}
      >
        {field.label}
      </label>
      <input
        id={`lm-${field.key}`}
        className="lm-input"
        type="number"
        min={field.min}
        max={field.max}
        step={field.type === "float" ? "0.1" : "1"}
        placeholder="—"
        value={value}
        onChange={(e) => onChange(field.key, e.target.value)}
        style={{
          background: "#0f1117",
          border: "1px solid #1e2130",
          borderRadius: "6px",
          color: "#f0f4f8",
          fontSize: "13px",
          fontWeight: "600",
          padding: "7px 10px",
          outline: "none",
          textAlign: "right",
          transition: "border-color 0.15s ease",
          width: "100%",
          boxSizing: "border-box",
        }}
        aria-label={`${field.label} in ${field.unit}`}
      />
      <span style={{ fontSize: "11px", color: "#4a5568", textAlign: "left" }}>
        {field.unit}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
/**
 * Props:
 *   onClose     fn()           — called when modal should close
 *   onSaved     fn(tab)        — called after successful save; tab = "daily" | "body"
 */
export default function LogMetricModal({ onClose, onSaved }) {
  const [tab, setTab] = useState("daily"); // "daily" | "body"
  const [dailyForm, setDailyForm] = useState(() => emptyForm(DAILY_FIELDS));
  const [bodyForm, setBodyForm] = useState(() => emptyForm(BODY_FIELDS));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape" && typeof onClose === "function") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Reset form + feedback when tab changes
  useEffect(() => {
    setError(null);
    setSuccess(false);
  }, [tab]);

  // ── Field change handlers ──────────────────────────────────────────────────
  const handleDailyChange = (key, value) => {
    setError(null);
    setDailyForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleBodyChange = (key, value) => {
    setError(null);
    setBodyForm((prev) => ({ ...prev, [key]: value }));
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (submitting) return;

    const isDaily = tab === "daily";
    const fields = isDaily ? DAILY_FIELDS : BODY_FIELDS;
    const form = isDaily ? dailyForm : bodyForm;
    const payload = buildPayload(form, fields);

    // Client-side: at least one field required (mirrors backend validator)
    if (!hasAtLeastOne(payload)) {
      setError("Enter at least one value before saving.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (isDaily) {
        await logDailyMetrics(payload);
      } else {
        await logBodyMeasurements(payload);
      }

      if (!mountedRef.current) return;

      setSuccess(true);

      // Brief success flash, then close and notify parent
      setTimeout(() => {
        if (!mountedRef.current) return;
        if (typeof onSaved === "function") onSaved(tab);
        if (typeof onClose === "function") onClose();
      }, 800);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err?.message ?? "Failed to save. Please try again.");
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const currentForm = tab === "daily" ? dailyForm : bodyForm;
  const currentFields = tab === "daily" ? DAILY_FIELDS : BODY_FIELDS;
  const currentHandler = tab === "daily" ? handleDailyChange : handleBodyChange;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => { if (!submitting && typeof onClose === "function") onClose(); }}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.65)",
          zIndex: 40,
        }}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-label="Log metrics"
        aria-modal="true"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "100%",
          maxWidth: "440px",
          background: "#161a24",
          border: "1px solid #1e2130",
          borderRadius: "16px",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px 0",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <span style={{ fontSize: "15px", fontWeight: "700", color: "#f0f4f8" }}>
              Log Metrics
            </span>
            <button
              onClick={() => { if (!submitting && typeof onClose === "function") onClose(); }}
              style={{
                background: "transparent",
                border: "none",
                color: "#4a5568",
                fontSize: "20px",
                cursor: submitting ? "not-allowed" : "pointer",
                lineHeight: 1,
                padding: 0,
              }}
              aria-label="Close modal"
            >
              ×
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #1e2130" }}>
            {[
              { id: "daily", label: "Daily Metrics" },
              { id: "body",  label: "Body Measurements" },
            ].map((t) => (
              <button
                key={t.id}
                className={`lm-tab${tab === t.id ? " lm-tab-active" : ""}`}
                onClick={() => setTab(t.id)}
                disabled={submitting}
                style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: "2px solid transparent",
                  padding: "8px 16px",
                  fontSize: "12px",
                  fontWeight: "600",
                  color: tab === t.id ? "#f0f4f8" : "#4a5568",
                  cursor: submitting ? "not-allowed" : "pointer",
                  transition: "color 0.15s ease",
                  marginBottom: "-1px",
                }}
                aria-selected={tab === t.id}
                role="tab"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Fields */}
        <div
          style={{
            padding: "20px 24px",
            overflowY: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          {currentFields.map((field) => (
            <FieldRow
              key={field.key}
              field={field}
              value={currentForm[field.key]}
              onChange={currentHandler}
            />
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #1e2130",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          {/* Error */}
          {error && (
            <p style={{ fontSize: "12px", color: "#ef4444", margin: 0 }}>
              {error}
            </p>
          )}

          {/* Success */}
          {success && (
            <p style={{ fontSize: "12px", color: "#c8f135", margin: 0 }}>
              ✓ Saved!
            </p>
          )}

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              className="lm-cancel"
              onClick={() => { if (!submitting && typeof onClose === "function") onClose(); }}
              disabled={submitting}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid #1e2130",
                background: "transparent",
                color: "#4a5568",
                fontSize: "13px",
                fontWeight: "600",
                cursor: submitting ? "not-allowed" : "pointer",
                transition: "color 0.15s ease",
              }}
            >
              Cancel
            </button>

            <button
              className="lm-submit"
              onClick={handleSubmit}
              disabled={submitting || success}
              style={{
                flex: 2,
                padding: "10px",
                borderRadius: "8px",
                border: "none",
                background: success ? "rgba(200,241,53,0.2)" : "#c8f135",
                color: success ? "#c8f135" : "#0f1117",
                fontSize: "13px",
                fontWeight: "700",
                cursor: submitting || success ? "not-allowed" : "pointer",
                letterSpacing: "0.04em",
                transition: "background 0.15s ease",
              }}
              aria-label={`Save ${tab === "daily" ? "daily metrics" : "body measurements"}`}
            >
              {submitting ? "Saving…" : success ? "Saved ✓" : "SAVE"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}