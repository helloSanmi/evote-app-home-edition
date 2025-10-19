// pages/register.js
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import NG from "../public/ng-states-lgas.json";
import { notifyError, notifySuccess } from "../components/Toast";
import { api, apiPost } from "../lib/apiBase";
import LoadingCurtain from "../components/LoadingCurtain";
import GoogleAuthButton from "../components/GoogleAuthButton";
import { reidentifySocket } from "../lib/socket";

function toList(json) {
  const states = Object.keys(json || {});
  return states.map((s) => ({ state: s, lgas: json[s] || [] }));
}

export default function Register() {
  const router = useRouter();
  const base = useMemo(() => toList(NG), []);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [state, setState] = useState("");
  const [residenceLGA, setLGA] = useState("");
  const [phone, setPhone] = useState("");
  const nationality = "Nigerian";
  const [dateOfBirth, setDOB] = useState("");
  const [busy, setBusy] = useState(false);

  const persistAuth = (data) => {
    localStorage.setItem("token", data.token);
    localStorage.setItem("userId", data.userId);
    localStorage.setItem("username", data.username);
    if (data.fullName) {
      localStorage.setItem("fullName", data.fullName);
    } else {
      localStorage.removeItem("fullName");
    }
    localStorage.setItem("profilePhoto", data.profilePhoto || "/avatar.png");
    localStorage.setItem("role", (data.role || "user").toLowerCase());
    localStorage.setItem("isAdmin", data.isAdmin ? "true" : "false");
    window.dispatchEvent(new Event("storage"));
  };

  const finishLogin = (data, message) => {
    persistAuth(data);
    notifySuccess(message);
    reidentifySocket();
    setTimeout(() => {
      const nextRole = (data.role || "user").toLowerCase();
      router.replace(nextRole === "admin" || nextRole === "super-admin" ? "/admin" : "/");
    }, 400);
  };

  const lgas = base.find((x) => x.state === state)?.lgas || [];

  const isEligibleAge = (dob) => {
    if (!dob) return false;
    const birthDate = new Date(dob);
    if (Number.isNaN(birthDate.getTime())) return false;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age -= 1;
    }
    return age >= 18;
  };

  async function submit(e) {
    e.preventDefault();
    setConfirmTouched(true);
    if (!password || password !== confirmPassword) {
      notifyError("Passwords must match before continuing.");
      return;
    }
    if (!dateOfBirth) {
      notifyError("Select your date of birth.");
      return;
    }
    const birthDate = new Date(dateOfBirth);
    if (Number.isNaN(birthDate.getTime())) {
      notifyError("Enter a valid date of birth.");
      return;
    }
    if (birthDate > new Date()) {
      notifyError("Date of birth cannot be in the future.");
      return;
    }
    if (!isEligibleAge(dateOfBirth)) {
      notifyError("You must be at least 18 years old to register.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${api}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          username,
          email,
          password,
          state,
          residenceLGA,
          phone,
          nationality,
          dateOfBirth,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error?.message || j?.message || "Registration failed");
      notifySuccess("Account created. Please sign in.");
      router.replace("/login");
    } catch (e2) {
      notifyError(e2.message);
    } finally {
      setBusy(false);
    }
  }

  const showMismatch = confirmTouched && password !== confirmPassword;
  const passwordFieldType = showPassword ? "text" : "password";

  const handleGoogleCredential = async (credential) => {
    if (!credential) return;
    setBusy(true);
    try {
      const data = await apiPost("/api/auth/google", { credential });
      finishLogin(data, "Signed in with Google");
    } catch (err) {
      notifyError(err.message || "Google sign in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-slate-100">
        <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-10">
          <div className="grid gap-10 md:grid-cols-2">
            <div className="flex flex-col justify-center text-slate-700">
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-indigo-500 shadow-sm">
                Join the platform
              </span>
              <h1 className="mt-6 text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
                Set up your voter account today.
              </h1>
              <p className="mt-4 text-base text-slate-600 sm:text-lg">
                Share a few details so we can confirm who you are and keep you ready for every election.
              </p>
              <ul className="mt-8 space-y-4 text-sm text-slate-600">
                {[
                  "Use the same name that appears on your identification.",
                  "Select the state and local area where you vote.",
                  "Add a phone number so we can reach you if we need to.",
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
                  <h2 className="text-2xl font-semibold text-slate-900">Create account</h2>
                  <p className="text-sm text-slate-500">Complete the form or continue with Google.</p>
                </div>

                <form onSubmit={submit} className="mt-6 space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700" htmlFor="fullName">Full name</label>
                    <input
                      id="fullName"
                      className="form-control border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-indigo-200"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Jane Doe"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700" htmlFor="username">Username</label>
                      <input
                        id="username"
                        className="form-control border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-indigo-200"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="janedoe"
                        autoComplete="username"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700" htmlFor="email">Email</label>
                      <input
                        id="email"
                        type="email"
                        className="form-control border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-indigo-200"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="jane@email.com"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700" htmlFor="password">Password</label>
                    <div className="relative">
                      <input
                        id="password"
                        type={passwordFieldType}
                        className="form-control pr-24 border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-indigo-200"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Create a strong password"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-1 flex items-center rounded-md px-3 text-xs font-semibold uppercase tracking-wide text-indigo-500 transition hover:text-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700" htmlFor="confirmPassword">Confirm password</label>
                    <div className="relative">
                      <input
                        id="confirmPassword"
                        type={passwordFieldType}
                        className={`form-control pr-24 border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-indigo-200 ${showMismatch ? "border-rose-500 focus:border-rose-500 focus:ring-rose-200" : ""}`}
                        value={confirmPassword}
                        onChange={(e) => {
                          if (!confirmTouched) setConfirmTouched(true);
                          setConfirmPassword(e.target.value);
                        }}
                        onBlur={() => setConfirmTouched(true)}
                        placeholder="Retype your password"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-1 flex items-center rounded-md px-3 text-xs font-semibold uppercase tracking-wide text-indigo-500 transition hover:text-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    {showMismatch && <p className="text-xs text-rose-500">Passwords must match before you continue.</p>}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700" htmlFor="state">State of residence</label>
                      <select
                        id="state"
                        className="form-control border border-slate-200 bg-white text-slate-900 focus:border-indigo-400 focus:ring-indigo-200"
                        value={state}
                        onChange={(e) => {
                          setState(e.target.value);
                          setLGA("");
                        }}
                      >
                        <option value="">Select state…</option>
                        {base.map((x) => (
                          <option key={x.state} value={x.state}>
                            {x.state}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700" htmlFor="lga">LGA of residence</label>
                      <select
                        id="lga"
                        className="form-control border border-slate-200 bg-white text-slate-900 focus:border-indigo-400 focus:ring-indigo-200"
                        value={residenceLGA}
                        onChange={(e) => setLGA(e.target.value)}
                        disabled={!state}
                      >
                        <option value="">{state ? "Select LGA…" : "Pick state first"}</option>
                        {lgas.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700" htmlFor="phone">Phone</label>
                      <input
                        id="phone"
                        className="form-control border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-indigo-200"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="0800 000 0000"
                        autoComplete="tel"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700" htmlFor="nationality">Nationality</label>
                      <input
                        id="nationality"
                        className="form-control cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-500"
                        value={nationality}
                        readOnly
                        aria-readonly="true"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700" htmlFor="dob">Date of birth</label>
                    <input
                      id="dob"
                      type="date"
                      className="form-control border border-slate-200 bg-white text-slate-900 focus:border-indigo-400 focus:ring-indigo-200"
                      value={dateOfBirth}
                      onChange={(e) => setDOB(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy || showMismatch}
                    className="btn-primary w-full justify-center text-base disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy ? "Creating your account…" : "Create account"}
                  </button>
                </form>

                <div className="mt-6">
                  <GoogleAuthButton onCredential={handleGoogleCredential} text="Sign up with Google" disabled={busy} />
                </div>

                <p className="mt-6 text-center text-sm text-slate-600">
                  Already have an account?{" "}
                  <Link className="font-semibold text-indigo-600 hover:text-indigo-500" href="/login">
                    Sign in instead
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <LoadingCurtain
        active={busy}
        message="Creating your account…"
        subText="This will only take a moment."
      />
    </>
  );
}
