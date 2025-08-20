// frontend/pages/profile.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { notifyError, notifySuccess } from "../components/Toast";
import { api, safeJson } from "../lib/apiBase";

export default function Profile() {
  const router = useRouter();
  const token = useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("token") : null), []);
  const [u, setU] = useState(null);
  const [loading, setLoading] = useState(true);

  // edit state
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [stateSel, setStateSel] = useState("");
  const [lgaSel, setLgaSel] = useState("");

  // NG states/LGAs (loaded from /public/ng-states-lgas.json)
  const [ngStates, setNgStates] = useState([]); // [{state, lgas:[]}]
  const [lgas, setLgas] = useState([]);

  // Load NG JSON (client-side) & normalize shapes
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/ng-states-lgas.json", { cache: "force-cache" });
        const raw = await r.json();
        let arr = [];
        if (Array.isArray(raw)) {
          arr = raw;
        } else if (Array.isArray(raw?.states)) {
          arr = raw.states;
        } else if (raw && typeof raw === "object") {
          arr = Object.keys(raw).map((k) => ({ state: k, lgas: raw[k] || [] }));
        }
        setNgStates(arr);
      } catch {
        setNgStates([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!token) router.replace("/login");
    else load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const st = ngStates.find((s) => String(s.state || "").toLowerCase() === String(stateSel || "").toLowerCase());
    setLgas(st?.lgas || []);
    setLgaSel((prev) => (st?.lgas?.includes(prev) ? prev : ""));
  }, [stateSel, ngStates]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(api("/api/auth/me"), { headers: { Authorization: `Bearer ${token}` } });
      const data = await safeJson(r);
      if (!r.ok) throw new Error(data?.error || "Failed to load profile");
      setU(data);
      setEmail(data.email || "");
      setPhone(data.phone || "");
      setStateSel(data.state || "");
      // initialize lgas list then pick residenceLGA if valid
      const st = ngStates.find((s) => String(s.state || "").toLowerCase() === String(data.state || "").toLowerCase());
      setLgas(st?.lgas || []);
      setLgaSel(st?.lgas?.includes(data.residenceLGA) ? data.residenceLGA : "");
    } catch (e) {
      notifyError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    try {
      const r = await fetch(api("/api/auth/profile"), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email,
          phone,
          state: stateSel,
          residenceLGA: lgaSel,
        }),
      });
      const data = await safeJson(r);
      if (!r.ok || !data?.success) throw new Error(data?.error || "Failed to update");
      setU(data.user);
      setEditing(false);
      notifySuccess("Profile updated");
    } catch (e) {
      notifyError(e.message);
    }
  }

  if (loading) return <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-6 mt-6 animate-pulse">Loading…</div>;
  if (!u) return null;

  return (
    <div className="max-w-3xl mx-auto px-4">
      <div className="bg-white rounded-xl shadow p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Your Profile</h1>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="px-3 py-2 rounded border hover:bg-gray-50">Edit</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => { setEditing(false); load(); }} className="px-3 py-2 rounded border hover:bg-gray-50">Cancel</button>
              <button onClick={save} className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Save Changes</button>
            </div>
          )}
        </div>

        {!editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Full Name" value={u.fullName} />
            <Field label="Username" value={u.username} />
            <Field label="Email" value={u.email} />
            <Field label="Phone" value={u.phone || "-"} />
            <Field label="State" value={u.state || "-"} />
            <Field label="Residence LGA" value={u.residenceLGA || "-"} />
            <Field label="Nationality" value={u.nationality || "-"} />
            <Field label="Date of Birth" value={u.dateOfBirth ? new Date(u.dateOfBirth).toLocaleDateString() : "-"} />
            <Field label="Has Voted (latest period)" value={u.hasVoted ? "Yes" : "No"} />
            <Field label="Member Since" value={new Date(u.createdAt).toLocaleString()} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EditField label="Email">
              <input className="border p-2 rounded w-full" value={email} onChange={(e) => setEmail(e.target.value)} />
            </EditField>
            <EditField label="Phone">
              <input className="border p-2 rounded w-full" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </EditField>
            <EditField label="State">
              <select className="border p-2 rounded w-full" value={stateSel} onChange={(e) => setStateSel(e.target.value)}>
                <option value="">Select</option>
                {ngStates.map((s) => <option key={s.state} value={s.state}>{s.state}</option>)}
              </select>
            </EditField>
            <EditField label="Residence LGA">
              <select className="border p-2 rounded w-full" value={lgaSel} onChange={(e) => setLgaSel(e.target.value)} disabled={!stateSel}>
                <option value="">{stateSel ? "Select LGA" : "Select State first"}</option>
                {lgas.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </EditField>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 font-medium break-words">{value ?? "-"}</div>
    </div>
  );
}
function EditField({ label, children }) {
  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{label}</div>
      {children}
    </div>
  );
}
