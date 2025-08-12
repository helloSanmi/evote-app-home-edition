// frontend/pages/index.js
import { useEffect, useState } from "react";
import Link from "next/link";

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const sync = () => {
      setLoggedIn(!!localStorage.getItem("token"));
      setIsAdmin(localStorage.getItem("isAdmin") === "true");
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4">
      <div className="bg-white rounded-2xl shadow p-10 text-center mt-6 transition hover:shadow-lg">
        <h1 className="text-3xl font-extrabold mb-2">Welcome to <span className="text-blue-700">E-Voting</span></h1>
        <p className="text-gray-600 mb-6">Secure, simple, and transparent online elections.</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {!loggedIn && <Link href="/login" className="px-5 py-2 bg-blue-600 text-white rounded transition hover:bg-blue-700">Login</Link>}
          {!loggedIn && <Link href="/register" className="px-5 py-2 bg-gray-200 rounded transition hover:bg-gray-300">Register</Link>}
          {loggedIn && !isAdmin && <Link href="/vote" className="px-5 py-2 bg-green-600 text-white rounded transition hover:bg-green-700">Go to Vote</Link>}
          {loggedIn && !isAdmin && <Link href="/results" className="px-5 py-2 bg-gray-200 rounded transition hover:bg-gray-300">View Results</Link>}
          {loggedIn && isAdmin && <Link href="/admin" className="px-5 py-2 bg-purple-600 text-white rounded transition hover:bg-purple-700">Admin Dashboard</Link>}
          <Link href="/faq" className="px-5 py-2 bg-white border rounded transition hover:bg-gray-50">FAQ</Link>
        </div>
      </div>
    </div>
  );
}
