// frontend/pages/login.js
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { apiPost } from "../lib/apiBase";
import { notifyError, notifySuccess } from "../components/Toast";

export default function Login() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem("token")) {
        const admin = localStorage.getItem("isAdmin");
        const isAdmin = admin === "true" || admin === "1";
        router.replace(isAdmin ? "/admin" : "/");
      }
    } catch {}
  }, [router]);

  const submit = async (e) => {
    e.preventDefault();
    if (!identifier.trim() || !password.trim()) {
      notifyError("Enter your username or email and password to continue.");
      return;
    }
    setBusy(true);
    try {
      const data = await apiPost("/api/auth/login", { identifier, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("userId", data.userId);
      localStorage.setItem("username", data.username);
      localStorage.setItem("profilePhoto", data.profilePhoto || "/avatar.png");
      localStorage.setItem("isAdmin", data.isAdmin ? "true" : "false");
      window.dispatchEvent(new Event("storage"));
      notifySuccess("Signed in successfully");
      setTimeout(() => {
        router.replace(data.isAdmin ? "/admin" : "/");
      }, 400);
    } catch (e2) {
      notifyError(e2.message || "Unable to sign you in. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-5xl flex-col justify-center">
      <div className="grid overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_35px_100px_-45px_rgba(15,23,42,0.35)] backdrop-blur-lg md:grid-cols-5">
        <div className="relative hidden flex-col justify-between bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-8 text-slate-100 md:flex md:col-span-2">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-300">Secure Ballots</p>
            <h1 className="mt-4 text-3xl font-semibold leading-tight">Vote with confidence</h1>
            <p className="mt-4 text-sm text-slate-200/90">
              Cast and manage ballots securely, receive real-time updates, and stay informed about every voting session.
            </p>
          </div>
          <ul className="space-y-3 text-sm">
            {[
              "Encrypted sessions with live result updates",
              "Real-time eligibility checks for each voter",
              "Personalised dashboard for current elections",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-sky-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="text-xs text-slate-300/80">Powered by Tech Analytics</div>
        </div>

        <div className="md:col-span-3 p-6 sm:p-10">
          <div className="mx-auto w-full max-w-md">
            <h2 className="text-3xl font-semibold text-slate-900">Welcome back</h2>
            <p className="mt-1 text-sm text-slate-500">Sign in with your registered details to continue.</p>
            <form onSubmit={submit} className="mt-8 space-y-5">
              <div>
                <label className="form-label" htmlFor="identifier">Username or Email</label>
                <input
                  id="identifier"
                  className="form-control"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="johndoe or john@mail.com"
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="form-label" htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="btn-primary w-full text-base"
              >
                {busy ? "Signing in…" : "Sign In"}
              </button>
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>New here? <Link className="font-semibold text-slate-700 hover:text-slate-900" href="/register">Create an account</Link></span>
                <Link className="font-semibold text-slate-700 hover:text-slate-900" href="/reset-password">Forgot password?</Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
