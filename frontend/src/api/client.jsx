// src/api/client.jsx
import axios from "axios";

// ─── Safe localStorage ────────────────────────────────────────────────────────
const storage = {
  get: (key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  remove: (key) => {
    try { localStorage.removeItem(key); } catch { /* silent */ }
  },
};

// ─── SPA-safe navigation callback ─────────────────────────────────────────────
let _navigateToLogin = null;
export const setNavigateCallback = (fn) => {
  _navigateToLogin = fn;
};

// ─── Normalized error ─────────────────────────────────────────────────────────
const normalizeError = (error) => {
  if (axios.isCancel(error)) {
    return { message: "Request cancelled", status: null, isNetwork: false, isCancelled: true, raw: error };
  }
  if (!error.response) {
    return { message: "Network error. Please check your connection.", status: null, isNetwork: true, isCancelled: false, raw: error };
  }
  const status = error.response.status;
  const data = error.response.data;
  let message = "Something went wrong.";
  if (typeof data?.detail === "string") {
    message = data.detail;
  } else if (Array.isArray(data?.detail)) {
    message = data.detail.map((e) => e.msg).join(", ");
  } else if (typeof data?.message === "string") {
    message = data.message;
  }
  return { message, status, isNetwork: false, isCancelled: false, raw: error };
};

// ─── Axios instance ───────────────────────────────────────────────────────────
const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

// ─── Request interceptor ──────────────────────────────────────────────────────
client.interceptors.request.use(
  (config) => {
    const token = storage.get("access_token");
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(normalizeError(error))
);

// ─── Response interceptor ─────────────────────────────────────────────────────
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isCancel(error)) return Promise.reject(normalizeError(error));
    const status = error.response?.status ?? null;
    if (status === 401 && storage.get("access_token")) {
      storage.remove("access_token");
      if (_navigateToLogin) _navigateToLogin("/login");
    }
    return Promise.reject(normalizeError(error));
  }
);

export default client;

// ─── ID guard ─────────────────────────────────────────────────────────────────
const requireId = (id, label = "id") => {
  if (!id && id !== 0) throw new Error(`${label} is required`);
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const getDashboardSummary = (signal) =>
  client.get("/dashboard/summary", { signal });

// ─── Workout Plans ────────────────────────────────────────────────────────────
export const getWorkoutPlans = () =>
  client.get("/workouts/plans");

export const createWorkoutPlan = (data) =>
  client.post("/workouts/plans", data);

export const getExerciseCatalog = (params = {}) =>
  client.get("/workouts/catalog", { params });

// ─── Workout Sessions ─────────────────────────────────────────────────────────
export const startSession = (data = {}) =>
  client.post("/workouts/sessions", data);

export const getSession = (sessionId, signal) => {
  requireId(sessionId, "sessionId");
  return client.get(`/workouts/sessions/${sessionId}`, { signal });
};

export const completeSession = (sessionId, data = {}) => {
  requireId(sessionId, "sessionId");
  return client.put(`/workouts/sessions/${sessionId}`, data);
};

export const addExerciseToSession = (sessionId, data) => {
  requireId(sessionId, "sessionId");
  return client.post(`/workouts/sessions/${sessionId}/exercises`, data);
};

// ─── Sets ─────────────────────────────────────────────────────────────────────
export const logSet = (sessionId, sessionExerciseId, data, signal) => {
  requireId(sessionId, "sessionId");
  requireId(sessionExerciseId, "sessionExerciseId");
  return client.post(
    `/workouts/sessions/${sessionId}/exercises/${sessionExerciseId}/sets`,
    data,
    { signal }
  );
};

export const deleteSet = (sessionId, sessionExerciseId, setId, signal) => {
  requireId(sessionId, "sessionId");
  requireId(sessionExerciseId, "sessionExerciseId");
  requireId(setId, "setId");
  return client.delete(
    `/workouts/sessions/${sessionId}/exercises/${sessionExerciseId}/sets/${setId}`,
    { signal }
  );
};

export const updateSet = (sessionId, sessionExerciseId, setId, data, signal) => {
  requireId(sessionId, "sessionId");
  requireId(sessionExerciseId, "sessionExerciseId");
  requireId(setId, "setId");
  return client.put(
    `/workouts/sessions/${sessionId}/exercises/${sessionExerciseId}/sets/${setId}`,
    data,
    { signal }
  );
};

// ─── Daily Metrics ────────────────────────────────────────────────────────────
export const logDailyMetrics = (data) =>
  client.post("/metrics/daily", data);

export const getDailyMetrics = (params = {}, signal) =>
  client.get("/metrics/daily", { params, signal });

// ─── Body Measurements ────────────────────────────────────────────────────────
export const logBodyMeasurements = (data) =>
  client.post("/metrics/body", data);

// ─── Metrics Summary ──────────────────────────────────────────────────────────
export const getMetricsSummary = (signal) =>
  client.get("/metrics/summary", { signal });

// ─── Profile ──────────────────────────────────────────────────────────────────
export const getProfile = (signal) =>
  client.get("/profile/me", { signal });

export const updateProfile = (data) =>
  client.put("/profile/me", data);