import { useRef, useEffect } from "react";
import Layout from "../components/Layout";
import ChatWindow from "../components/ChatWindow";
import ChatInput from "../components/ChatInput";
import { useChat } from "../hooks/useChat";

// Inject global keyframe animations once
const GLOBAL_STYLES = `
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
  }
`;

export default function Chat() {
  const { messages, isStreaming, isLoadingHistory, error, sendMessage } = useChat();
  const styleInjected = useRef(false);

  // Inject keyframes once into document head
  useEffect(() => {
    if (styleInjected.current) return;
    const style = document.createElement("style");
    style.textContent = GLOBAL_STYLES;
    document.head.appendChild(style);
    styleInjected.current = true;
  }, []);

  // Wire suggestion chips to sendMessage
  const handleSuggestion = (text) => {
    if (!isStreaming) sendMessage(text);
  };

  return (
    <Layout>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {/* ─── Header ─────────────────────────────────────────────────── */}
        <div
          style={{
            padding: "28px 40px 20px",
            borderBottom: "1px solid #1e2130",
            flexShrink: 0,
          }}
        >
          <p
            style={{
              fontSize: "11px",
              color: "#4a5568",
              letterSpacing: "0.1em",
              marginBottom: "4px",
            }}
          >
            AI COACH
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h1
              style={{
                fontSize: "26px",
                fontWeight: "700",
                color: "#f0f4f8",
                letterSpacing: "-0.02em",
                margin: 0,
              }}
            >
              GymBro
            </h1>

            {/* Live indicator */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <div
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: isStreaming ? "#c8f135" : "#2d3748",
                  transition: "background 0.3s ease",
                  boxShadow: isStreaming ? "0 0 6px #c8f135" : "none",
                }}
              />
              <span style={{ fontSize: "11px", color: "#4a5568" }}>
                {isStreaming ? "Responding…" : "Ready"}
              </span>
            </div>
          </div>
        </div>

        {/* ─── Error banner ────────────────────────────────────────────── */}
        {error && (
          <div
            style={{
              margin: "0 20px",
              padding: "10px 14px",
              background: "rgba(229,62,62,0.08)",
              border: "1px solid rgba(229,62,62,0.2)",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#fc8181",
              flexShrink: 0,
              marginTop: "12px",
            }}
          >
            {error}
          </div>
        )}

        {/* ─── Chat window ─────────────────────────────────────────────── */}
        <ChatWindow
          messages={messages}
          isStreaming={isStreaming}
          isLoadingHistory={isLoadingHistory}
          onSuggestion={handleSuggestion}
        />

        {/* ─── Input ───────────────────────────────────────────────────── */}
        <ChatInput onSend={sendMessage} isStreaming={isStreaming} />
      </div>
    </Layout>
  );
}