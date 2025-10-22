// frontend/pages/login.js
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { apiPost } from "../lib/apiBase";
import { notifyError, notifySuccess } from "../components/Toast";
import { reidentifySocket } from "../lib/socket";
import LoadingCurtain from "../components/LoadingCurtain";
import GoogleAuthButton from "../components/GoogleAuthButton";

export default function Login() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountDisabled, setAccountDisabled] = useState(null);

  const persistAuth = (data) => {
    localStorage.setItem("token", data.token);
    localStorage.setItem("userId", data.userId);
    localStorage.setItem("username", data.username);
    if (data.fullName) {
      localStorage.setItem("fullName", data.fullName);
    } else {
      localStorage.removeItem("fullName");
    }
    if (data.firstName) {
      localStorage.setItem("firstName", data.firstName);
    } else {
      localStorage.removeItem("firstName");
    }
    if (data.lastName) {
      localStorage.setItem("lastName", data.lastName);
    } else {
      localStorage.removeItem("lastName");
    }
    if (data.eligibilityStatus) {
      localStorage.setItem("eligibilityStatus", data.eligibilityStatus);
    } else {
      localStorage.removeItem("eligibilityStatus");
    }
    if (data.requiresProfileCompletion) {
      localStorage.setItem("needsProfileCompletion", "true");
    } else {
      localStorage.removeItem("needsProfileCompletion");
    }
    localStorage.setItem("profilePhoto", data.profilePhoto || "/avatar.png");
    localStorage.setItem("role", (data.role || "user").toLowerCase());
    localStorage.setItem("isAdmin", data.isAdmin ? "true" : "false");
    window.dispatchEvent(new Event("storage"));
  };

  const finishLogin = async (data, message = "Signed in successfully") => {
    persistAuth(data);
    notifySuccess(message);
    reidentifySocket();
    let destination = "/";
    if (data.requiresProfileCompletion) {
      destination = "/complete-profile";
    } else {
      const nextRole = (data.role || "user").toLowerCase();
      destination = nextRole === "admin" || nextRole === "super-admin" ? "/admin" : "/";
    }
    try {
      await router.replace(destination);
    } catch (err) {
      console.error("Navigation error after login:", err);
      setBusy(false);
      throw err;
    }
  };

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && localStorage.getItem("token")) {
        const role = (localStorage.getItem("role") || "").toLowerCase();
        const privileged = role === "admin" || role === "super-admin";
        const needsProfile = localStorage.getItem("needsProfileCompletion") === "true";
        if (needsProfile && !privileged && window.location.pathname !== "/complete-profile") {
          router.replace("/complete-profile");
          return;
        }
        if (privileged) {
          router.replace("/admin");
        } else {
          const admin = localStorage.getItem("isAdmin");
          const isAdmin = admin === "true" || admin === "1";
          router.replace(isAdmin ? "/admin" : "/");
        }
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
    setAccountDisabled(null);
    try {
      const data = await apiPost("/api/auth/login", { identifier, password });
      await finishLogin(data);
      return;
    } catch (e2) {
      if (e2?.code === "ACCOUNT_DISABLED") {
        setAccountDisabled({
          message: e2.message || "This account is currently disabled. Reactivate it to continue.",
        });
        setBusy(false);
        return;
      }
      notifyError(e2.message || "Unable to sign you in. Please try again.");
      setBusy(false);
    }
  };

  const handleGoogleCredential = async (credential) => {
    if (!credential) return;
    setBusy(true);
    setAccountDisabled(null);
    try {
      const data = await apiPost("/api/auth/google", { credential });
      await finishLogin(data, "Signed in with Google");
      return;
    } catch (err) {
      if (err?.code === "ACCOUNT_DISABLED") {
        setAccountDisabled({
          message: err.message || "This account is currently disabled. Reactivate it to continue.",
        });
        setBusy(false);
        return;
      }
      notifyError(err.message || "Google sign in failed");
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex min-h-screen items-center bg-slate-100">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-10">
          <div className="grid gap-10 md:grid-cols-2">
            <div className="flex flex-col justify-center">
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-indigo-500 shadow-sm">
                Secure voting
              </span>
              <h1 className="mt-6 text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
                Sign in to get access to your voting dashboard.
              </h1>
              <p className="mt-4 text-base text-slate-600 sm:text-lg">
                Live ballots, real-time results, and secure elections - all in one place.
              </p>
              <ul className="mt-8 space-y-4 text-sm text-slate-600">
                {[
                  "Live dashboards for national and local elections.",
                  "Clear records for every vote.",
                  "Fast help from the support team whenever you need it.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1 inline-flex h-2.5 w-2.5 flex-none rounded-full bg-indigo-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center">
              <div className="w-full rounded-3xl bg-white p-6 shadow-xl">
                <div className="flex flex-col gap-2 text-slate-700">
                  <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
                  <p className="text-sm text-slate-500">Use your credentials or continue with Google.</p>
                </div>
                <form onSubmit={submit} className="mt-6 space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700" htmlFor="identifier">Username or email</label>
                    <input
                      id="identifier"
                      className="form-control border border-slate-200 focus:border-indigo-400 focus:ring-indigo-200"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="johndoe or john@mail.com"
                      autoComplete="username"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700" htmlFor="password">Password</label>
                    <input
                      id="password"
                      type="password"
                      className="form-control border border-slate-200 focus:border-indigo-400 focus:ring-indigo-200"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                    />
                  </div>
                  {accountDisabled && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      <p>{accountDisabled.message}</p>
                      <button
                        type="button"
                        onClick={() => router.push("/reactivate")}
                        className="mt-3 inline-flex items-center justify-center rounded-full border border-amber-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-amber-900 transition hover:border-amber-400 hover:bg-amber-100"
                      >
                        Reactivate account
                      </button>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={busy}
                    className="btn-primary w-full justify-center text-base disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy ? "Signing in…" : "Sign in"}
                  </button>
                </form>

                <div className="mt-6">
                  <GoogleAuthButton onCredential={handleGoogleCredential} text="Continue with Google" disabled={busy} />
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                  <span>
                    New user?{" "}
                    <Link className="font-semibold text-indigo-600 hover:text-indigo-500" href="/register">
                      Create an account
                    </Link>
                  </span>
                  <Link className="font-semibold text-indigo-600 hover:text-indigo-500" href="/reset-password">
                    Forgot password?
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <LoadingCurtain
        active={busy}
        message="Signing you in…"
        subText="Hang tight while we verify your credentials."
      />
    </>
  );
}
