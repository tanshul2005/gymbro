import { createContext, useContext, useState, useEffect, useCallback } from "react";
import client from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");

    if (token) {
      client
        .get("/auth/me")
        .then((res) => setUser(res.data))
        .catch(() => {
          localStorage.removeItem("access_token");
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (email, password) => {
    const res = await client.post("/auth/register", { email, password });
    return res.data;
  }, []);

    const login = useCallback(async (email, password) => {
        const res = await client.post("/auth/login", { email, password });

        localStorage.setItem("access_token", res.data.access_token);

        try {
            const meRes = await client.get("/auth/me");
            setUser(meRes.data);
        } catch (err) {
            localStorage.removeItem("access_token");
            throw err;
        }
    }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("access_token");
    setUser(null);
    window.location.href = "/login";
  }, []);

  const value = { user, loading, login, logout, register };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}