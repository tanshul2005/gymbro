// src/pages/ActiveWorkout.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import ExerciseLogger from "../components/ExerciseLogger";
import {
  getSession,
  completeSession,
  addExerciseToSession,
  getExerciseCatalog,
} from "../api/client";

// ─── Inject hover styles once ─────────────────────────────────────────────────
const STYLE_ID = "active-workout-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    .aw-complete-btn:hover:not(:disabled) { background: #d4f53c !important; }
    .aw-add-ex-btn:hover { border-color: rgba(200,241,53,0.3) !important; color: #c8f135 !important; }
    .aw-catalog-row:hover { background: rgba(200,241,53,0.05) !important; border-color: rgba(200,241,53,0.2) !important; }
    .aw-back-btn:hover { color: #f0f4f8 !important; }
  `;
  document.head.appendChild(s);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatDuration = (startedAt) => {
  const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

export default function ActiveWorkout() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  // ── Session state ──────────────────────────────────────────────────────────
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionError, setSessionError] = useState(null);

  // ── Complete state ─────────────────────────────────────────────────────────
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState(null);

  // ── Catalog / add exercise state ───────────────────────────────────────────
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [addingExerciseId, setAddingExerciseId] = useState(null); // id being added

  // ── Live timer ─────────────────────────────────────────────────────────────
  const [elapsed, setElapsed] = useState("");
  const timerRef = useRef(null);

  // ── Abort controller ───────────────────────────────────────────────────────
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearInterval(timerRef.current);
    };
  }, []);

  // ── Load session ───────────────────────────────────────────────────────────
  const loadSession = useCallback(async () => {
    if (!sessionId) {
      setSessionError("No session ID provided.");
      setLoadingSession(false);
      return;
    }

    try {
      const res = await getSession(sessionId);
      if (!mountedRef.current) return;
      setSession(res.data);
      setSessionError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setSessionError(err?.message ?? "Failed to load session.");
    } finally {
      if (mountedRef.current) setLoadingSession(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // ── Start timer once session loaded ───────────────────────────────────────
  useEffect(() => {
    if (!session?.started_at || session.status !== "in_progress") return;
    setElapsed(formatDuration(session.started_at));
    timerRef.current = setInterval(() => {
      setElapsed(formatDuration(session.started_at));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [session?.started_at, session?.status]);

  // ── Complete session ───────────────────────────────────────────────────────
  const handleComplete = async () => {
    if (!sessionId || completing) return;
    setCompleting(true);
    setCompleteError(null);

    try {
      await completeSession(sessionId);
      if (!mountedRef.current) return;
      clearInterval(timerRef.current);
      navigate("/workouts");
    } catch (err) {
      if (!mountedRef.current) return;
      setCompleteError(err?.message ?? "Failed to complete session.");
    } finally {
      if (mountedRef.current) setCompleting(false);
    }
  };

  // ── Load catalog ───────────────────────────────────────────────────────────
  const handleOpenCatalog = async () => {
    setShowCatalog(true);
    if (catalog.length > 0) return; // already loaded

    setCatalogLoading(true);
    setCatalogError(null);

    try {
      const res = await getExerciseCatalog();
      if (!mountedRef.current) return;
      setCatalog(res.data ?? []);
    } catch (err) {
      if (!mountedRef.current) return;
      setCatalogError(err?.message ?? "Failed to load exercise catalog.");
    } finally {
      if (mountedRef.current) setCatalogLoading(false);
    }
  };

  // ── Add exercise to session ────────────────────────────────────────────────
  const handleAddExercise = async (catalogItem) => {
    if (!sessionId || addingExerciseId) return;
    setAddingExerciseId(catalogItem.id);

    try {
      const payload = {
        exercise_name: catalogItem.name,
        category: catalogItem.category,
        muscle_group: catalogItem.muscle_group,
      };
      const res = await addExerciseToSession(sessionId, payload);
      if (!mountedRef.current) return;

      // Append new exercise to local session state — no full refetch needed
      setSession((prev) => ({
        ...prev,
        session_exercises: [
          ...(prev?.session_exercises ?? []),
          res.data,
        ],
      }));
      setShowCatalog(false);
      setCatalogSearch("");
    } catch (err) {
      if (!mountedRef.current) return;
      setCatalogError(err?.message ?? "Failed to add exercise.");
    } finally {
      if (mountedRef.current) setAddingExerciseId(null);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const isCompleted = session?.status === "completed";
  const exercises = session?.session_exercises ?? [];

  // Progress bar: count sets that have been logged (have a backend id)
  const totalSets = exercises.reduce((sum, ex) => sum + (ex.sets?.length ?? 0), 0);
  const doneSets = exercises.reduce(
    (sum, ex) => sum + (ex.sets?.filter((s) => s.id).length ?? 0),
    0
  );
  const progressPct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;

  const filteredCatalog = catalog.filter((item) =>
    item.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
    item.muscle_group?.toLowerCase().includes(catalogSearch.toLowerCase()) ||
    item.category?.toLowerCase().includes(catalogSearch.toLowerCase())
  );

  // Already-added exercise names for visual indicator
  const addedNames = new Set(exercises.map((e) => e.exercise_name.toLowerCase()));

  // ── Render: loading ────────────────────────────────────────────────────────
  if (loadingSession) {
    return (
      <Layout>
        <div style={{ padding: "36px 40px" }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: "160px",
                borderRadius: "12px",
                background: "#161a24",
                border: "1px solid #1e2130",
                marginBottom: "16px",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
          ))}
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
        </div>
      </Layout>
    );
  }

  // ── Render: error ──────────────────────────────────────────────────────────
  if (sessionError) {
    return (
      <Layout>
        <div style={{ padding: "36px 40px", maxWidth: "640px" }}>
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
            {sessionError}
          </div>
          <button
            onClick={() => navigate("/workouts")}
            style={{
              marginTop: "16px",
              background: "transparent",
              border: "none",
              color: "#4a5568",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            ← Back to plans
          </button>
        </div>
      </Layout>
    );
  }

  // ── Render: main ───────────────────────────────────────────────────────────
  return (
    <Layout>
      <div style={{ padding: "36px 40px", maxWidth: "760px", width: "100%", overflowY: "auto", flex: 1 }}>

        {/* ── Top bar ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <button
              className="aw-back-btn"
              onClick={() => navigate("/workouts")}
              style={{
                background: "transparent",
                border: "none",
                color: "#4a5568",
                fontSize: "13px",
                cursor: "pointer",
                transition: "color 0.15s ease",
                padding: 0,
              }}
              aria-label="Back to workout plans"
            >
              ←
            </button>

            <div>
              <p style={{ fontSize: "11px", color: "#4a5568", letterSpacing: "0.1em", marginBottom: "4px" }}>
                {isCompleted ? "COMPLETED" : "IN PROGRESS"}
              </p>
              <h1 style={{ fontSize: "22px", fontWeight: "700", color: "#f0f4f8", letterSpacing: "-0.02em" }}>
                {session?.name ?? "Active Workout"}
              </h1>
            </div>
          </div>

          {/* Timer / duration pill */}
          <div
            style={{
              padding: "6px 14px",
              borderRadius: "20px",
              border: "1px solid",
              borderColor: isCompleted ? "rgba(200,241,53,0.25)" : "#1e2130",
              background: isCompleted ? "rgba(200,241,53,0.08)" : "#161a24",
              fontSize: "13px",
              fontWeight: "700",
              color: isCompleted ? "#c8f135" : "#8892a4",
              fontFamily: "'DM Mono', monospace",
              letterSpacing: "0.04em",
            }}
          >
            {isCompleted
              ? `${session.duration_minutes ?? 0} min`
              : elapsed || "0s"}
          </div>
        </div>

        {/* ── Progress bar ── */}
        {totalSets > 0 && (
          <div style={{ marginBottom: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", color: "#4a5568", letterSpacing: "0.05em" }}>SETS COMPLETED</span>
              <span style={{ fontSize: "11px", fontWeight: "700", color: progressPct === 100 ? "#c8f135" : "#8892a4", fontFamily: "'DM Mono', monospace" }}>
                {doneSets}/{totalSets}
              </span>
            </div>
            <div style={{ height: "4px", borderRadius: "4px", background: "#1e2130", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${progressPct}%`,
                  background: progressPct === 100 ? "#c8f135" : "#4a6fa5",
                  borderRadius: "4px",
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>
        )}

        {/* ── Completed banner ── */}
        {isCompleted && (
          <div
            style={{
              padding: "16px 20px",
              borderRadius: "12px",
              border: "1px solid rgba(200,241,53,0.2)",
              background: "rgba(200,241,53,0.06)",
              color: "#c8f135",
              fontSize: "13px",
              fontWeight: "600",
              marginBottom: "28px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <span style={{ fontSize: "18px" }}>✓</span>
            Workout complete — great work!
          </div>
        )}

        {/* ── Exercise loggers ── */}
        {exercises.length === 0 ? (
          <div
            style={{
              padding: "48px",
              borderRadius: "12px",
              border: "1px dashed #1e2130",
              textAlign: "center",
              marginBottom: "24px",
            }}
          >
            <p style={{ color: "#4a5568", fontSize: "13px", marginBottom: "4px" }}>
              No exercises in this session yet.
            </p>
            <p style={{ color: "#2d3748", fontSize: "12px" }}>
              Add exercises from the catalog below.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "24px" }}>
            {exercises
              .slice()
              .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
              .map((ex) => (
                <ExerciseLogger
                  key={ex.id}
                  exercise={ex}
                  sessionId={sessionId}
                  disabled={isCompleted}
                />
              ))}
          </div>
        )}

        {/* ── Add exercise button ── */}
        {!isCompleted && (
          <button
            className="aw-add-ex-btn"
            onClick={handleOpenCatalog}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "10px",
              border: "1px dashed #2d3748",
              background: "transparent",
              color: "#4a5568",
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
              letterSpacing: "0.05em",
              transition: "all 0.15s ease",
              marginBottom: "24px",
            }}
            aria-label="Add exercise from catalog"
          >
            + ADD EXERCISE
          </button>
        )}

        {/* ── Complete error ── */}
        {completeError && (
          <p style={{ fontSize: "12px", color: "#ef4444", marginBottom: "12px" }}>
            {completeError}
          </p>
        )}

        {/* ── Complete button ── */}
        {!isCompleted && (
          <button
            className="aw-complete-btn"
            onClick={handleComplete}
            disabled={completing || exercises.length === 0}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "10px",
              border: "none",
              background: "#c8f135",
              color: "#0f1117",
              fontSize: "14px",
              fontWeight: "700",
              cursor: completing || exercises.length === 0 ? "not-allowed" : "pointer",
              opacity: completing || exercises.length === 0 ? 0.5 : 1,
              letterSpacing: "0.04em",
              transition: "background 0.15s ease",
            }}
            aria-label="Complete workout session"
          >
            {completing ? "Finishing…" : "COMPLETE WORKOUT"}
          </button>
        )}
      </div>

      {/* ── Catalog drawer ── */}
      {showCatalog && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => { setShowCatalog(false); setCatalogSearch(""); }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              zIndex: 40,
            }}
            aria-hidden="true"
          />

          {/* Drawer */}
          <div
            role="dialog"
            aria-label="Add exercise from catalog"
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              maxHeight: "70vh",
              background: "#161a24",
              borderTop: "1px solid #1e2130",
              borderRadius: "20px 20px 0 0",
              zIndex: 50,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Drawer header */}
            <div
              style={{
                padding: "20px 24px 12px",
                borderBottom: "1px solid #1e2130",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: "14px", fontWeight: "700", color: "#f0f4f8" }}>
                Add Exercise
              </span>
              <button
                onClick={() => { setShowCatalog(false); setCatalogSearch(""); }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#4a5568",
                  fontSize: "20px",
                  cursor: "pointer",
                  lineHeight: 1,
                }}
                aria-label="Close catalog"
              >
                ×
              </button>
            </div>

            {/* Search */}
            <div style={{ padding: "12px 24px", flexShrink: 0 }}>
              <input
                type="text"
                placeholder="Search exercises…"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                autoFocus
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #1e2130",
                  background: "#0f1117",
                  color: "#f0f4f8",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                aria-label="Search exercise catalog"
              />
            </div>

            {/* Catalog list */}
            <div style={{ overflowY: "auto", flex: 1, padding: "0 24px 24px" }}>
              {catalogLoading && (
                <p style={{ fontSize: "13px", color: "#4a5568", textAlign: "center", padding: "24px 0" }}>
                  Loading…
                </p>
              )}

              {catalogError && (
                <p style={{ fontSize: "13px", color: "#ef4444", padding: "12px 0" }}>
                  {catalogError}
                </p>
              )}

              {!catalogLoading && filteredCatalog.length === 0 && (
                <p style={{ fontSize: "13px", color: "#4a5568", textAlign: "center", padding: "24px 0" }}>
                  No exercises match "{catalogSearch}".
                </p>
              )}

              {filteredCatalog.map((item) => {
                const alreadyAdded = addedNames.has(item.name.toLowerCase());
                const isAdding = addingExerciseId === item.id;

                return (
                  <button
                    key={item.id}
                    className="aw-catalog-row"
                    onClick={() => !alreadyAdded && !isAdding && handleAddExercise(item)}
                    disabled={alreadyAdded || isAdding || !!addingExerciseId}
                    style={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid transparent",
                      background: "transparent",
                      cursor: alreadyAdded || !!addingExerciseId ? "not-allowed" : "pointer",
                      opacity: alreadyAdded ? 0.4 : 1,
                      marginBottom: "4px",
                      textAlign: "left",
                      transition: "all 0.15s ease",
                    }}
                    aria-label={`Add ${item.name}`}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ fontSize: "13px", color: "#f0f4f8", fontWeight: "600" }}>
                        {item.name}
                      </span>
                      <span style={{ fontSize: "11px", color: "#4a5568" }}>
                        {[item.category, item.muscle_group].filter(Boolean).join(" · ")}
                      </span>
                    </div>

                    <span style={{ fontSize: "11px", color: alreadyAdded ? "#4a5568" : "#c8f135", fontWeight: "600", flexShrink: 0, marginLeft: "12px" }}>
                      {isAdding ? "Adding…" : alreadyAdded ? "Added" : "+"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}