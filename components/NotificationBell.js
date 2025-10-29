import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useNotifications } from "./NotificationsProvider";

function formatTimeAgo(iso) {
  if (!iso) return "";
  const created = new Date(iso);
  const diffMs = Date.now() - created.getTime();
  const diffSeconds = Math.round(diffMs / 1000);
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 60) return "Just now";
  if (absSeconds < 3600) {
    const mins = Math.floor(absSeconds / 60);
    return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  }
  if (absSeconds < 86400) {
    const hours = Math.floor(absSeconds / 3600);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(absSeconds / 86400);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return created.toLocaleDateString();
}

function resolveCta(notification) {
  if (!notification?.periodId) return null;
  if (notification.type === "results.published") {
    return { href: "/results", label: "View results" };
  }
  return { href: "/vote", label: "Go to ballot" };
}

export default function NotificationBell() {
  const {
    notifications,
    unread,
    markAllRead,
    clearAll,
    clearOne,
    markRead,
    hasSession,
    refresh,
    loading,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    const closeOnOutside = (event) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(event.target)) return;
      if (buttonRef.current && buttonRef.current.contains(event.target)) return;
      setOpen(false);
    };
    if (open) {
      document.addEventListener("mousedown", closeOnOutside);
      document.addEventListener("touchstart", closeOnOutside);
    }
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("touchstart", closeOnOutside);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    markAllRead();
  }, [open, markAllRead]);

  const sorted = useMemo(
    () =>
      [...notifications].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [notifications]
  );

  if (!hasSession) return null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 ${
          open ? "ring-2 ring-indigo-300/60" : ""
        }`}
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V4a2 2 0 1 0-4 0v1.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] translate-x-1/4 -translate-y-1/4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 z-50 mt-3 w-[calc(100vw-2rem)] max-w-xs overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl backdrop-blur sm:w-[360px]"
        >
          <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Notifications</p>
              <p className="text-xs text-slate-500">
                {loading ? "Refreshing…" : unread ? `${unread} unread` : "All caught up"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={refresh}
                className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100"
              >
                Refresh
              </button>
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-100"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {sorted.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                You have no notifications yet.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100/80">
                {sorted.map((item) => {
                  const accent =
                    item.type === "session.cancelled"
                      ? "border-rose-100 bg-rose-50/60"
                      : item.type === "session.created"
                        ? "border-indigo-100 bg-indigo-50/60"
                        : item.type === "results.published"
                          ? "border-emerald-100 bg-emerald-50/60"
                          : "border-slate-100 bg-white";
                  const cta = resolveCta(item);
                  return (
                    <li key={item.id} className={`px-4 py-3 transition-colors ${item.readAt ? "bg-white" : "bg-slate-50/80"}`}>
                      <div className={`rounded-xl border ${accent} px-3 py-2`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                            {item.message && (
                              <p className="mt-1 text-xs text-slate-600">{item.message}</p>
                            )}
                            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              {formatTimeAgo(item.createdAt)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => clearOne(item.id)}
                            className="rounded-full px-2 py-1 text-[11px] font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                            aria-label="Clear notification"
                          >
                            ×
                          </button>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          {cta ? (
                            <Link
                              href={cta.href}
                              onClick={() => {
                                markRead(item.id);
                                setOpen(false);
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-indigo-600 transition hover:bg-indigo-50"
                            >
                              {cta.label}
                              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
                                <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </Link>
                          ) : (
                            <span />
                          )}
                          {!item.readAt && (
                            <button
                              type="button"
                              onClick={() => markRead(item.id)}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100"
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
