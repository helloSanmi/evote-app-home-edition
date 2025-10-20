// pages/reset-password.js
import { useState } from "react";
import { notifyError, notifySuccess } from "../components/Toast";
import * as base from "../lib/apiBase";

const joinApi = (p) => (typeof base.api === "function" ? base.api(p) : `${base.api}${p}`);

export default function ResetPassword() {
  const [username, setUsername] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!username.trim() || !dob || !phone.trim() || !password) {
      notifyError("Fill in all fields before continuing.");
      return;
    }
    if (password !== confirmPassword) {
      notifyError("Passwords must match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(joinApi("/api/auth/reset-simple"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: username.trim(), dateOfBirth: dob, phone: phone.trim(), newPassword: password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d?.success) throw new Error(d?.message || "Recovery failed");
      notifySuccess("Password reset. You can now sign in.");
      setUsername("");
      setDob("");
      setPhone("");
      setPassword("");
      setConfirmPassword("");
    } catch (e2) {
      notifyError(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[55vh] w-full max-w-4xl items-center">
      <div className="card w-full">
        <div className="mx-auto max-w-lg">
          <h1 className="text-3xl font-semibold text-slate-900 text-center">Reset your password</h1>
          <p className="mt-2 text-center text-sm text-slate-500">
            We&#39;ll verify your details to keep your account secure. Provide your username, registered date of birth, phone number, and a new password.
          </p>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label className="form-label" htmlFor="username">Username</label>
              <input
                id="username"
                className="form-control"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="form-label" htmlFor="dob">Date of birth</label>
              <input
                id="dob"
                type="date"
                className="form-control"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="phone">Phone number</label>
              <input
                id="phone"
                className="form-control"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9+()\s-]/g, ""))}
                placeholder="+234 800 000 0000"
                autoComplete="tel"
              />
            </div>
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
              {busy ? "Submitting…" : "Set New Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
