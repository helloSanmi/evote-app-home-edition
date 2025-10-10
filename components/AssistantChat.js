import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost } from "../lib/apiBase";
import { getSocket } from "../lib/socket";
import { notifyError, notifyInfo, notifySuccess } from "./Toast";

const ROLE_USER = "user";
const ROLE_ADMIN = "admin";
const ROLE_SUPER = "super-admin";

function getStoredRole() {
  if (typeof window === "undefined") return ROLE_USER;
  return (localStorage.getItem("role") || ROLE_USER).toLowerCase();
}

const userPlaceholders = [
  "How do I change my password?",
  "I can't find my session",
  "Need help with candidate info"
];

const adminStatuses = {
  pending: { label: "Waiting", tone: "bg-amber-100 text-amber-700" },
  active: { label: "Active", tone: "bg-emerald-100 text-emerald-700" },
  closed: { label: "Closed", tone: "bg-slate-200 text-slate-600" },
  bot: { label: "Assistant", tone: "bg-sky-100 text-sky-700" },
};

const assistantIntroMessage = {
  id: "assistant-intro",
  senderType: "bot",
  senderName: "Assistant",
  body: "Hi there! I'm the platform assistant. Ask me about voting sessions, passwords, or how to get support while we bring a human in if needed.",
};

