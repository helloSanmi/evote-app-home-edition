// pages/register.js
import { useMemo, useState } from "react";
import NG from "../public/ng-states-lgas.json";
import { notifyError, notifySuccess } from "../components/Toast";
import { api } from "../lib/apiBase";

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
  const [state, setState] = useState("");
  const [residenceLGA, setLGA] = useState("");
  const [phone, setPhone] = useState("");
  const [nationality, setNationality] = useState("Nigerian");
  const [dateOfBirth, setDOB] = useState("");
  const [busy, setBusy] = useState(false);

  const lgas = base.find((x) => x.state === state)?.lgas || [];

  async function submit(e) {
    e.preventDefault();
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

  return (
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
              <input
                id="password"
                type="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a strong password"
                autoComplete="new-password"
              />
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
                  className="form-control"
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  placeholder="Nigerian"
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
              <button type="submit" disabled={busy} className="btn-primary w-full md:w-auto">
                {busy ? "Creating account…" : "Create account"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
