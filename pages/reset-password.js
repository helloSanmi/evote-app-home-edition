import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { notifyError, notifySuccess } from "../components/Toast";
import { apiPost } from "../lib/apiBase";

export default function ResetPassword() {
  const router = useRouter();
  const tokenFromQuery = useMemo(() => {
    if (!router?.query?.token) return "";
    const value = Array.isArray(router.query.token) ? router.query.token[0] : router.query.token;
    return value || "";
  }, [router.query]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(tokenFromQuery ? "reset" : "request");

  useEffect(() => {
    if (tokenFromQuery) {
      setStage("reset");
    }
  }, [tokenFromQuery]);

  async function requestLink(e) {
    e.preventDefault();
    if (!email.trim()) {
      notifyError("Enter the email address linked to your account.");
      return;
    }
    setBusy(true);
    try {
      await apiPost("/api/auth/request-password-reset", { email: email.trim() });
      notifySuccess("If that email exists in our system, a reset link is on its way.");
      setEmail("");
    } catch (err) {
      notifyError(err.message || "Unable to send reset email");
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword(e) {
    e.preventDefault();
    const token = tokenFromQuery.trim();
    if (!token) {
      notifyError("Reset token is missing. Request a new link.");
      return;
    }
    if (!password || password.length < 8) {
      notifyError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      notifyError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await apiPost("/api/auth/reset-password", { token, password });
      notifySuccess("Password updated. You can now sign in.");
      setPassword("");
      setConfirmPassword("");
      router.replace({ pathname: "/login" });
    } catch (err) {
      notifyError(err.message || "Unable to reset password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[55vh] w-full max-w-4xl items-center">
      <div className="card w-full">
        <div className="mx-auto max-w-lg">
          <h1 className="text-3xl font-semibold text-slate-900 text-center">
            {stage === "reset" ? "Choose a new password" : "Reset your password"}
          </h1>
          {stage === "reset" ? (
            <p className="mt-2 text-center text-sm text-slate-500">
              Set a new password for your EVote account. The link expires shortly, so finish the update now.
            </p>
          ) : (
            <p className="mt-2 text-center text-sm text-slate-500">
              Enter the email address you used to register. We’ll email you a secure link to create a new password.
            </p>
          )}

          {stage === "reset" ? (
            <form onSubmit={submitNewPassword} className="mt-8 space-y-5">
              <div>
                <label className="form-label" htmlFor="password">New password</label>
                <input
                  id="password"
                  type="password"
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a secure password"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="form-label" htmlFor="confirm-password">Confirm new password</label>
                <input
                  id="confirm-password"
                  type="password"
                  className="form-control"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Retype your new password"
                  autoComplete="new-password"
                />
              </div>
              <button type="submit" disabled={busy} className="btn-primary w-full">
                {busy ? "Updating…" : "Save new password"}
              </button>
            </form>
          ) : (
            <form onSubmit={requestLink} className="mt-8 space-y-5">
              <div>
                <label className="form-label" htmlFor="email">Email address</label>
                <input
                  id="email"
                  type="email"
                  className="form-control"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <button type="submit" disabled={busy} className="btn-primary w-full">
                {busy ? "Sending…" : "Email me a reset link"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
