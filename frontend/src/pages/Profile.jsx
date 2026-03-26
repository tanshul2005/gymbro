// src/pages/Profile.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "../components/Layout";
import { getProfile, updateProfile } from "../api/client";

// ─── Inject styles once ───────────────────────────────────────────────────────
const STYLE_ID = "profile-page-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    .pf-input:focus { border-color: rgba(200,241,53,0.4) !important; }
    .pf-select:focus { border-color: rgba(200,241,53,0.4) !important; }
    .pf-save:hover:not(:disabled) { background: #d4f53c !important; }
    .pf-edit:hover { border-color: rgba(200,241,53,0.3) !important; color: #c8f135 !important; }
    @keyframes pf-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
  `;
  document.head.appendChild(s);
}

// ─── Field config ─────────────────────────────────────────────────────────────
const TEXT_FIELDS = [
  { key: "full_name",    label: "Full Name",    type: "text",   placeholder: "Your name"       },
  { key: "age",          label: "Age",          type: "number", placeholder: "—", min: 10, max: 120 },
  { key: "height_cm",    label: "Height",       type: "number", placeholder: "—", min: 50, max: 300, unit: "cm" },
  { key: "weight_kg",    label: "Weight",       type: "number", placeholder: "—", min: 1,  max: 500, unit: "kg" },
  { key: "fitness_goal", label: "Fitness Goal", type: "text",   placeholder: "e.g. Lose weight, Build muscle" },
];

const GENDER_OPTIONS = [
  { value: "",       label: "Prefer not to say" },
  { value: "male",   label: "Male"              },
  { value: "female", label: "Female"            },
  { value: "other",  label: "Other"             },
];

const ACTIVITY_OPTIONS = [
  { value: "",                  label: "Select activity level"   },
  { value: "sedentary",         label: "Sedentary"               },
  { value: "lightly_active",    label: "Lightly Active"          },
  { value: "moderately_active", label: "Moderately Active"       },
  { value: "very_active",       label: "Very Active"             },
  { value: "extra_active",      label: "Extra Active"            },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const profileToForm = (profile) => ({
  full_name:      profile?.full_name      ?? "",
  age:            profile?.age            ?? "",
  gender:         profile?.gender         ?? "",
  height_cm:      profile?.height_cm      ?? "",
  weight_kg:      profile?.weight_kg      ?? "",
  fitness_goal:   profile?.fitness_goal   ?? "",
  activity_level: profile?.activity_level ?? "",
});

const buildPayload = (form) => {
  const payload = {};
  if (form.full_name)      payload.full_name      = form.full_name;
  if (form.fitness_goal)   payload.fitness_goal   = form.fitness_goal;
  if (form.gender)         payload.gender         = form.gender;
  if (form.activity_level) payload.activity_level = form.activity_level;

  const age = parseInt(form.age, 10);
  if (!isNaN(age) && age > 0) payload.age = age;

  const height = parseFloat(form.height_cm);
  if (!isNaN(height) && height > 0) payload.height_cm = height;

  const weight = parseFloat(form.weight_kg);
  if (!isNaN(weight) && weight > 0) payload.weight_kg = weight;

  return payload;
};

const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────
const Skeleton = ({ height = 40 }) => (
  <div
    style={{
      height,
      borderRadius: "8px",
      background: "#1e2130",
      animation: "pf-pulse 1.5s ease-in-out infinite",
    }}
  />
);

// ─── Input row ────────────────────────────────────────────────────────────────
function FieldRow({ field, value, editing, onChange }) {
  const inputStyle = {
    background: editing ? "#0f1117" : "transparent",
    border: "1px solid",
    borderColor: editing ? "#1e2130" : "transparent",
    borderRadius: "8px",
    color: editing ? "#f0f4f8" : (value ? "#f0f4f8" : "#2d3748"),
    fontSize: "13px",
    fontWeight: "600",
    padding: editing ? "8px 12px" : "0",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    transition: "border-color 0.15s ease, background 0.15s ease",
    cursor: editing ? "text" : "default",
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        alignItems: "center",
        gap: "16px",
        padding: "10px 0",
        borderBottom: "1px solid #1e2130",
      }}
    >
      <label
        htmlFor={`pf-${field.key}`}
        style={{
          fontSize: "11px",
          fontWeight: "700",
          color: "#4a5568",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {field.label}
        {field.unit && (
          <span style={{ color: "#2d3748", marginLeft: "4px" }}>({field.unit})</span>
        )}
      </label>

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <input
          id={`pf-${field.key}`}
          className="pf-input"
          type={field.type}
          min={field.min}
          max={field.max}
          placeholder={editing ? (field.placeholder ?? "—") : "—"}
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          disabled={!editing}
          readOnly={!editing}
          style={inputStyle}
          aria-label={field.label}
        />
      </div>
    </div>
  );
}

// ─── Select row ───────────────────────────────────────────────────────────────
function SelectRow({ label, fieldKey, value, options, editing, onChange }) {
  const selected = options.find((o) => o.value === value);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        alignItems: "center",
        gap: "16px",
        padding: "10px 0",
        borderBottom: "1px solid #1e2130",
      }}
    >
      <span
        style={{
          fontSize: "11px",
          fontWeight: "700",
          color: "#4a5568",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>

      {editing ? (
        <select
          className="pf-select"
          value={value}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          style={{
            background: "#0f1117",
            border: "1px solid #1e2130",
            borderRadius: "8px",
            color: value ? "#f0f4f8" : "#4a5568",
            fontSize: "13px",
            fontWeight: "600",
            padding: "8px 12px",
            outline: "none",
            width: "100%",
            cursor: "pointer",
            transition: "border-color 0.15s ease",
          }}
          aria-label={label}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <span
          style={{
            fontSize: "13px",
            fontWeight: "600",
            color: selected?.value ? "#f0f4f8" : "#2d3748",
          }}
        >
          {selected?.label ?? "—"}
        </span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Profile() {
  const [profile, setProfile]   = useState(null);
  const [form, setForm]         = useState(profileToForm(null));
  const [editing, setEditing]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const mountedRef = useRef(true);
  const controllerRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  // ── Fetch profile ──────────────────────────────────────────────────────────
  const fetchProfile = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setLoadError(null);

    try {
      const res = await getProfile(controller.signal);
      if (!mountedRef.current) return;
      setProfile(res.data);
      setForm(profileToForm(res.data));
    } catch (err) {
      if (!mountedRef.current || err?.isCancelled) return;
      setLoadError(err?.message ?? "Failed to load profile.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // ── Field change ───────────────────────────────────────────────────────────
  const handleChange = (key, value) => {
    setSaveError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ── Cancel edit ────────────────────────────────────────────────────────────
  const handleCancel = () => {
    setForm(profileToForm(profile)); // reset to last saved
    setEditing(false);
    setSaveError(null);
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (saving) return;

    const payload = buildPayload(form);
    if (Object.keys(payload).length === 0) {
      setSaveError("No changes to save.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const res = await updateProfile(payload);
      if (!mountedRef.current) return;
      setProfile(res.data);
      setForm(profileToForm(res.data));
      setEditing(false);
      setSaveSuccess(true);
      setTimeout(() => {
        if (mountedRef.current) setSaveSuccess(false);
      }, 3000);
    } catch (err) {
      if (!mountedRef.current) return;
      setSaveError(err?.message ?? "Failed to save profile.");
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div style={{ padding: "36px 40px", maxWidth: "640px", width: "100%", overflowY: "auto", flex: 1 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px" }}>
          <div>
            <p style={{ fontSize: "11px", color: "#4a5568", letterSpacing: "0.1em", marginBottom: "6px" }}>
              ACCOUNT
            </p>
            <h1 style={{ fontSize: "26px", fontWeight: "700", color: "#f0f4f8", letterSpacing: "-0.02em" }}>
              Profile
            </h1>
          </div>

          {!loading && !loadError && (
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {saveSuccess && (
                <span style={{ fontSize: "12px", color: "#c8f135" }}>✓ Saved</span>
              )}
              {!editing ? (
                <button
                  className="pf-edit"
                  onClick={() => { setEditing(true); setSaveSuccess(false); }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid #1e2130",
                    background: "transparent",
                    color: "#8892a4",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  aria-label="Edit profile"
                >
                  Edit
                </button>
              ) : (
                <>
                  <button
                    onClick={handleCancel}
                    disabled={saving}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: "1px solid #1e2130",
                      background: "transparent",
                      color: "#4a5568",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: saving ? "not-allowed" : "pointer",
                    }}
                    aria-label="Cancel editing"
                  >
                    Cancel
                  </button>
                  <button
                    className="pf-save"
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#c8f135",
                      color: "#0f1117",
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: saving ? "not-allowed" : "pointer",
                      opacity: saving ? 0.7 : 1,
                      transition: "background 0.15s ease",
                      letterSpacing: "0.04em",
                    }}
                    aria-label="Save profile changes"
                  >
                    {saving ? "Saving…" : "SAVE"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Load error */}
        {loadError && (
          <div
            style={{
              padding: "16px 20px",
              borderRadius: "10px",
              border: "1px solid rgba(239,68,68,0.3)",
              background: "rgba(239,68,68,0.06)",
              color: "#ef4444",
              fontSize: "13px",
              marginBottom: "24px",
            }}
          >
            {loadError}
          </div>
        )}

        {/* Account info card */}
        {!loading && profile && (
          <div
            style={{
              background: "#161a24",
              border: "1px solid #1e2130",
              borderRadius: "12px",
              padding: "16px 20px",
              marginBottom: "24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "10px", color: "#4a5568", fontWeight: "700", letterSpacing: "0.08em" }}>
                EMAIL
              </span>
              <span style={{ fontSize: "13px", color: "#f0f4f8", fontWeight: "600" }}>
                {profile.email}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "10px", color: "#4a5568", fontWeight: "700", letterSpacing: "0.08em" }}>
                MEMBER SINCE
              </span>
              <span style={{ fontSize: "13px", color: "#f0f4f8", fontWeight: "600" }}>
                {formatDate(profile.created_at)}
              </span>
            </div>
            <div
              style={{
                padding: "4px 10px",
                borderRadius: "20px",
                border: "1px solid rgba(200,241,53,0.2)",
                background: "rgba(200,241,53,0.06)",
                fontSize: "11px",
                fontWeight: "700",
                color: "#c8f135",
              }}
            >
              Active
            </div>
          </div>
        )}

        {/* Profile fields card */}
        <div
          style={{
            background: "#161a24",
            border: "1px solid",
            borderColor: editing ? "rgba(200,241,53,0.15)" : "#1e2130",
            borderRadius: "12px",
            padding: "4px 20px 8px",
            transition: "border-color 0.2s ease",
          }}
        >
          {loading ? (
            <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: "16px" }}>
              {[1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} height={36} />)}
            </div>
          ) : (
            <>
              {TEXT_FIELDS.map((field) => (
                <FieldRow
                  key={field.key}
                  field={field}
                  value={form[field.key]}
                  editing={editing}
                  onChange={handleChange}
                />
              ))}

              <SelectRow
                label="Gender"
                fieldKey="gender"
                value={form.gender}
                options={GENDER_OPTIONS}
                editing={editing}
                onChange={handleChange}
              />

              <SelectRow
                label="Activity Level"
                fieldKey="activity_level"
                value={form.activity_level}
                options={ACTIVITY_OPTIONS}
                editing={editing}
                onChange={handleChange}
              />
            </>
          )}
        </div>

        {/* Save error */}
        {saveError && (
          <p style={{ fontSize: "12px", color: "#ef4444", marginTop: "12px" }}>
            {saveError}
          </p>
        )}

      </div>
    </Layout>
  );
}