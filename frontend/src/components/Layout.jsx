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

      {/* Main content area — clips to column, each page scrolls itself */}
      <main
        style={{
          flex: 1,
          overflow: "hidden",   // chat / other pages handle their own scroll
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </main>
    </div>
  );
}