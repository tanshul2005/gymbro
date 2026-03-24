import { useState, useRef, useEffect } from "react";

export default function ChatInput({ onSend, isStreaming = false }) {
  const [text, setText] = useState("");
  const textareaRef = useRef(null);

  // Auto-resize textarea as user types
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const handleSend = () => {
    if (!text.trim() || isStreaming) return;
    onSend(text);
    setText("");
    // Reset height
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e) => {
    // Enter sends, Shift+Enter adds newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const charCount = text.length;
  const atLimit = charCount >= 4000;

  return (
    <div
      style={{
        padding: "16px 20px",
        borderTop: "1px solid #1e2130",
        background: "#0f1117",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "12px",
          background: "#161a24",
          border: "1px solid #1e2130",
          borderRadius: "12px",
          padding: "10px 14px",
          transition: "border-color 0.15s ease",
        }}
        onFocusCapture={(e) => {
          e.currentTarget.style.borderColor = "rgba(200,241,53,0.3)";
        }}
        onBlurCapture={(e) => {
          e.currentTarget.style.borderColor = "#1e2130";
        }}
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 4000))}
          onKeyDown={handleKeyDown}
          placeholder="Ask your coach anything…"
          rows={1}
          disabled={isStreaming}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            fontSize: "13px",
            color: "#f0f4f8",
            lineHeight: "1.6",
            fontFamily: "inherit",
            overflowY: "auto",
            maxHeight: "160px",
          }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!text.trim() || isStreaming}
          style={{
            flexShrink: 0,
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            border: "none",
            background:
              text.trim() && !isStreaming
                ? "#c8f135"
                : "rgba(200,241,53,0.08)",
            color:
              text.trim() && !isStreaming ? "#0f1117" : "#4a5568",
            cursor:
              text.trim() && !isStreaming ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.15s ease",
            fontSize: "16px",
            fontWeight: "700",
          }}
          aria-label="Send message"
        >
          {isStreaming ? (
            // Spinner dots while streaming
            <span style={{ fontSize: "10px", letterSpacing: "2px" }}>···</span>
          ) : (
            "↑"
          )}
        </button>
      </div>

      {/* Footer row — hint + char count */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingLeft: "2px",
          paddingRight: "2px",
        }}
      >
        <span style={{ fontSize: "10px", color: "#2d3748" }}>
          Enter to send · Shift+Enter for new line
        </span>
        <span
          style={{
            fontSize: "10px",
            color: atLimit ? "#e53e3e" : "#2d3748",
          }}
        >
          {charCount}/4000
        </span>
      </div>
    </div>
  );
}