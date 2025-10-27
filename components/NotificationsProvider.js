import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost } from "../lib/apiBase";
import { getSocket } from "../lib/socket";

const NotificationsContext = createContext({
  notifications: [],
  unread: 0,
  loading: false,
  refresh: () => {},
  markRead: async () => {},
  clearOne: async () => {},
  clearAll: async () => {},
  markAllRead: async () => {},
});

function normalizeNotification(raw) {
  if (!raw) return null;
  const createdAt = raw.createdAt ? new Date(raw.createdAt).toISOString() : new Date().toISOString();
  return {
    id: raw.id,
    type: raw.type || "system",
    title: raw.title || "Notification",
    message: raw.message || "",
    scope: (raw.scope || "global").toLowerCase(),
    scopeState: raw.scopeState || null,
    scopeLGA: raw.scopeLGA || null,
    periodId: raw.periodId || null,
    metadata: raw.metadata || null,
    createdAt,
    readAt: raw.readAt ? new Date(raw.readAt).toISOString() : null,
    clearedAt: raw.clearedAt ? new Date(raw.clearedAt).toISOString() : null,
  };
}

export function NotificationsProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const evaluate = () => {
      const token = localStorage.getItem("token");
      setHasSession(Boolean(token));
      if (!token) {
        setNotifications([]);
        fetchedRef.current = false;
      }
    };
    evaluate();
    window.addEventListener("storage", evaluate);
    return () => window.removeEventListener("storage", evaluate);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasSession) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    (async () => {
      setLoading(true);
      try {
        const data = await apiGet("/api/notifications");
        const normalized = Array.isArray(data)
          ? data.map((item) => normalizeNotification(item)).filter(Boolean)
          : [];
        setNotifications(normalized);
      } catch (err) {
        console.error("notifications/load:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [hasSession]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasSession) return;
    const socket = getSocket();
    const handler = (payload) => {
      const normalized = normalizeNotification(payload);
      if (!normalized) return;
      setNotifications((prev) => {
        const exists = prev.some((item) => item.id === normalized.id);
        if (exists) {
          return prev.map((item) => (item.id === normalized.id ? normalized : item));
        }
        return [normalized, ...prev].slice(0, 120);
      });
    };
    socket.on("notification:new", handler);
    return () => socket.off("notification:new", handler);
  }, [hasSession]);

  const unread = useMemo(
    () => notifications.filter((item) => !item.readAt).length,
    [notifications]
  );

  const refresh = async () => {
    if (!hasSession) return;
    setLoading(true);
    try {
      const data = await apiGet("/api/notifications");
      const normalized = Array.isArray(data)
        ? data.map((item) => normalizeNotification(item)).filter(Boolean)
        : [];
      setNotifications(normalized);
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (id) => {
    if (!id) return;
    try {
      await apiPost(`/api/notifications/${id}/read`, {});
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === id && !item.readAt
            ? { ...item, readAt: new Date().toISOString() }
            : item
        )
      );
    } catch (err) {
      console.error("notifications/markRead:", err);
    }
  };

  const clearOne = async (id) => {
    if (!id) return;
    try {
      await apiPost(`/api/notifications/${id}/clear`, {});
      setNotifications((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error("notifications/clearOne:", err);
    }
  };

  const clearAll = async () => {
    if (!notifications.length) return;
    try {
      await apiPost("/api/notifications/clear-all", {});
      setNotifications([]);
    } catch (err) {
      console.error("notifications/clearAll:", err);
    }
  };

  const markAllRead = async () => {
    if (!notifications.length) return;
    try {
      await apiPost("/api/notifications/mark-all-read", {});
      const stamp = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((item) => (item.readAt ? item : { ...item, readAt: stamp }))
      );
    } catch (err) {
      console.error("notifications/markAllRead:", err);
    }
  };

  const value = useMemo(
    () => ({
      notifications,
      unread,
      loading,
      refresh,
      markRead,
      clearOne,
      clearAll,
      markAllRead,
      hasSession,
    }),
    [notifications, unread, loading, hasSession]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationsContext);
