// frontend/pages/register.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { notifyError, notifySuccess } from "../components/Toast";
import { api, safeJson } from "../lib/apiBase";

export default function Register() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // form
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [nationality, setNationality] = useState("Nigerian");
  const [dateOfBirth, setDateOfBirth] = useState("");

  // states → lgas mapping (fetched)
  const [map, setMap] = useState({});
  const states = useMemo(() => Object.keys(map).sort(), [map]);
  const lgas = useMemo(() => (state ? (map[state] || []).sort() : []), [map, state]);

  useEffect(() => {
    if (localStorage.getItem("token")) router.replace("/");
  }, [router]);

  // load mapping (tries local, then remote)
  useEffect(() => {
    (async () => {
      try {
        // optional local file if you add one at /public/ng-states-lgas.json
        const r1 = await fetch("/ng-states-lgas.json");
        if (r1.ok) {
          setMap(await r1.json());
          return;
        }
        throw new Error();
      } catch {
        try {
          // fallback remote (public dataset)
          const r2 = await fetch("../public/ng.states.lgas.json");
          if (r2.ok) {
            setMap(await r2.json());
            return;
          }
          throw new Error();
        } catch {
          // minimal fallback to avoid breaking UI
          setMap({
            "Abuja (FCT)": ["Abaji", "Abuja Municipal", "Bwari", "Gwagwalada", "Kuje", "Kwali"],
            Lagos: ["Agege","Ajeromi-Ifelodun","Alimosho","Amuwo-Odofin","Apapa","Badagry","Epe","Eti-Osa","Ibeju-Lekki","Ifako-Ijaiye","Ikeja","Ikorodu","Kosofe","Lagos Island","Lagos Mainland","Mushin","Ojo","Oshodi-Isolo","Shomolu","Surulere"]
          });
        }
      }
    })();
  }, []);

  useEffect(() => {
    // reset LGA if state changes
    setLga("");
  }, [state]);

  const submit = async (e) => {
    e.preventDefault();
    if (!fullName || !username || !email || !password || !password2 || !phone || !state || !lga || !nationality || !dateOfBirth) {
      return notifyError("Please fill in all fields");
    }
    if (password !== password2) return notifyError("Passwords do not match");

    setBusy(true);
    try {
      const res = await fetch(api("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          username: username.trim().toLowerCase(),   // force lowercase
          email: email.trim(),
          password,
          phone: phone.trim(),
          state,
          residenceLGA: lga,
          nationality,
          dateOfBirth,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "Registration failed");
      notifySuccess("Account created — please sign in");
      router.replace("/login");
    } catch (e2) {
      notifyError(e2.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-2xl shadow p-8 mt-10 transition hover:shadow-lg">
        <h1 className="text-2xl font-bold text-center mb-2">Create your account</h1>
        <p className="text-center text-gray-600 mb-6">Join <span className="text-blue-700 font-semibold">E-Voting</span></p>

        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Full Name" value={fullName} onChange={setFullName} required placeholder="Jane Doe" />
          <Field label="Username" value={username} onChange={(v)=>setUsername(v.toLowerCase())} required placeholder="janedoe" />

          <Field type="email" label="Email" value={email} onChange={setEmail} required placeholder="jane@mail.com" />
          <Field type="tel" label="Phone" value={phone} onChange={setPhone} required placeholder="080..." />

          {/* State */}
          <div>
            <label className="block text-sm text-gray-700 mb-1">State</label>
            <select
              className="border p-3 rounded w-full focus:outline-none focus:ring focus:ring-blue-200"
              value={state}
              onChange={(e) => setState(e.target.value)}
              required
            >
              <option value="">Select state…</option>
              {states.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* LGA */}
          <div>
            <label className="block text-sm text-gray-700 mb-1">LGA</label>
            <select
              className="border p-3 rounded w-full focus:outline-none focus:ring focus:ring-blue-200"
              value={lga}
              onChange={(e) => setLga(e.target.value)}
              required
              disabled={!state}
            >
              <option value="">{state ? "Select LGA…" : "Select state first"}</option>
              {lgas.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Nationality */}
          <div>
            <label className="block text-sm text-gray-700 mb-1">Nationality</label>
            <select
              className="border p-3 rounded w-full focus:outline-none focus:ring focus:ring-blue-200"
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
              required
            >
              <option value="Nigerian">Nigerian</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <Field type="date" label="Date of Birth" value={dateOfBirth} onChange={setDateOfBirth} required />

          <Field type="password" label="Password" value={password} onChange={setPassword} required />
          <Field type="password" label="Confirm Password" value={password2} onChange={setPassword2} required />

          <div className="md:col-span-2">
            <button
              disabled={busy}
              className="w-full bg-green-600 text-white rounded py-3 font-semibold transition hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type="text", placeholder="", required=false }) {
  return (
    <div>
      <label className="block text-sm text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        required={required}
        className="border p-3 rounded w-full focus:outline-none focus:ring focus:ring-blue-200"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
