import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function getStoredToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("token") || "";
}

function getStoredGuestName() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("chatGuestName") || "";
}

function getStoredGuestToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("chatGuestToken") || "";
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

const STATUS_ONLINE = "online";
const STATUS_OFFLINE = "offline";

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
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getStoredToken()));
  const [guestName, setGuestName] = useState(getStoredGuestName());
  const [guestToken, setGuestToken] = useState(getStoredGuestToken());
  const [guestNameInput, setGuestNameInput] = useState(getStoredGuestName());
  const [guestError, setGuestError] = useState("");
  const [adminStatus, setAdminStatus] = useState(STATUS_OFFLINE);
  const [statusBusy, setStatusBusy] = useState(false);
  const [onlineAdmins, setOnlineAdmins] = useState(null);
  const [prefillDismissed, setPrefillDismissed] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const isAdmin = role === ROLE_ADMIN || role === ROLE_SUPER;
  const isGuestMode = !isAuthenticated && !isAdmin;

  const selectedSession = useMemo(() => {
    if (!isAdmin) return session;
    if (!activeSessionId) return null;
    return sessions.find((item) => item.id === activeSessionId) || null;
  }, [isAdmin, session, sessions, activeSessionId]);

  const fetchAdminStatus = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await apiGet("/api/chat/admin/status");
      const nextStatus = String(data?.status || "").toLowerCase();
      setAdminStatus(nextStatus === STATUS_ONLINE ? STATUS_ONLINE : STATUS_OFFLINE);
    } catch {
      setAdminStatus(STATUS_OFFLINE);
    }
  }, [isAdmin]);

  const fetchAvailability = useCallback(async () => {
    if (isAdmin) return;
    try {
      const data = await apiGet("/api/chat/availability");
      const count = Number.isFinite(Number(data?.onlineAdmins)) ? Number(data.onlineAdmins) : 0;
      setOnlineAdmins(count);
    } catch {
      setOnlineAdmins(0);
    }
  }, [isAdmin]);

  useEffect(() => {
    const handleStorage = () => {
      setRole(getStoredRole());
      setIsAuthenticated(Boolean(getStoredToken()));
      setGuestName(getStoredGuestName());
      setGuestToken(getStoredGuestToken());
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (isAdmin) {
      loadAdminSessions();
      return;
    }
    if (isAuthenticated) {
      loadUserConversation();
      return;
    }
    if (isGuestMode && guestToken) {
      loadGuestConversation();
      return;
    }
    if (isGuestMode && !guestToken) {
      setSession(null);
      setMessages([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isAdmin, isAuthenticated, isGuestMode, guestToken]);

  useEffect(() => {
    if (!guestName) return;
    setGuestNameInput((prev) => (prev ? prev : guestName));
  }, [guestName]);

  useEffect(() => {
    if (!isAdmin) {
      setAdminStatus(STATUS_OFFLINE);
      return;
    }
    fetchAdminStatus();
  }, [isAdmin, fetchAdminStatus]);

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
        loadUserConversation();
      }
    };
    const handleAvailabilityChange = () => {
      if (isAdmin) {
        fetchAdminStatus();
      } else {
        fetchAvailability();
      }
    };
    socket.on("chat:message", handleMessage);
    socket.on("chat:sessions:update", handleSessionUpdate);
    socket.on("chat:session:update", handleSessionUpdate);
    socket.on("chat:availability-change", handleAvailabilityChange);
    return () => {
      socket.off("chat:message", handleMessage);
      socket.off("chat:sessions:update", handleSessionUpdate);
      socket.off("chat:session:update", handleSessionUpdate);
      socket.off("chat:availability-change", handleAvailabilityChange);
    };
  }, [open, isAdmin, session, activeSessionId, fetchAdminStatus, fetchAvailability]);

  useEffect(() => {
    if (!open) return;
    if (selectedSession) {
      const socket = getSocket();
      socket.emit("chat:join", { sessionId: selectedSession.id });
    }
    scrollToBottom();
  }, [selectedSession, open]);

  useEffect(() => {
    if (isAdmin || !open) {
      setOnlineAdmins(null);
      return () => {};
    }
    let ignore = false;
    const run = async () => {
      if (ignore) return;
      await fetchAvailability();
    };
    run();
    const interval = setInterval(run, 30000);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, [open, isAdmin, fetchAvailability]);

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

  const persistGuestDetails = (name, token) => {
    const trimmedName = (name || "").trim();
    setGuestName(trimmedName);
    setGuestNameInput(trimmedName);
    if (typeof window !== "undefined") {
      if (trimmedName) {
        localStorage.setItem("chatGuestName", trimmedName);
      } else {
        localStorage.removeItem("chatGuestName");
      }
      if (token) {
        localStorage.setItem("chatGuestToken", token);
      } else {
        localStorage.removeItem("chatGuestToken");
      }
    }
    setGuestToken(token || "");
  };

  const clearGuestToken = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("chatGuestToken");
    }
    setGuestToken("");
  };

  async function loadUserConversation({ create = false } = {}) {
    if (isGuestMode) {
      if (create) {
        await startGuestConversation();
        return;
      }
      if (!guestToken) return;
      await loadGuestConversation();
      return;
    }
    setLoading(true);
    try {
      const query = create ? "?create=1" : "";
      const data = await apiGet(`/api/chat/session${query}`);
      setSession(data.session || null);
      setMessages(data.messages || []);
      scrollToBottom();
      if (create) {
        setInput("");
      }
    } catch (err) {
      notifyError(err.message || "Unable to load chat");
    } finally {
      setLoading(false);
    }
  }

  async function loadGuestConversation() {
    if (!guestToken) return;
    setLoading(true);
    try {
      const data = await apiGet(`/api/chat/guest/session?token=${encodeURIComponent(guestToken)}`);
      setSession(data.session || null);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      if (data.session?.userDisplayName) {
        persistGuestDetails(data.session.userDisplayName, guestToken);
      }
    } catch (err) {
      const message = err.message || "Unable to load chat";
      if (err.message?.toLowerCase().includes("not found")) {
        clearGuestToken();
        setSession(null);
        setMessages([]);
      }
      notifyError(message);
    } finally {
      setLoading(false);
    }
  }

  async function startNewConversation() {
    if (isGuestMode) {
      await startGuestConversation();
    } else {
      await loadUserConversation({ create: true });
    }
  }

  async function startGuestConversation() {
    const fullName = (guestNameInput || "").trim();
    if (!fullName) {
      setGuestError("Enter your full name to start chatting.");
      return;
    }
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      setGuestError("Please include both your first and last name.");
      return;
    }
    setGuestError("");
    setLoading(true);
    try {
      const data = await apiPost("/api/chat/guest/session", { name: fullName });
      const displayName = data.session?.userDisplayName || fullName;
      persistGuestDetails(displayName, data.token);
      setSession(data.session || null);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      scrollToBottom();
    } catch (err) {
      notifyError(err.message || "Unable to start the chat");
    } finally {
      setLoading(false);
    }
  }

  async function closeSelectedConversation() {
    if (!selectedSession || selectedSession.status === "closed") return;
    try {
      if (isAdmin) {
        await apiPost(`/api/chat/sessions/${selectedSession.id}/close`, {});
        await loadAdminSessions();
        notifySuccess("Conversation closed");
      } else if (isGuestMode) {
        if (!guestToken) {
          notifyError("We couldn't find your chat reference. Please start a new conversation.");
          return;
        }
        await apiPost("/api/chat/guest/session/close", { token: guestToken });
        notifySuccess("Conversation ended");
        setSession((prev) => (prev ? { ...prev, status: "closed" } : prev));
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

  async function toggleAdminStatus() {
    if (!isAdmin) return;
    const nextStatus = adminStatus === STATUS_ONLINE ? STATUS_OFFLINE : STATUS_ONLINE;
    setStatusBusy(true);
    try {
      const data = await apiPost("/api/chat/admin/status", { status: nextStatus });
      const applied = String(data?.status || nextStatus).toLowerCase();
      const normalised = applied === STATUS_ONLINE ? STATUS_ONLINE : STATUS_OFFLINE;
      setAdminStatus(normalised);
      notifySuccess(normalised === STATUS_ONLINE ? "You are now available for chat." : "You are now offline for chat.");
    } catch (err) {
      notifyError(err.message || "Unable to update chat status");
    } finally {
      setStatusBusy(false);
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
    setInput("");
    if (!isAdmin) setPrefillDismissed(true);
    try {
      if (isAdmin) {
        await apiPost(`/api/chat/sessions/${selectedSession.id}/message`, { message: value });
        await loadAdminSessionMessages(selectedSession.id, false);
      } else if (isGuestMode) {
        if (!guestToken) {
          setInput(value);
          notifyError("Please start a chat and share your name before sending messages.");
          return;
        }
        await apiPost("/api/chat/guest/message", { token: guestToken, message: value });
        await loadGuestConversation();
      } else {
        await apiPost("/api/chat/message", { message: value });
        await loadUserConversation();
      }
      scrollToBottom();
    } catch (err) {
      setInput(value);
      notifyError(err.message || "Message failed to send");
    }
  };

  const renderingMessages = useMemo(() => messages || [], [messages]);

  useEffect(() => {
    if (isAdmin) return;
    if (renderingMessages.some((msg) => msg.senderType === "user" || msg.senderType === "guest")) {
      setPrefillDismissed(true);
    }
  }, [renderingMessages, isAdmin]);

  useEffect(() => {
    if (!isAdmin && !selectedSession) {
      setPrefillDismissed(false);
    }
  }, [selectedSession, isAdmin]);

  useEffect(() => {
    if (!isAdmin && !open) {
      setPrefillDismissed(false);
    }
  }, [open, isAdmin]);

  const isConversationClosed = selectedSession?.status === "closed";
  const hasAdminEngaged = Boolean(
    selectedSession?.assignedAdminName || selectedSession?.assignedAdminDisplayName || renderingMessages.some((msg) => msg.senderType === "admin")
  );
  const hasUserMessage = renderingMessages.some((msg) => msg.senderType === "user" || msg.senderType === "guest");
  const suggestionList =
    !isAdmin && selectedSession && !isConversationClosed && !hasAdminEngaged && !hasUserMessage && !prefillDismissed
      ? userPlaceholders
      : [];
  const canSendMessage = !!selectedSession && !isConversationClosed;
  const shouldShowAssistantIntro = !isAdmin && selectedSession && renderingMessages.length === 0;

  const primaryActionClass =
    "inline-flex h-9 min-w-[3.75rem] items-center justify-center rounded-full bg-gradient-to-r from-indigo-600 to-indigo-500 px-3 text-[11px] font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 disabled:opacity-60";

  const secondaryActionClass =
    "inline-flex h-9 min-w-[3.75rem] items-center justify-center rounded-full border border-indigo-100 bg-white px-3 text-[11px] font-semibold text-indigo-600 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-100 disabled:opacity-60";

  const ghostActionClass =
    "inline-flex h-9 min-w-[5rem] items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-[11px] font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-100 disabled:opacity-60";

  const suggestionClass =
    "inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-100";

  const statusSummary = () => {
    if (!selectedSession) return "";
    if (selectedSession.status === "closed") return "Conversation closed";
    if (selectedSession.status === "bot") return "Assistant is handling this conversation.";
    const adminName = selectedSession.assignedAdminDisplayName || selectedSession.assignedAdminName;
    if (!adminName) return "Waiting for an admin";
    return `Chatting with ${adminName}`;
  };

  const showOfflineNotice =
    !isAdmin && selectedSession && selectedSession.status === "pending" && onlineAdmins === 0;

  const adminIsOnline = adminStatus === STATUS_ONLINE;
  const availabilityLabel = isAdmin
    ? (adminIsOnline ? "You are online" : "You are offline")
    : onlineAdmins === null
      ? "Checking availability"
      : onlineAdmins > 0
        ? `${onlineAdmins} admin${onlineAdmins > 1 ? "s" : ""} online`
        : "No admins online";
  const availabilityDot = isAdmin
    ? (adminIsOnline ? "bg-emerald-400" : "bg-amber-400")
    : onlineAdmins === null
      ? "bg-slate-300"
      : onlineAdmins > 0
        ? "bg-emerald-400"
        : "bg-rose-400";

  return (
    <div className="fixed bottom-5 right-5 z-[120] flex flex-col items-end gap-3">
      {open && (
        <div className="flex w-[calc(100vw-1.5rem)] max-h-[75vh] min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_40px_-18px_rgba(79,70,229,0.55)] ring-1 ring-indigo-100/60 sm:w-[360px] sm:max-h-[70vh] lg:w-[380px] lg:max-h-[65vh]">
          <div className="flex items-center justify-between bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-500 px-4 py-3 text-white">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-white/20 text-[13px] shadow-sm">
                🤖
              </span>
              <div className="flex flex-col leading-tight">
                <span className="text-[13px] font-semibold">{isAdmin ? "Support Desk" : "Assistant"}</span>
                <span className="flex items-center gap-1 text-[10px] font-medium text-white/80">
                  <span className={`h-1.5 w-1.5 rounded-full ${availabilityDot}`} />
                  {availabilityLabel}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  type="button"
                  onClick={toggleAdminStatus}
                  disabled={statusBusy}
                  className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/90 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60"
                >
                  {statusBusy ? "Updating…" : adminIsOnline ? "Go offline" : "Go online"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                aria-label="Close chat"
              >
                ×
              </button>
            </div>
          </div>

          {isAdmin ? (
            <div className="max-h-32 shrink-0 overflow-y-auto border-b border-slate-100 bg-slate-50 px-4 py-3 text-[11px] text-slate-600">
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
                        className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                          active ? "border-indigo-200 bg-white shadow-sm" : "border-transparent bg-white/70 hover:border-indigo-100 hover:bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-800">{item.userDisplayName || item.userName || `User #${item.userId}`}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${tone.tone}`}>{tone.label}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">Last update {new Date(item.lastMessageAt).toLocaleString()}</p>
                        {item.assignedAdminDisplayName && (
                          <p className="text-[11px] text-slate-500">Assigned to {item.assignedAdminDisplayName}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[11px] text-slate-600">
              <p className="leading-snug">I’ll answer straight away and invite a teammate if you ask for a human.</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Support status: <span className="normal-case text-slate-700">{availabilityLabel}</span>
              </p>
              <div className="mt-2 space-y-2 text-[10px] leading-snug">
                {loading && !session ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-center">Loading conversation…</div>
                ) : session ? (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
                    <div className="flex items-center justify-between text-[10px] font-semibold uppercase text-slate-500">
                      <span>Conversation #{session.id}</span>
                      {session.status && (
                        <span className={`rounded-full px-2 py-0.5 text-[9px] uppercase ${(adminStatuses[session.status] || adminStatuses.pending).tone}`}>
                          {(adminStatuses[session.status] || adminStatuses.pending).label}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {session.assignedAdminDisplayName || session.assignedAdminName
                        ? `Chatting with ${session.assignedAdminDisplayName || session.assignedAdminName}`
                        : "No human joined yet."}
                    </p>
                    {isGuestMode && session.userDisplayName && (
                      <p className="text-[10px] text-slate-500">You're chatting as {session.userDisplayName}</p>
                    )}
                  </div>
                ) : isGuestMode ? (
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left">
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Enter your full name</p>
                      <input
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[11px] focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                        value={guestNameInput}
                        onChange={(e) => {
                          setGuestNameInput(e.target.value);
                          if (guestError) setGuestError("");
                        }}
                        placeholder="e.g. Jane Doe"
                        autoComplete="name"
                      />
                    </div>
                    {guestError && <p className="text-[10px] text-rose-600">{guestError}</p>}
                    <button
                      type="button"
                      onClick={startGuestConversation}
                      disabled={loading}
                      className={`w-full ${secondaryActionClass} justify-center`}
                    >
                      {loading ? "Starting…" : "Start chat"}
                    </button>
                    {guestToken && (
                      <button
                        type="button"
                        onClick={() => loadGuestConversation()}
                        className={`w-full ${ghostActionClass} justify-center`}
                      >
                        Resume recent conversation
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={startNewConversation}
                    className={`w-full ${secondaryActionClass} justify-center`}
                  >
                    Start a conversation
                  </button>
                )}
              </div>
            </div>
          )}

          <div ref={listRef} className="flex-1 min-h-0 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4 text-[13px] text-slate-600">
            {loading && !renderingMessages.length ? (
              <div className="text-slate-500">Loading conversation…</div>
          ) : !selectedSession ? (
              <div className="text-slate-500">{isAdmin ? "Select a conversation to get started." : "Start a conversation to get help."}</div>
            ) : (
              <>
                <div className="text-xs text-slate-400">{statusSummary()}</div>
                {showOfflineNotice && (
                  <div className="flex justify-start">
                    <div className="max-w-[82%] rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-[12px] text-amber-700 shadow-sm">
                      All our admins are currently offline. Leave your message here and we'll alert the team as soon as someone comes online.
                    </div>
                  </div>
                )}
                {shouldShowAssistantIntro && (
                  <div className="flex justify-start">
                    <div className="max-w-[82%] rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-[13px] text-slate-700 shadow-sm">
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
                      <div className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm ${bubbleClasses}`}>
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
            <div className="flex flex-wrap gap-2 px-4 pb-3">
              {suggestionList.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSend(null, suggestion)}
                  className={suggestionClass}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <form className="shrink-0 border-t border-slate-100 bg-white/95 px-4 py-3" onSubmit={handleSend}>
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
                className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] shadow-sm focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:bg-slate-100"
              />
              {isAdmin && selectedSession && !selectedSession.assignedAdminId && (
                <button
                  type="button"
                  onClick={() => takeConversation(selectedSession.id)}
                  className="inline-flex h-9 items-center justify-center rounded-full bg-amber-500 px-3 text-[11px] font-semibold text-white shadow-sm transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 disabled:opacity-60"
                  disabled={assigning}
                >
                  {assigning ? "Assigning…" : "Take it"}
                </button>
              )}
              {selectedSession && !isConversationClosed && (
                <button
                  type="button"
                  onClick={closeSelectedConversation}
                  className="inline-flex h-9 min-w-[4.25rem] items-center justify-center rounded-full border border-rose-200 bg-white px-3 text-[10px] font-semibold text-rose-600 transition hover:border-rose-300 hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-100 disabled:opacity-60"
                  aria-label="End chat"
                >
                  End chat
                </button>
              )}
              <button
                type="submit"
                className={primaryActionClass}
                aria-label="Send message"
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
