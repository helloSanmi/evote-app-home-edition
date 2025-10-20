import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { notifyError, notifySuccess } from "../components/Toast";
import { apiPost } from "../lib/apiBase";

export default function ReactivateAccount() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !dateOfBirth || !phone.trim() || !password) {
      notifyError("Fill in every field to continue.");
      return;
    }
    setBusy(true);
    try {
      await apiPost("/api/auth/reactivate", {
        username: username.trim(),
        dateOfBirth,
        phone: phone.trim(),
        password,
      });
      notifySuccess("Account reactivated. You can now sign in.");
      setUsername("");
      setDateOfBirth("");
      setPhone("");
      setPassword("");
      router.replace("/login");
    } catch (err) {
      notifyError(err.message || "Unable to reactivate account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 py-12">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-700">
            Account disabled
          </span>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Request account reactivation</h1>
          <p className="mt-3 text-sm text-slate-600 sm:text-base">
            Confirm the details below and we will restore access immediately if everything matches.
          </p>
        </div>

        <div className="card">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="form-label" htmlFor="username">Username</label>
              <input
                id="username"
                className="form-control"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="Enter your username"
              />
            </div>
            <div>
              <label className="form-label" htmlFor="dob">Date of birth</label>
              <input
                id="dob"
                type="date"
                className="form-control"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
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
              <label className="form-label" htmlFor="password">Account password</label>
              <input
                id="password"
                type="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Current password"
              />
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? "Reactivating…" : "Reactivate account"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Changed your mind?{" "}
          <Link href="/login" className="text-indigo-600 underline">
            Return to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
