import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { apiDelete, apiGet } from "../lib/apiBase";
import { notifyError, notifySuccess } from "../components/Toast";

const statusMap = {
  pending: { label: "Waiting", tone: "bg-amber-100 text-amber-700" },
  active: { label: "Active", tone: "bg-emerald-100 text-emerald-700" },
  closed: { label: "Closed", tone: "bg-slate-200 text-slate-600" },
  bot: { label: "Assistant", tone: "bg-sky-100 text-sky-700" },
};

const firstName = (value) => {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  if (raw.includes("@")) return raw.split("@")[0];
  return raw.split(/\s+/)[0];
};

export default function ChatHistory() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [archives, setArchives] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedMeta, setSelectedMeta] = useState(null);
  const [messages, setMessages] = useState([]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }
    const role = (localStorage.getItem("role") || "user").toLowerCase();
    setIsAdmin(role === "admin" || role === "super-admin");
    setIsSuperAdmin(role === "super-admin");
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    loadArchives();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isAdmin]);

  useEffect(() => {
    if (!archives.length) {
      setSelectedId(null);
      setSelectedMeta(null);
      setMessages([]);
      return;
    }
    if (!selectedId || !archives.some((item) => item.id === selectedId)) {
      const first = archives[0];
      loadArchiveMessages(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archives]);

  const sortedArchives = useMemo(() => {
    if (!Array.isArray(archives)) return [];
    return [...archives].sort((a, b) => {
      const aTime = new Date(a.lastMessageAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.lastMessageAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [archives]);

  async function loadArchives() {
    setLoadingList(true);
    try {
      if (isAdmin) {
        const list = await apiGet("/api/chat/sessions?status=closed");
        setArchives(Array.isArray(list) ? list : []);
      } else {
        const data = await apiGet("/api/chat/session/history");
        const sessions = Array.isArray(data.sessions) ? data.sessions : [];
        setArchives(sessions.filter((item) => item.status === "closed"));
      }
    } catch (err) {
      notifyError(err.message || "Unable to load archived conversations");
      setArchives([]);
    } finally {
      setLoadingList(false);
    }
  }

  async function loadArchiveMessages(id) {
    if (!id) return;
    setLoadingMessages(true);
    try {
      if (isAdmin) {
        const data = await apiGet(`/api/chat/sessions/${id}`);
        setSelectedMeta(data.session || null);
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      } else {
        const data = await apiGet(`/api/chat/session/${id}`);
        setSelectedMeta(data.session || null);
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      }
      setSelectedId(id);
    } catch (err) {
      notifyError(err.message || "Unable to load conversation");
    } finally {
      setLoadingMessages(false);
    }
  }

  async function deleteConversation(id) {
    if (!id || deleting) return;
    const confirmed = window.confirm("Delete this chat permanently? This cannot be undone.");
    if (!confirmed) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/chat/sessions/${id}`);
      notifySuccess("Chat history deleted");
      setArchives((prev) => prev.filter((item) => item.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setSelectedMeta(null);
        setMessages([]);
      }
    } catch (err) {
      notifyError(err.message || "Unable to delete chat");
    } finally {
      setDeleting(false);
    }
  }

  const pageTitle = isAdmin ? "Support Chat History" : "My Chat History";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">{pageTitle}</h1>
        <p className="text-sm text-slate-500">
          Browse your closed chats. Any new messages restart a fresh conversation with the assistant.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-[minmax(0,280px)_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-slate-700">Chat history</h2>
            {loadingList && <span className="text-[11px] uppercase text-slate-400">Loading…</span>}
          </div>
          {sortedArchives.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              {loadingList ? "Fetching history…" : "No conversations to show yet."}
            </div>
          ) : (
            <div className="mt-3 space-y-2 overflow-y-auto">
              {sortedArchives.map((item) => {
                const active = item.id === selectedId;
                const tone = statusMap[item.status] || statusMap.closed;
                const title = isAdmin
                  ? item.userDisplayName || item.userName || `User #${item.userId}`
                  : item.assignedAdminName
                  ? `Chat with ${item.assignedAdminName}`
                  : "Assistant";
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => loadArchiveMessages(item.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                      active ? "border-indigo-300 bg-indigo-50 shadow" : "border-slate-200 bg-white hover:border-indigo-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900">{title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${tone.tone}`}>{tone.label}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Closed {new Date(item.lastMessageAt || item.createdAt).toLocaleString()}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!selectedId ? (
            <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-slate-500">
              Select a chat on the left to review its messages.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {isAdmin
                      ? `Conversation with ${firstName(selectedMeta?.userName || selectedMeta?.userDisplayName || `User #${selectedMeta?.userId}`)}`
                      : selectedMeta?.assignedAdminName
                      ? `Chat with ${selectedMeta.assignedAdminName}`
                      : "Assistant conversation"}
                  </h3>
                <p className="text-xs text-slate-500">
                  Started {selectedMeta?.createdAt ? new Date(selectedMeta.createdAt).toLocaleString() : "—"}
                </p>
                {isAdmin && selectedMeta?.userDisplayName && (
                  <p className="text-xs text-slate-400">Full name: {selectedMeta.userDisplayName}</p>
                )}
              </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  {selectedMeta?.status && (
                    <span className={`rounded-full px-3 py-1 font-semibold uppercase ${(statusMap[selectedMeta.status] || statusMap.closed).tone}`}>
                      {(statusMap[selectedMeta.status] || statusMap.closed).label}
                    </span>
                  )}
                  {selectedMeta?.assignedAdminName && (
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold uppercase text-slate-600">
                      Admin: {selectedMeta.assignedAdminName}
                    </span>
                  )}
                  {isSuperAdmin && selectedId && (
                    <button
                      type="button"
                      onClick={() => deleteConversation(selectedId)}
                      className="rounded-full border border-rose-200 px-3 py-1 font-semibold uppercase text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 disabled:opacity-70"
                      disabled={deleting}
                    >
                      {deleting ? "Deleting…" : "Delete chat"}
                    </button>
                  )}
                </div>
              </div>

              {loadingMessages ? (
                <div className="flex h-64 items-center justify-center text-sm text-slate-500">Loading conversation…</div>
              ) : messages.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-slate-500">
                  No messages were exchanged in this conversation.
                </div>
              ) : (
                <div className="h-[420px] space-y-3 overflow-y-auto rounded-2xl border border-slate-100 px-4 py-4 text-sm text-slate-600">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.senderType === "admin" || message.senderType === "bot"
                          ? "justify-start"
                          : "justify-end"
                      }`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 shadow-sm ${
                          message.senderType === "admin" || message.senderType === "bot"
                            ? "bg-slate-100 text-slate-700"
                            : "bg-indigo-600 text-white"
                        }`}
                      >
                        <p>{message.body}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                          {message.senderName || (message.senderType === "admin" ? "Admin" : message.senderType === "bot" ? "Assistant" : "You")} · {new Date(message.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
