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
  const [editing, setEditing] = useState(false);

  // editable fields
  const [phone, setPhone] = useState("");
  const [state, setState] = useState("");
  const [residenceLGA, setResidenceLGA] = useState("");
  const [nationality, setNationality] = useState("Nigerian");
  const [dateOfBirth, setDateOfBirth] = useState("");

  useEffect(() => {
    if (!token) router.replace("/login");
    else load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(api("/api/auth/me"), { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        notifyError("Your session has expired. Please sign in again.");
        localStorage.clear();
        window.dispatchEvent(new Event("storage"));
        router.replace("/login");
        return;
      }
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "Failed to load profile");
      setU(data);

      // prefill editor
      setPhone(data.phone || "");
      setState(data.state || "");
      setResidenceLGA(data.residenceLGA || "");
      setNationality(data.nationality || "Nigerian");
      setDateOfBirth(data.dateOfBirth ? data.dateOfBirth.substring(0, 10) : "");
    } catch (e) {
      notifyError(e.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(api("/api/auth/update-profile"), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          phone: phone || null,
          state: state || null,
          residenceLGA: residenceLGA || null,
          nationality,
          dateOfBirth: dateOfBirth || null,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Update failed");
      notifySuccess("Profile updated");
      setEditing(false);
      await load();
    } catch (e) {
      notifyError(e.message || "Update failed");
    }
  };

  if (loading) return <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-6 mt-6 animate-pulse">Loading…</div>;
  if (!u) return null;

  return (
    <div className="max-w-3xl mx-auto px-4">
      <div className="bg-white rounded-xl shadow p-6 mt-6 transition hover:shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Your Profile</h1>
          <button
            onClick={() => setEditing((v) => !v)}
            className="px-3 py-1.5 rounded bg-gray-900 text-white hover:bg-gray-800"
          >
            {editing ? "Cancel" : "Edit Details"}
          </button>
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
            <Field label="Eligibility" value={u.eligibilityStatus || "pending"} />
            <Field label="Member Since" value={u.createdAt ? new Date(u.createdAt).toLocaleString() : "-"} />
          </div>
        ) : (
          <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Phone" value={phone} onChange={setPhone} placeholder="080..." />
            <Input label="State" value={state} onChange={setState} placeholder="e.g., Abuja" />
            <Input label="Residence LGA" value={residenceLGA} onChange={setResidenceLGA} placeholder="e.g., Municipal" />
            <div>
              <label className="block text-sm text-gray-700 mb-1">Nationality</label>
              <select
                className="border p-3 rounded w-full focus:outline-none focus:ring focus:ring-blue-200"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
              >
                <option value="Nigerian">Nigerian</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <Input type="date" label="Date of Birth" value={dateOfBirth} onChange={setDateOfBirth} />
            <div className="md:col-span-2">
              <button className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700">Save Changes</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="p-4 border rounded-lg bg-gray-50 transition hover:bg-gray-100">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 font-medium">{value ?? "-"}</div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <div>
      <label className="block text-sm text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        className="border p-3 rounded w-full focus:outline-none focus:ring focus:ring-blue-200"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
