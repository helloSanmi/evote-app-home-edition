// frontend/components/CookieBanner.js
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPost } from "../lib/apiBase";

const STORAGE_KEY = "cookieConsent";
const VISITOR_KEY = "cookieConsentVisitor";
const DEFAULT_PREFS = Object.freeze({ analytics: true, marketing: true });

function parsePrefs(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      visitorId: typeof parsed.visitorId === "string" ? parsed.visitorId : null,
    };
  } catch {
    return null;
  }
}

function generateVisitorId() {
  if (typeof window === "undefined") return null;
  const random =
    window.crypto?.randomUUID?.() ||
    `visitor_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return random.slice(0, 64);
}

function ensureVisitorId(existing) {
  if (typeof window === "undefined") return existing || null;
  try {
    const stored = localStorage.getItem(VISITOR_KEY);
    if (stored && stored.trim()) {
      return stored.trim();
    }
  } catch {
    /* ignore */
  }
  const generated = existing?.trim() || generateVisitorId();
  try {
    if (generated) {
      localStorage.setItem(VISITOR_KEY, generated);
    }
  } catch {
    /* ignore */
  }
  return generated;
}

function persistLocalPrefs({ analytics, marketing }, visitorId) {
  if (typeof window === "undefined") return;
  const payload = {
    version: 1,
    analytics: Boolean(analytics),
    marketing: Boolean(marketing),
    visitorId: visitorId || null,
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export default function CookieBanner() {
  const [show, setShow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [syncing, setSyncing] = useState(false);

  const syncConsent = useCallback(async (nextPrefs) => {
    if (typeof window === "undefined") return;
    const analytics = Boolean(nextPrefs.analytics);
    const marketing = Boolean(nextPrefs.marketing);
    const visitorId = ensureVisitorId(nextPrefs.visitorId);
    persistLocalPrefs({ analytics, marketing }, visitorId);
    try {
      setSyncing(true);
      const response = await apiPost("/api/privacy/consent", {
        analytics,
        marketing,
        visitorId,
      });
      if (response?.visitorId && response.visitorId !== visitorId) {
        localStorage.setItem(VISITOR_KEY, response.visitorId);
        persistLocalPrefs({ analytics, marketing }, response.visitorId);
      }
    } catch (err) {
      console.error("cookieConsent/sync", err);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = parsePrefs(stored);
      if (parsed) {
        const visitorId = ensureVisitorId(parsed.visitorId);
        setPrefs({ analytics: parsed.analytics, marketing: parsed.marketing });
        setShow(false);
        syncConsent({ analytics: parsed.analytics, marketing: parsed.marketing, visitorId });
      } else {
        setShow(true);
      }
    } catch {
      setShow(true);
    }
  }, [syncConsent]);

  const acceptAll = useCallback(() => {
    const next = { analytics: true, marketing: true };
    setPrefs(next);
    setShow(false);
    syncConsent(next);
  }, [syncConsent]);

  const declineAll = useCallback(() => {
    const next = { analytics: false, marketing: false };
    setPrefs(next);
    setShow(false);
    syncConsent(next);
  }, [syncConsent]);

  const savePreferences = useCallback(() => {
    setShow(false);
    setShowSettings(false);
    syncConsent(prefs);
  }, [prefs, syncConsent]);

  const description = useMemo(
    () =>
      "By clicking “Accept all cookies”, you agree to the storing of cookies on your device to enhance site navigation, analyze site usage, personalize advertising, and assist in our marketing efforts.",
    []
  );

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[95%] max-w-3xl -translate-x-1/2">
      <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-[0_25px_80px_-45px_rgba(15,23,42,0.55)] backdrop-blur">
        <div className="space-y-3 text-sm text-slate-700">
          <p>{description}</p>
          <p>
            View our{" "}
            <a href="/privacy#cookies" className="font-semibold text-indigo-600 underline-offset-2 hover:underline">
              Cookie Policy
            </a>{" "}
            for more information.
          </p>
        </div>

        {showSettings && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
            <h3 className="text-sm font-semibold text-slate-900">Cookie preferences</h3>
            <p className="mt-1 text-xs text-slate-500">
              Essential cookies are always on. Adjust analytics or marketing cookies below.
            </p>

            <div className="mt-4 space-y-3">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked
                  disabled
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Essential</span>
                  <span className="text-xs text-slate-500">
                    Required for core site features such as security, session management, and accessibility.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={prefs.analytics}
                  onChange={(e) => setPrefs((prev) => ({ ...prev, analytics: e.target.checked }))}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Analytics</span>
                  <span className="text-xs text-slate-500">
                    Helps us understand how the site is used so we can measure and improve performance.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={prefs.marketing}
                  onChange={(e) => setPrefs((prev) => ({ ...prev, marketing: e.target.checked }))}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Marketing</span>
                  <span className="text-xs text-slate-500">
                    Personalizes advertising and supports campaigns across our channels.
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200/70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={savePreferences}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/70 disabled:opacity-60"
                disabled={syncing}
              >
                Save preferences
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {!showSettings && (
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200/70"
            >
              Cookie settings
            </button>
          )}
          <button
            type="button"
            onClick={declineAll}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200/70 disabled:opacity-60"
            disabled={syncing}
          >
            Decline non-essential
          </button>
          <button
            type="button"
            onClick={acceptAll}
            className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200/70 disabled:opacity-60"
            disabled={syncing}
          >
            Accept all cookies
          </button>
        </div>
      </div>
    </div>
  );
}

