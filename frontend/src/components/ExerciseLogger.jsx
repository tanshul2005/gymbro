// src/components/ExerciseLogger.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import SetRow from "./SetRow";
import { logSet, deleteSet } from "../api/client";

// Fix #9 — inject hover styles once via class, no DOM mutation
const STYLE_ID = "exercise-logger-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `.ex-add-set-btn:hover { border-color: rgba(200,241,53,0.3) !important; color: #c8f135 !important; }`;
  document.head.appendChild(s);
}

// Fix #4 — safe numeric parser
const toNumber = (val) => {
  if (val === "" || val === null || val === undefined) return "";
  const n = parseFloat(val);
  return isNaN(n) ? "" : n;
};

// Fix #7 — instance-scoped counter via closure, not module global
const makeIdGen = () => {
  let n = 0;
  return () => `local_${Date.now()}_${++n}`;
};

const fromBackend = (set, genId) => ({
  _localId: genId(),
  _saved: !!set.id,   // only truly saved if it has a real DB id
  _saving: false,
  _inFlight: false,
  _error: null,
  id: set.id ?? null,
  set_number: set.set_number,
  reps: set.reps ?? "",
  weight_kg: set.weight_kg ?? "",
  done: false,        // plan targets start un-done; user marks them complete
});

const emptyRow = (setNumber, genId) => ({
  _localId: genId(),
  _saved: false,
  _saving: false,
  _inFlight: false,   // Fix #3
  _error: null,
  id: null,
  set_number: setNumber,
  reps: "",
  weight_kg: "",
  done: false,
});

