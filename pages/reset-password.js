// frontend/pages/reset-password.js
import { useState } from "react";
import { useRouter } from "next/router";
import { api, safeJson } from "../lib/apiBase";
import { notifyError, notifySuccess } from "../components/Toast";

export default function ResetPassword() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState(""); // yyyy-mm-dd
  const [phone, setPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch(api("/api/auth/reset-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, dateOfBirth, phone, newPassword }),
      });
      const data = await safeJson(r);
      if (!r.ok || !data?.success) throw new Error(data?.error || "Reset failed");
      notifySuccess("Password reset successful — please sign in");
      router.replace("/login");
    } catch (e) {
      notifyError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4">
      <div className="bg-white rounded-2xl shadow p-8 mt-10">
        <h1 className="text-2xl font-bold text-center mb-2">Reset Password</h1>
        <p className="text-center text-gray-600 mb-6">Provide your details to verify your identity</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Username</label>
            <input className="border p-3 rounded w-full" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Date of Birth</label>
            <input type="date" className="border p-3 rounded w-full" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Phone</label>
            <input className="border p-3 rounded w-full" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">New Password</label>
            <input type="password" className="border p-3 rounded w-full" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <button disabled={busy} className="w-full bg-blue-600 text-white rounded py-3 font-semibold hover:bg-blue-700 disabled:opacity-50">
            {busy ? "Resetting…" : "Reset Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
