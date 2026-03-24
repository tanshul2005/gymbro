export default function MessageBubble({ message, isStreaming = false }) {
  const isUser = message.role === "user";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        gap: "4px",
      }}
    >
      {/* Role label */}
      <span
        style={{
          fontSize: "10px",
          fontWeight: "600",
          letterSpacing: "0.08em",
          color: "#4a5568",
          paddingLeft: isUser ? 0 : "4px",
          paddingRight: isUser ? "4px" : 0,
        }}
      >
        {isUser ? "YOU" : "GYMBRO"}
      </span>

      {/* Bubble */}
      <div
        style={{
          maxWidth: "72%",
          padding: "12px 16px",
          borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
          background: isUser ? "rgba(200,241,53,0.08)" : "#161a24",
          border: isUser ? "1px solid rgba(200,241,53,0.2)" : "1px solid #1e2130",
          fontSize: "13px",
          lineHeight: "1.65",
          color: "#f0f4f8",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {message.content}

        {/* Streaming cursor */}
        {isStreaming && !isUser && (
          <span
            style={{
              display: "inline-block",
              width: "2px",
              height: "13px",
              background: "#c8f135",
              marginLeft: "3px",
              verticalAlign: "middle",
              animation: "blink 1s step-end infinite",
            }}
          />
        )}
      </div>
    </div>
  );
}