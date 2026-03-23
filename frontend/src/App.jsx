// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import { setNavigateCallback } from "./api/client";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import WorkoutPlans from "./pages/WorkoutPlans";
import ActiveWorkout from "./pages/ActiveWorkout";
import Progress from "./pages/Progress";
import Chat from "./pages/Chat";
import Profile from "./pages/Profile";

// ─── Inner component so useNavigate is inside BrowserRouter ──────────────────
import { useNavigate } from "react-router-dom";

function NavigationWirer() {
  const navigate = useNavigate();
  useEffect(() => {
    setNavigateCallback(navigate); // fix #1 from client.jsx — SPA-safe 401 redirect
    return () => setNavigateCallback(null);
  }, [navigate]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NavigationWirer />
        <Routes>
          {/* Public */}
          <Route path="/login"    element={<Login />}    />
          <Route path="/register" element={<Register />} />

          {/* Protected */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

          <Route path="/workouts" element={<ProtectedRoute><WorkoutPlans /></ProtectedRoute>} />
          <Route
            path="/workouts/active/:sessionId"
            element={<ProtectedRoute><ActiveWorkout /></ProtectedRoute>}
          />

          <Route path="/progress" element={<ProtectedRoute><Progress /></ProtectedRoute>} />

          <Route path="/chat"    element={<ProtectedRoute><Chat /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

          {/* Legacy /metrics redirect → /progress */}
          <Route path="/metrics" element={<Navigate to="/progress" replace />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}