// pages/register.js
import { useMemo, useState } from "react";
import NG from "../public/ng-states-lgas.json";
import { notifyError, notifySuccess } from "../components/Toast";
import { api } from "../lib/apiBase";
import LoadingCurtain from "../components/LoadingCurtain";

function toList(json) {
  const states = Object.keys(json || {});
  return states.map((s) => ({ state: s, lgas: json[s] || [] }));
}

export default function Register() {
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
      window.location.replace("/login");
    } catch (e2) {
      notifyError(e2.message);
    } finally {
      setBusy(false);
    }
  }

  const showMismatch = confirmTouched && password !== confirmPassword;
  const passwordFieldType = showPassword ? "text" : "password";

  return (
    <>
      <div className="mx-auto w-full max-w-5xl">
        <div className="card">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="md:max-w-sm">
              <h1 className="text-3xl font-semibold text-slate-900">Create your voter profile</h1>
              <p className="mt-3 text-sm text-slate-500">
                Complete the information below so we can verify eligibility and match you with the right elections.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-600">
                {[
                  "Use your legal name to match government records.",
                  "We'll only contact you regarding election updates.",
                  "You can update your profile details at any time.",
                ].map((tip) => (
                  <li key={tip} className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            <form onSubmit={submit} className="flex-1 space-y-5">
              <div>
                <label className="form-label" htmlFor="fullName">Full name</label>
                <input
                  id="fullName"
                  className="form-control"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="form-label" htmlFor="username">Username</label>
                  <input
                    id="username"
                    className="form-control"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="janedoe"
                    autoComplete="username"
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    className="form-control"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@email.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <label className="form-label" htmlFor="password">Password</label>
                <div className="relative">
                  <input
                    id="password"
                    type={passwordFieldType}
                    className="form-control pr-20"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a strong password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-1 flex items-center rounded-md px-3 text-sm font-semibold text-indigo-600 transition hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div>
                <label className="form-label" htmlFor="confirmPassword">Confirm password</label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={passwordFieldType}
                    className={`form-control pr-20 ${showMismatch ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : ""}`}
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
                    className="absolute inset-y-0 right-1 flex items-center rounded-md px-3 text-sm font-semibold text-indigo-600 transition hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                {showMismatch && <p className="mt-1 text-sm text-rose-600">Passwords do not match.</p>}
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="form-label" htmlFor="state">State of residence</label>
                  <select
                    id="state"
                    className="form-control"
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
                <div>
                  <label className="form-label" htmlFor="lga">LGA of residence</label>
                  <select
                    id="lga"
                    className="form-control"
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

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="form-label" htmlFor="phone">Phone</label>
                  <input
                    id="phone"
                    className="form-control"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0800 000 0000"
                    autoComplete="tel"
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="nationality">Nationality</label>
                  <input
                    id="nationality"
                    className="form-control cursor-not-allowed bg-slate-100 text-slate-500"
                    value={nationality}
                    readOnly
                    aria-readonly="true"
                  />
                </div>
              </div>

              <div>
                <label className="form-label" htmlFor="dob">Date of birth</label>
                <input
                  id="dob"
                  type="date"
                  className="form-control"
                  value={dateOfBirth}
                  onChange={(e) => setDOB(e.target.value)}
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={busy || showMismatch}
                  className="btn-primary w-full text-base md:w-auto disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {busy ? "Setting up…" : "Create account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      <LoadingCurtain
        active={busy}
        message="Setting up your voter profile…"
        subText="Give us a moment to secure your account details."
      />
    </>
  );
}
