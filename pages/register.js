// frontend/pages/register.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { notifyError, notifySuccess } from "../components/Toast";
import { api } from "../lip/apiBase";

export default function Register() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("token")) router.replace("/");
  }, [router]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(api("/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, username, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      notifySuccess("Account created — please sign in");
      router.replace("/login");
    } catch (e) {
      notifyError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4">
      <div className="bg-white rounded-2xl shadow p-8 mt-10 transition hover:shadow-lg">
        <h1 className="text-2xl font-bold text-center mb-2">Create your account</h1>
        <p className="text-center text-gray-600 mb-6">
          Join <span className="text-blue-700 font-semibold">E-Voting</span> in a minute
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Full Name</label>
            <input
              className="border p-3 rounded w-full focus:outline-none focus:ring focus:ring-blue-200"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Username</label>
            <input
              className="border p-3 rounded w-full focus:outline-none focus:ring focus:ring-blue-200"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="janedoe"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Email</label>
            <input
              type="email"
              className="border p-3 rounded w-full focus:outline-none focus:ring focus:ring-blue-200"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@mail.com"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Password</label>
            <input
              type="password"
              className="border p-3 rounded w-full focus:outline-none focus:ring focus:ring-blue-200"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button
            disabled={busy}
            className="w-full bg-green-600 text-white rounded py-3 font-semibold transition hover:bg-green-700 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
