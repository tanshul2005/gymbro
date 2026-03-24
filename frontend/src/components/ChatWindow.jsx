import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";

export default function ChatWindow({ messages, isStreaming, isLoadingHistory, onSuggestion }) {
  const bottomRef = useRef(null);

  // Auto-scroll to bottom when messages change or chunks arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─── Loading skeleton ───────────────────────────────────────────────────
  if (isLoadingHistory) {
    return (
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {[80, 55, 120, 40].map((width, i) => (
          <div
            key={i}
            style={{
              alignSelf: i % 2 === 0 ? "flex-end" : "flex-start",
              height: "36px",
              width: `${width}%`,
              borderRadius: "12px",
              background: "#161a24",
              animation: "pulse 1.5s ease-in-out infinite",
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>
    );
  }

  // ─── Empty state ────────────────────────────────────────────────────────
  if (messages.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px 20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background: "rgba(200,241,53,0.08)",
            border: "1px solid rgba(200,241,53,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "22px",
          }}
        >
          💪
        </div>
        <p
          style={{
            fontSize: "13px",
            fontWeight: "600",
            color: "#f0f4f8",
            margin: 0,
          }}
        >
          GymBro is ready
        </p>
        <p style={{ fontSize: "12px", color: "#4a5568", margin: 0, textAlign: "center", maxWidth: "260px" }}>
          Ask about workouts, nutrition, recovery, or anything fitness related.
        </p>

        {/* Prompt suggestions */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            marginTop: "8px",
            width: "100%",
            maxWidth: "380px",
          }}
        >
          {[
            "Build me a 3-day push/pull/legs plan",
            "What should I eat before a morning workout?",
            "How do I improve my bench press form?",
            ].map((suggestion) => (
            <div
                key={suggestion}
                onClick={() => onSuggestion?.(suggestion)}
                style={{
                padding: "10px 14px",
                borderRadius: "8px",
                background: "#161a24",
                border: "1px solid #1e2130",
                fontSize: "12px",
                color: "#8892a4",
                cursor: "pointer",        // ← was "default"
                transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(200,241,53,0.25)";
                e.currentTarget.style.color = "#f0f4f8";
                }}
                onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#1e2130";
                e.currentTarget.style.color = "#8892a4";
                }}
            >
                {suggestion}
            </div>
            ))}
        </div>
      </div>
    );
  }

  // ─── Message list ───────────────────────────────────────────────────────
  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "24px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        scrollbarWidth: "thin",
        scrollbarColor: "#1e2130 transparent",
      }}
    >
      {messages.map((message, index) => {
        const isLastMessage = index === messages.length - 1;
        const isStreamingThisBubble =
          isStreaming && isLastMessage && message.role === "assistant";

        return (
          <MessageBubble
            key={message.id}
            message={message}
            isStreaming={isStreamingThisBubble}
          />
        );
      })}

      {/* Invisible anchor for auto-scroll */}
      <div ref={bottomRef} />
    </div>
  );
}