export default function ExerciseLogger({ exercise, sessionId, disabled = false }) {
  // Fix #7 — one ID generator per component instance
  const genId = useRef(makeIdGen()).current;

  const buildRows = useCallback(
    (ex) =>
      (ex?.sets ?? [])
        .slice()
        .sort((a, b) => a.set_number - b.set_number)
        .map((s) => fromBackend(s, genId)),
    [genId]
  );

  const [rows, setRows] = useState(() => buildRows(exercise));

  // Fix #1 — re-sync when exercise prop changes
  useEffect(() => {
    setRows(buildRows(exercise));
  }, [exercise, buildRows]);

  // Fix #8 — track mounted state to skip setState after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Fix #8 — store abort controllers by localId
  const controllersRef = useRef({});
  useEffect(() => {
    return () => {
      // Cancel all in-flight requests on unmount
      Object.values(controllersRef.current).forEach((c) => c.abort());
    };
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Fix #2 — all state updates use functional updater, never close over rows
  const updateRow = useCallback((localId, patch) => {
    setRows((prev) =>
      prev.map((r) => (r._localId === localId ? { ...r, ...patch } : r))
    );
  }, []);

  const removeAndRenumber = useCallback((localId) => {
    // Fix #6 — single setRows call for remove + renumber
    setRows((prev) =>
      prev
        .filter((r) => r._localId !== localId)
        .map((r, i) => ({ ...r, set_number: i + 1 }))
    );
  }, []);

  // ── Add set ────────────────────────────────────────────────────────────────

  const handleAddSet = () => {
    setRows((prev) => {
      // Fix #10 — derive next set_number from max existing, not length
      const maxNum = prev.reduce((m, r) => Math.max(m, r.set_number), 0);
      return [...prev, emptyRow(maxNum + 1, genId)];
    });
  };

  // ── Change / save ──────────────────────────────────────────────────────────

  const handleChange = useCallback(
    async (localId, newData) => {
      // Fix #2 — read current row from functional updater snapshot via ref trick
      let currentRow = null;
      setRows((prev) => {
        currentRow = prev.find((r) => r._localId === localId) ?? null;
        return prev; // no change yet
      });

      if (!currentRow) return;

      // Always sync reps/weight immediately
      updateRow(localId, {
        reps: toNumber(newData.reps),        // Fix #4
        weight_kg: toNumber(newData.weight_kg), // Fix #4
      });

      // Done toggled ON
      if (newData.done && !currentRow.done) {
        // Fix #3 — block if already in flight
        if (currentRow._inFlight) return;

        const reps = toNumber(newData.reps);
        const weight = toNumber(newData.weight_kg);

        if (reps === "" && weight === "") {
          updateRow(localId, {
            done: false,
            _error: "Enter reps or weight before marking done.",
          });
          return;
        }

        // Fix #5 — guard exercise.id
        if (!exercise?.id) {
          updateRow(localId, {
            done: false,
            _error: "Exercise not saved yet. Cannot log set.",
          });
          return;
        }

        // Fix #8 — create abort controller for this request
        const controller = new AbortController();
        controllersRef.current[localId] = controller;

        updateRow(localId, { _saving: true, _inFlight: true, _error: null, done: true }); // Fix #3

        try {
          const payload = {
            set_number: currentRow.set_number,
            ...(reps !== "" && { reps: Number(reps) }),
            ...(weight !== "" && { weight_kg: Number(weight) }),
          };

          const res = await logSet(sessionId, exercise.id, payload, controller.signal);

          if (!mountedRef.current) return; // Fix #8

          updateRow(localId, {
            _saving: false,
            _inFlight: false,
            _saved: true,
            id: res.data.id,
          });
        } catch (err) {
          if (!mountedRef.current) return; // Fix #8
          if (err?.isCancelled) return;

          updateRow(localId, {
            _saving: false,
            _inFlight: false, // Fix #3 — reset so user can retry
            done: false,
            _error: err?.message ?? "Failed to save set.",
          });
        } finally {
          delete controllersRef.current[localId];
        }
      }

      // Done toggled OFF
      if (!newData.done && currentRow.done) {
        if (!currentRow._saved || !currentRow.id) {
          // Unsaved row — just uncheck locally
          updateRow(localId, { done: false });
        } else {
          // Saved row — delete from backend so the set can be re-logged
          if (currentRow._inFlight) return;
          const controller = new AbortController();
          controllersRef.current[localId] = controller;
          updateRow(localId, { _saving: true, _inFlight: true, _error: null });
          try {
            await deleteSet(sessionId, exercise.id, currentRow.id, controller.signal);
            if (!mountedRef.current) return;
            // Reset to editable, un-done state (keep reps/weight as hints)
            updateRow(localId, {
              _saving: false,
              _inFlight: false,
              _saved: false,
              id: null,
              done: false,
            });
          } catch (err) {
            if (!mountedRef.current) return;
            if (err?.isCancelled) return;
            updateRow(localId, {
              _saving: false,
              _inFlight: false,
              _error: err?.message ?? "Failed to unmark set.",
            });
          } finally {
            delete controllersRef.current[localId];
          }
        }
      }
    },
    [exercise?.id, updateRow] // Fix #2 — no `rows` in deps
  );

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (localId) => {
      let currentRow = null;
      setRows((prev) => {
        currentRow = prev.find((r) => r._localId === localId) ?? null;
        return prev;
      });

      if (!currentRow) return;

      if (!currentRow._saved || !currentRow.id) {
        removeAndRenumber(localId); // Fix #6
        return;
      }

      const controller = new AbortController();
      controllersRef.current[localId] = controller;

      updateRow(localId, { _saving: true, _inFlight: true, _error: null });

      try {
        await deleteSet(sessionId, exercise.id, currentRow.id, controller.signal);
        if (!mountedRef.current) return; // Fix #8
        removeAndRenumber(localId); // Fix #6
      } catch (err) {
        if (!mountedRef.current) return;
        if (err?.isCancelled) return;
        updateRow(localId, {
          _saving: false,
          _inFlight: false,
          _error: err?.message ?? "Failed to delete set.",
        });
      } finally {
        delete controllersRef.current[localId];
      }
    },
    [updateRow, removeAndRenumber]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  const doneCount = rows.filter((r) => r.done).length;
  const totalCount = rows.length;

  if (!exercise) return null;

  return (
    <div
      style={{
        background: "#161a24",
        border: "1px solid #1e2130",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid #1e2130",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontSize: "13px", fontWeight: "700", color: "#f0f4f8" }}>
            {exercise.exercise_name}
          </span>
          {(exercise.category || exercise.muscle_group) && (
            <span style={{ fontSize: "11px", color: "#4a5568" }}>
              {[exercise.category, exercise.muscle_group].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>

        {totalCount > 0 && (
          <span
            style={{
              fontSize: "11px",
              fontWeight: "700",
              color: doneCount === totalCount ? "#c8f135" : "#8892a4",
              background: doneCount === totalCount ? "rgba(200,241,53,0.1)" : "rgba(136,146,164,0.08)",
              border: "1px solid",
              borderColor: doneCount === totalCount ? "rgba(200,241,53,0.25)" : "#1e2130",
              borderRadius: "20px",
              padding: "2px 10px",
              transition: "all 0.2s ease",
            }}
          >
            {doneCount}/{totalCount}
          </span>
        )}
      </div>

      {/* Column headers */}
      {totalCount > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "32px 1fr 1fr 36px 28px",
            gap: "10px",
            padding: "6px 12px",
            background: "#0f1117",
          }}
        >
          {["SET", "REPS", "KG", "", ""].map((label, i) => (
            <span
              key={i}
              style={{
                fontSize: "10px",
                fontWeight: "700",
                color: "#2d3748",
                letterSpacing: "0.06em",
                textAlign: "center",
              }}
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Rows */}
      <div style={{ padding: "8px 0" }}>
        {rows.length === 0 && (
          <p style={{ fontSize: "12px", color: "#2d3748", textAlign: "center", padding: "16px", margin: 0 }}>
            No sets yet. Add your first set below.
          </p>
        )}

        {rows.map((row) => (
          <div key={row._localId}>
            <SetRow
              setNumber={row.set_number}
              data={{ reps: row.reps, weight_kg: row.weight_kg, done: row.done }}
              onChange={(newData) => handleChange(row._localId, newData)}
              onDelete={() => handleDelete(row._localId)}
              disabled={disabled || row._inFlight}
            />
            {row._error && (
              <p style={{ fontSize: "11px", color: "#e53e3e", padding: "0 12px 4px 54px", margin: 0 }}>
                {row._error}
              </p>
            )}
            {row._saving && (
              <p style={{ fontSize: "11px", color: "#4a5568", padding: "0 12px 4px 54px", margin: 0 }}>
                Saving…
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Add Set */}
      {!disabled && (
        <div style={{ padding: "8px 12px 12px" }}>
          <button
            onClick={handleAddSet}
            className="ex-add-set-btn"
            aria-label={`Add set to ${exercise.exercise_name}`}
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: "8px",
              border: "1px dashed #2d3748",
              background: "transparent",
              color: "#4a5568",
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
              letterSpacing: "0.04em",
              transition: "all 0.15s ease",
            }}
          >
            + ADD SET
          </button>
        </div>
      )}
    </div>
  );
}