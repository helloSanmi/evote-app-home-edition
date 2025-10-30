import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { apiPost } from "../lib/apiBase";
import { notifyError, notifySuccess } from "../components/Toast";

export default function ForcePasswordReset() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }
    const needsReset = localStorage.getItem("needsPasswordReset") === "true";
    if (!needsReset) {
      const needsCompletion = localStorage.getItem("needsProfileCompletion") === "true";
      const role = (localStorage.getItem("role") || "user").toLowerCase();
      const privileged = role === "admin" || role === "super-admin";
      const destination = needsCompletion && !privileged
        ? "/complete-profile"
        : privileged ? "/admin" : "/";
      router.replace(destination);
    }
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      notifyError("Fill in your current password and a new password.");
      return;
    }
    if (newPassword.trim().length < 8) {
      notifyError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      notifyError("New password and confirmation do not match.");
      return;
    }
    if (newPassword.trim() === currentPassword.trim()) {
      notifyError("Choose a password different from your current one.");
      return;
    }
    setBusy(true);
    try {
      await apiPost("/api/profile/password/change", {
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
      });
      localStorage.removeItem("needsPasswordReset");
      notifySuccess("Password updated successfully.");
      const needsCompletion = localStorage.getItem("needsProfileCompletion") === "true";
      const role = (localStorage.getItem("role") || "user").toLowerCase();
      const privileged = role === "admin" || role === "super-admin";
      const destination = needsCompletion && !privileged
        ? "/complete-profile"
        : privileged ? "/admin" : "/";
      router.replace(destination);
    } catch (err) {
      notifyError(err.message || "Unable to update password");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center bg-slate-100 py-12">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-10">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-xl shadow-indigo-500/10">
          <div className="grid gap-0 md:grid-cols-[1.3fr_1fr]">
            <div className="space-y-6 px-6 py-8 sm:px-10">
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-4 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-indigo-600">
                Security check
              </span>
              <h1 className="text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
                Set a new password before you continue.
              </h1>
              <p className="text-sm text-slate-600 sm:text-base">
                Your administrator issued a temporary password. Create a secure password that only you know, then continue to your dashboard.
              </p>
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div>
                  <label className="form-label" htmlFor="current-password">Current password</label>
                  <div className="relative flex">
                    <input
                      id="current-password"
                      type={showCurrent ? "text" : "password"}
                      className="form-control pr-24"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Temporary password"
                      disabled={busy}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent((prev) => !prev)}
                      className="absolute inset-y-0 right-0 flex items-center rounded-r-lg bg-transparent px-3 text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                      disabled={busy}
                    >
                      {showCurrent ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="form-label" htmlFor="new-password">New password</label>
                  <div className="relative flex">
                    <input
                      id="new-password"
                      type={showNew ? "text" : "password"}
                      className="form-control pr-24"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      disabled={busy}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew((prev) => !prev)}
                      className="absolute inset-y-0 right-0 flex items-center rounded-r-lg bg-transparent px-3 text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                      disabled={busy}
                    >
                      {showNew ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="form-label" htmlFor="confirm-password">Confirm new password</label>
                  <input
                    id="confirm-password"
                    type="password"
                    className="form-control"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Retype new password"
                    disabled={busy}
                  />
                </div>
                <button type="submit" className="btn-primary w-full sm:w-auto" disabled={busy}>
                  {busy ? "Saving…" : "Update password"}
                </button>
              </form>
            </div>
            <aside className="flex flex-col justify-between rounded-b-3xl border-t border-slate-200 bg-indigo-600/95 px-6 py-8 text-indigo-50 md:rounded-b-none md:rounded-r-3xl md:border-l md:border-t-0">
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Why this extra step?</h2>
                <p className="text-sm text-indigo-100/90">
                  Keeping ballots secure means verifying that only you can access your account. Updating the temporary password ensures your vote stays private.
                </p>
                <ul className="space-y-3 text-sm text-indigo-100/80">
                  <li>• Use a password you haven&apos;t used elsewhere.</li>
                  <li>• Combine letters, numbers, and symbols for extra strength.</li>
                  <li>• Don&apos;t share it—staff will never ask for your password.</li>
                </ul>
              </div>
              <div className="space-y-2 text-xs text-indigo-100/80">
                <p>Need help? Contact your administrator.</p>
                <Link href="/login" className="font-semibold text-white underline-offset-2 hover:underline">
                  Return to sign-in
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

ForcePasswordReset.disableGlobalFooter = true;
