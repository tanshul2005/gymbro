import { useState, useEffect, useRef, useCallback } from "react";
import client from "../api/client";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function useChat() {
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const abortRef = useRef(null);

  // ─── Load history on mount ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        const res = await client.get("/chat/history");
        if (cancelled) return;

        const { conversation_id, messages: msgs } = res.data;
        setConversationId(conversation_id);
        setMessages(
          msgs.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.created_at,
          }))
        );
      } catch (err) {
        if (!cancelled) setError("Failed to load chat history.");
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }
    }

    loadHistory();
    return () => { cancelled = true; };
  }, []);

  // ─── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    setError(null);

    // Optimistically add user message to UI
    const tempUserId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempUserId, role: "user", content: trimmed },
    ]);

    // Placeholder for the streaming assistant message
    const tempAiId = `ai-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempAiId, role: "assistant", content: "" },
    ]);

    setIsStreaming(true);

    // Native fetch — axios doesn't support streaming
    const token = localStorage.getItem("access_token");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${API_BASE}/chat/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: trimmed,
          conversation_id: conversationId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newlines
        const events = buffer.split("\n\n");
        buffer = events.pop(); // keep incomplete last chunk

        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith("data: ")) continue;

          try {
            const payload = JSON.parse(line.slice(6)); // strip "data: "

            if (payload.type === "meta") {
              setConversationId(payload.conversation_id);

            } else if (payload.type === "chunk") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAiId
                    ? { ...m, content: m.content + payload.text }
                    : m
                )
              );

            } else if (payload.type === "done") {
              // Replace temp ID with real message ID from DB
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAiId ? { ...m, id: payload.message_id } : m
                )
              );

            } else if (payload.type === "error") {
              setError(payload.message || "Something went wrong.");
              setMessages((prev) => prev.filter((m) => m.id !== tempAiId));
            }
          } catch {
            // Malformed JSON in stream — skip
          }
        }
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      setError("Failed to send message. Please try again.");
      // Remove the failed AI placeholder
      setMessages((prev) => prev.filter((m) => m.id !== tempAiId));
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [conversationId, isStreaming]);

  // ─── Cancel in-flight stream ──────────────────────────────────────────────
  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    messages,
    conversationId,
    isStreaming,
    isLoadingHistory,
    error,
    sendMessage,
    cancelStream,
  };
}