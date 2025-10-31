import { useCallback, useEffect, useState } from "react";
import { apiPost } from "../lib/apiBase";
import { notifyError, notifySuccess } from "./Toast";
import { forceLogout } from "../lib/logout";

export default function EmailVerificationGate() {
  const [active, setActive] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      const token = localStorage.getItem("token");
      const needsVerification = localStorage.getItem("needsEmailVerification") === "true";
      const storedEmail = localStorage.getItem("email") || "";
      setEmail(storedEmail);
      setActive(Boolean(token) && needsVerification);
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const resend = useCallback(async () => {
    if (!email) {
      notifyError("We do not have an email address on file yet.");
      return;
    }
    setBusy(true);
    try {
      await apiPost("/api/auth/activation/resend", { email });
      notifySuccess("Verification email sent. Please check your inbox.");
    } catch (err) {
      notifyError(err.message || "Unable to resend verification email.");
    } finally {
      setBusy(false);
    }
  }, [email]);

  const signOut = useCallback(() => {
    forceLogout();
  }, []);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 px-4 backdrop-blur-sm">
      <div
        className="pointer-events-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/70 sm:p-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="verify-email-heading"
      >
        <h2 id="verify-email-heading" className="text-2xl font-semibold text-slate-900">Verify your email to continue</h2>
        <p className="mt-3 text-sm text-slate-600">
          We&apos;ve sent an activation link to{" "}
          <span className="font-semibold text-slate-900">{email || "your email address"}</span>.
          Confirm the link to access every voting feature.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={resend}
            disabled={busy}
            className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Sending..." : "Resend verification email"}
          </button>
          <button
            type="button"
            onClick={signOut}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
          >
            Sign out
          </button>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Need help? Contact support or try refreshing this page after verifying your email.
        </p>
      </div>
    </div>
  );
}
