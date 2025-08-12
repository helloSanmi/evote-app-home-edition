// frontend/pages/login.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { notifyError, notifySuccess } from "../components/Toast";

export default function Login() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("token")) router.replace("/");
  }, [router]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid credentials");
      localStorage.setItem("token", data.token);
      localStorage.setItem("userId", data.userId);
      localStorage.setItem("username", data.username);
      localStorage.setItem("isAdmin", data.isAdmin);
      window.dispatchEvent(new Event("storage"));
      notifySuccess("Signed in successfully");
      router.replace("/");
    } catch (e) {
      notifyError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4">
      <div className="bg-white rounded-2xl shadow p-8 mt-10 transition hover:shadow-lg">
        <h1 className="text-2xl font-bold text-center mb-2">Welcome to <span className="text-blue-700">E-Voting</span></h1>
        <p className="text-center text-gray-600 mb-6">Sign in to continue</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Username or Email</label>
            <input className="border p-3 rounded w-full focus:outline-none focus:ring focus:ring-blue-200"
                   value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="johndoe or john@mail.com" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Password</label>
            <input type="password" className="border p-3 rounded w-full focus:outline-none focus:ring focus:ring-blue-200"
                   value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <button disabled={busy}
                  className="w-full bg-blue-600 text-white rounded py-3 font-semibold transition hover:bg-blue-700 disabled:opacity-50">
            {busy ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
