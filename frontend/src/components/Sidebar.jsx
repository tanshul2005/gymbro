import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  {
    path: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    path: "/workouts",
    label: "Workouts",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M6 4v16M18 4v16M2 8h4M18 8h4M2 16h4M18 16h4" />
      </svg>
    ),
  },
  {
    path: "/progress",  // was "/metrics"
    label: "Progress",  // was "Metrics"
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    path: "/chat",
    label: "AI Coach",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    path: "/profile",
    label: "Profile",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <aside
      style={{
        width: "240px",
        minHeight: "100vh",
        background: "#0f1117",
        borderRight: "1px solid #1e2130",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'DM Mono', monospace",
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: "28px 24px 24px",
          borderBottom: "1px solid #1e2130",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              background: "#c8f135",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg viewBox="0 0 24 24" fill="#0f1117" width="18" height="18">
              <path d="M6 4v16M18 4v16M2 8h4M18 8h4M2 16h4M18 16h4" stroke="#0f1117" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <span
            style={{
              fontSize: "16px",
              fontWeight: "700",
              color: "#f0f4f8",
              letterSpacing: "-0.02em",
            }}
          >
            GYMBRO
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: "16px 12px", flex: 1 }}>
        <p
          style={{
            fontSize: "10px",
            color: "#4a5568",
            letterSpacing: "0.12em",
            padding: "0 12px",
            marginBottom: "8px",
          }}
        >
          MAIN MENU
        </p>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "10px 12px",
              borderRadius: "8px",
              marginBottom: "2px",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: isActive ? "600" : "400",
              color: isActive ? "#c8f135" : "#8892a4",
              background: isActive ? "rgba(200,241,53,0.08)" : "transparent",
              borderLeft: isActive ? "2px solid #c8f135" : "2px solid transparent",
              transition: "all 0.15s ease",
            })}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User + Logout */}
      <div
        style={{
          padding: "16px 12px",
          borderTop: "1px solid #1e2130",
        }}
      >
        <div
          style={{
            padding: "10px 12px",
            borderRadius: "8px",
            background: "#161a24",
            marginBottom: "8px",
          }}
        >
          <p style={{ fontSize: "11px", color: "#4a5568", marginBottom: "2px" }}>
            SIGNED IN AS
          </p>
          <p
            style={{
              fontSize: "12px",
              color: "#8892a4",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {user?.email}
          </p>
        </div>
        <button
          onClick={handleLogout}
          style={{
            width: "100%",
            padding: "9px 12px",
            borderRadius: "8px",
            border: "1px solid #1e2130",
            background: "transparent",
            color: "#4a5568",
            fontSize: "12px",
            fontWeight: "500",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.15s ease",
            fontFamily: "'DM Mono', monospace",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#ef4444";
            e.currentTarget.style.borderColor = "#ef4444";
            e.currentTarget.style.background = "rgba(239,68,68,0.06)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#4a5568";
            e.currentTarget.style.borderColor = "#1e2130";
            e.currentTarget.style.background = "transparent";
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Logout
        </button>
      </div>
    </aside>
  );
}