import Sidebar from "./Sidebar";

export default function Layout({ children }) {
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",        // exact viewport height — never taller
        overflow: "hidden",     // nothing escapes; pages scroll internally
        background: "#13161f",
        fontFamily: "'DM Mono', monospace",
      }}
    >
      <Sidebar />

      {/* Main content area — scrolls naturally; AI Coach manages its own internal scroll */}
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </main>
    </div>
  );
}