export default function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(getStoredRole());
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const isAdmin = role === ROLE_ADMIN || role === ROLE_SUPER;

  const selectedSession = useMemo(() => {
    if (!isAdmin) return session;
    if (!activeSessionId) return null;
    return sessions.find((item) => item.id === activeSessionId) || null;
  }, [isAdmin, session, sessions, activeSessionId]);

  useEffect(() => {
    const handleStorage = () => setRole(getStoredRole());
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (isAdmin) {
      loadAdminSessions();
    } else {
      loadUserConversation({ notify: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isAdmin]);

  useEffect(() => {
    if (!open) return;
    const socket = getSocket();
    const handleMessage = (payload) => {
      if (!payload?.sessionId) return;
      if (isAdmin) {
        if (payload.sessionId === activeSessionId) {
          setMessages((prev) => [...prev, payload]);
          scrollToBottom();
        }
      } else {
        if (session && payload.sessionId === session.id) {
          setMessages((prev) => [...prev, payload]);
          scrollToBottom();
        }
      }
    };
    const handleSessionUpdate = () => {
      if (isAdmin) {
        loadAdminSessions();
      } else {
        loadUserConversation({ notify: false });
      }
    };
    socket.on("chat:message", handleMessage);
    socket.on("chat:sessions:update", handleSessionUpdate);
    socket.on("chat:session:update", handleSessionUpdate);
    return () => {
      socket.off("chat:message", handleMessage);
      socket.off("chat:sessions:update", handleSessionUpdate);
      socket.off("chat:session:update", handleSessionUpdate);
    };
  }, [open, isAdmin, session, activeSessionId]);

  useEffect(() => {
    if (!open) return;
    if (selectedSession) {
      const socket = getSocket();
      socket.emit("chat:join", { sessionId: selectedSession.id });
    }
    scrollToBottom();
  }, [selectedSession, open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open, selectedSession]);

  const scrollToBottom = () => {
    if (listRef.current) {
      requestAnimationFrame(() => {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      });
    }
  };

  const formatTimestamp = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  const resolveSenderLabel = (message) => {
    if (!message) return "";
    if (message.senderType === "bot") return "Assistant";
    if (message.senderType === "admin") return message.senderName || "Admin";
    return "You";
  };

  async function loadUserConversation({ notify = true, create = false } = {}) {
    setLoading(true);
    try {
      const query = create ? "?create=1" : "";
      const data = await apiGet(`/api/chat/session${query}`);
      setSession(data.session || null);
      setMessages(data.messages || []);
      if (notify && data.session?.status === "pending") {
        notifyInfo("Hang tight—an admin will join shortly.");
      }
      if (create) {
        setInput("");
      }
    } catch (err) {
      notifyError(err.message || "Unable to load chat");
    } finally {
      setLoading(false);
    }
  }

  async function startNewConversation() {
    await loadUserConversation({ notify: true, create: true });
  }

  async function closeSelectedConversation() {
    if (!selectedSession || selectedSession.status === "closed") return;
    try {
      if (isAdmin) {
        await apiPost(`/api/chat/sessions/${selectedSession.id}/close`, {});
        await loadAdminSessions();
        notifySuccess("Conversation closed");
      } else {
        await apiPost("/api/chat/session/close", {});
        notifySuccess("Conversation ended");
        setSession(null);
        setMessages([]);
      }
    } catch (err) {
      notifyError(err.message || "Unable to close conversation");
    }
  }

  async function loadAdminSessions() {
    setLoading(true);
    try {
      const list = await apiGet("/api/chat/sessions");
      const openSessions = Array.isArray(list) ? list.filter((item) => item.status !== "closed") : [];
      setSessions(openSessions);
      if (openSessions.length && (!activeSessionId || !openSessions.some((s) => s.id === activeSessionId))) {
        setActiveSessionId(openSessions[0].id);
        await loadAdminSessionMessages(openSessions[0].id, false);
      } else if (!openSessions.length) {
        setActiveSessionId(null);
      }
    } catch (err) {
      notifyError(err.message || "Unable to load conversations");
    } finally {
      setLoading(false);
    }
  }

  async function loadAdminSessionMessages(id, showFeedback = true) {
    if (!id) return;
    try {
      const data = await apiGet(`/api/chat/sessions/${id}`);
      setMessages(data.messages || []);
      setActiveSessionId(id);
      setSessions((prev) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((item) => (item.id === id ? { ...item, ...data.session } : item)).filter((item) => item.status !== "closed");
      });
      if (showFeedback && data.session?.status === "pending") {
        notifyInfo("Consider assigning yourself to this conversation.");
      }
    } catch (err) {
      notifyError(err.message || "Failed to load conversation");
    }
  }

  async function takeConversation(id) {
    setAssigning(true);
    try {
      await apiPost(`/api/chat/sessions/${id}/assign`, {});
      await Promise.all([loadAdminSessions(), loadAdminSessionMessages(id, false)]);
      notifySuccess("You're now in this conversation");
    } catch (err) {
      notifyError(err.message || "Unable to assign conversation");
    } finally {
      setAssigning(false);
    }
  }

  const handleSend = async (event, override) => {
    if (event) event.preventDefault();
    const value = (override ?? input).trim();
    if (!value || !selectedSession) return;
    if (selectedSession.status === "closed") {
      notifyInfo("This conversation is closed. Start a new one to send more messages.");
      return;
    }
    try {
      setInput("");
      if (isAdmin) {
        await apiPost(`/api/chat/sessions/${selectedSession.id}/message`, { message: value });
      } else {
        await apiPost("/api/chat/message", { message: value });
      }
      scrollToBottom();
    } catch (err) {
      notifyError(err.message || "Message failed to send");
    }
  };

  const renderingMessages = useMemo(() => messages || [], [messages]);

  const isConversationClosed = selectedSession?.status === "closed";
  const suggestionList = !isAdmin && selectedSession && !isConversationClosed ? userPlaceholders : [];
  const canSendMessage = !!selectedSession && !isConversationClosed;
  const shouldShowAssistantIntro = !isAdmin && selectedSession && renderingMessages.length === 0;

  const statusSummary = () => {
    if (!selectedSession) return "";
    if (selectedSession.status === "closed") return "Conversation closed";
    if (selectedSession.status === "bot") return "Assistant is handling this conversation.";
    if (!selectedSession.assignedAdminName) return "Waiting for an admin";
    return `Chatting with ${selectedSession.assignedAdminName}`;
  };

  return (
    <div className="fixed bottom-5 right-5 z-[120] flex flex-col items-end gap-3">
      {open && (
        <div className="w-[min(100vw-2rem,320px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-700 text-[12px] text-white shadow-sm">
                🤖
              </span>
              <div className="flex flex-col leading-tight">
                <span className="text-[13px] font-semibold text-slate-900">{isAdmin ? "Support desk" : "Assistant"}</span>
                <span className="flex items-center gap-1 text-[9px] font-medium text-emerald-500">
                  <span className="h-1 w-1 rounded-full bg-emerald-500" />
                  Online
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close chat"
            >
              ×
            </button>
          </div>

          {isAdmin ? (
            <div className="max-h-32 overflow-y-auto border-b border-slate-100 px-4 py-3 text-xs">
              {loading && sessions.length === 0 ? (
                <div className="text-slate-500">Loading conversations…</div>
              ) : sessions.length === 0 ? (
                <div className="text-slate-500">No conversations yet.</div>
              ) : (
                <div className="space-y-2">
                  {sessions.map((item) => {
                    const tone = adminStatuses[item.status] || adminStatuses.pending;
                    const active = item.id === activeSessionId;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => loadAdminSessionMessages(item.id)}
                        className={`w-full rounded-2xl border px-3 py-2 text-left transition ${active ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white hover:border-indigo-200"}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-900">{item.userName || `User #${item.userId}`}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${tone.tone}`}>{tone.label}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">Last update {new Date(item.lastMessageAt).toLocaleString()}</p>
                        {item.assignedAdminName && (
                          <p className="text-[11px] text-slate-500">Assigned to {item.assignedAdminName}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="border-b border-slate-200 px-3 py-2 text-[11px] text-slate-500">
              <p>I’ll answer straight away and invite a teammate if you ask for a human.</p>
              <div className="mt-2 space-y-2 text-[10px]">
                {loading && !session ? (
                  <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-center">Loading conversation…</div>
                ) : session ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="flex items-center justify-between font-semibold text-slate-600">
                      <span>Conversation #{session.id}</span>
                      {session.status && (
                        <span className={`rounded-full px-2 py-0.5 text-[9px] uppercase ${(adminStatuses[session.status] || adminStatuses.pending).tone}`}>
                          {(adminStatuses[session.status] || adminStatuses.pending).label}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-slate-500">
                      {session.assignedAdminName ? `Chatting with ${session.assignedAdminName}` : "No human joined yet."}
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={startNewConversation}
                    className="w-full rounded-full border border-indigo-200 px-3 py-2 text-[10px] font-semibold text-indigo-600 transition hover:bg-indigo-50"
                  >
                    Start a conversation
                  </button>
                )}
              </div>
            </div>
          )}

          <div ref={listRef} className="h-52 space-y-3 overflow-y-auto bg-slate-50 px-3 py-3 text-[13px] text-slate-600">
            {loading && !renderingMessages.length ? (
              <div className="text-slate-500">Loading conversation…</div>
          ) : !selectedSession ? (
              <div className="text-slate-500">{isAdmin ? "Select a conversation to get started." : "Start a conversation to get help."}</div>
            ) : (
              <>
                <div className="text-xs text-slate-400">{statusSummary()}</div>
                {shouldShowAssistantIntro && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-indigo-500">
                        <span>Assistant</span>
                        <span>Just now</span>
                      </div>
                      {assistantIntroMessage.body}
                    </div>
                  </div>
                )}
                {renderingMessages.map((message) => {
                  const fromTeam = message.senderType === "admin" || message.senderType === "bot";
                  const isAssistant = message.senderType === "bot";
                  const senderLabel = resolveSenderLabel(message);
                  const timestamp = formatTimestamp(message.createdAt);
                  const bubbleClasses = fromTeam
                    ? isAssistant
                      ? "border border-indigo-100 bg-white text-slate-700"
                      : "bg-slate-100 text-slate-700"
                    : "bg-indigo-600 text-white";
                  const metaTone = fromTeam ? "text-slate-400" : "text-indigo-100";
                  return (
                    <div
                      key={message.id}
                      className={`flex ${fromTeam ? "justify-start" : "justify-end"}`}
                    >
                      <div className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${bubbleClasses}`}>
                        <div className={`mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide ${metaTone}`}>
                            <span>{senderLabel}</span>
                            {timestamp && <span>{timestamp}</span>}
                          </div>
                          <p className="text-[13px] leading-relaxed">{message.body || message.text}</p>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {suggestionList.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pb-3">
              {suggestionList.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSend(null, suggestion)}
                  className="rounded-full border border-slate-200 bg-white/80 px-2 py-1 text-[10px] font-medium text-slate-500 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <form className="border-t border-slate-100 bg-white px-4 py-3" onSubmit={handleSend}>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  !selectedSession
                    ? "Select or start a conversation"
                    : isConversationClosed
                    ? "Conversation closed"
                    : "Type your message…"
                }
                disabled={!canSendMessage}
                className="flex-1 rounded-full border border-slate-200 px-3 py-2 text-[13px] focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:bg-slate-100"
              />
              {isAdmin && selectedSession && !selectedSession.assignedAdminId && (
                <button
                  type="button"
                  onClick={() => takeConversation(selectedSession.id)}
                  className="rounded-full bg-amber-500 px-3 py-1.5 text-[10px] font-semibold text-white shadow hover:bg-amber-600"
                  disabled={assigning}
                >
                  {assigning ? "Assigning…" : "Take it"}
                </button>
              )}
              {selectedSession && !isConversationClosed && (
                <button
                  type="button"
                  onClick={closeSelectedConversation}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                >
                  End chat
                </button>
              )}
              <button
                type="submit"
                className="rounded-full bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow hover:bg-indigo-700 disabled:bg-slate-300"
                disabled={!canSendMessage || !input.trim()}
              >
                Send
              </button>
            </div>
          </form>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="group flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-700 text-white shadow-xl transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
        aria-label="Open support chat"
      >
        <span className="text-lg transition-transform group-hover:scale-110">💬</span>
      </button>
    </div>
  );
}
