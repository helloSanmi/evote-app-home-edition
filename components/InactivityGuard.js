import { useCallback, useEffect, useRef, useState } from "react";
import { notifyInfo } from "./Toast";

const WARNING_MS = 9 * 60 * 1000;
const LOGOUT_MS = 10 * 60 * 1000;
const PROMPT_SECONDS = Math.round((LOGOUT_MS - WARNING_MS) / 1000);

function clearSession() {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    localStorage.removeItem("fullName");
    localStorage.removeItem("profilePhoto");
    localStorage.removeItem("role");
    localStorage.removeItem("isAdmin");
    localStorage.removeItem("state");
    localStorage.removeItem("residenceLGA");
    localStorage.removeItem("chatGuestName");
    localStorage.removeItem("chatGuestToken");
    window.dispatchEvent(new Event("storage"));
  } catch {}
}

export default function InactivityGuard() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(PROMPT_SECONDS);
  const timersRef = useRef({ warning: null, logout: null, countdown: null });

  const clearAllTimers = useCallback(() => {
    if (timersRef.current.warning) {
      clearTimeout(timersRef.current.warning);
      timersRef.current.warning = null;
    }
    if (timersRef.current.logout) {
      clearTimeout(timersRef.current.logout);
      timersRef.current.logout = null;
    }
    if (timersRef.current.countdown) {
      clearInterval(timersRef.current.countdown);
      timersRef.current.countdown = null;
    }
  }, []);

  const logoutNow = useCallback(() => {
    clearAllTimers();
    setShowPrompt(false);
    clearSession();
    notifyInfo("You have been signed out after 10 minutes of inactivity.");
    if (typeof window !== "undefined") {
      window.location.replace("/login");
    }
  }, [clearAllTimers]);

  const scheduleTimers = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem("token")) {
      clearAllTimers();
      setShowPrompt(false);
      return;
    }
    clearAllTimers();
    setShowPrompt(false);
    setSecondsLeft(PROMPT_SECONDS);
    timersRef.current.warning = setTimeout(() => {
      if (!localStorage.getItem("token")) return;
      setShowPrompt(true);
      setSecondsLeft(PROMPT_SECONDS);
      timersRef.current.countdown = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timersRef.current.countdown);
            timersRef.current.countdown = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, WARNING_MS);
    timersRef.current.logout = setTimeout(() => {
      logoutNow();
    }, LOGOUT_MS);
  }, [clearAllTimers, logoutNow]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const events = ["click", "mousemove", "keydown", "scroll", "touchstart", "focus", "storage"];
    const handler = () => scheduleTimers();
    events.forEach((evt) => window.addEventListener(evt, handler, true));
    scheduleTimers();
    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handler, true));
      clearAllTimers();
    };
  }, [scheduleTimers, clearAllTimers]);

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl">
        <h2 className="text-xl font-semibold text-slate-900">Still there?</h2>
        <p className="mt-2 text-sm text-slate-600">
          You will be signed out soon because we have not seen any activity. Stay signed in to keep working or sign out now.
        </p>
        <p className="mt-4 text-sm font-semibold text-slate-700">Signing out in {secondsLeft}s</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={scheduleTimers}
            className="btn-primary w-full sm:w-auto"
          >
            Stay signed in
          </button>
          <button
            type="button"
            onClick={logoutNow}
            className="btn-secondary w-full sm:w-auto"
          >
            Sign out now
          </button>
        </div>
      </div>
    </div>
  );
}
