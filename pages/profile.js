// frontend/pages/profile.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { notifyError } from "../components/Toast";
import { api } from "../lip/apiBase";

export default function Profile() {
  const router = useRouter();
  const token = useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("token") : null), []);
  const [u, setU] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) router.replace("/login");
    else load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(api("/auth/me"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load profile");
      setU(data);
    } catch (e) {
      notifyError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-6 mt-6 animate-pulse">Loading…</div>;
  if (!u) return null;

  return (
    <div className="max-w-3xl mx-auto px-4">
      <div className="bg-white rounded-xl shadow p-6 mt-6 transition hover:shadow-lg">
        <h1 className="text-2xl font-bold mb-4">Your Profile</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Full Name" value={u.fullName} />
          <Field label="Username" value={u.username} />
          <Field label="Email" value={u.email} />
          <Field label="Has Voted (latest period)" value={u.hasVoted ? "Yes" : "No"} />
          <Field label="Member Since" value={new Date(u.createdAt).toLocaleString()} />
        </div>
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
