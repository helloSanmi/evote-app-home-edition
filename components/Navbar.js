// frontend/components/Navbar.js
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

export default function Navbar() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setMounted(true);
    const sync = () => {
      const raw = localStorage.getItem("isAdmin");
      const admin = raw === "true" || raw === "1";
      setIsAdmin(admin);
      setLoggedIn(!!localStorage.getItem("token"));
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const signOut = () => {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("userId");
      localStorage.removeItem("username");
      localStorage.removeItem("isAdmin");
      window.dispatchEvent(new Event("storage"));
    } catch {}
    if (typeof window !== "undefined") window.location.replace("/login");
  };

  const item = (href, label) => (
    <Link
      href={href}
      className={`px-3 py-1 rounded transition hover:bg-gray-100 ${router.pathname === href ? "bg-gray-200 font-semibold" : ""}`}
    >
      {label}
    </Link>
  );

  if (!mounted) {
    return (
      <nav className="w-full bg-white/90 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-extrabold tracking-tight text-lg">E-Voting</span>
        </div>
      </nav>
    );
  }

  return (
    <nav className="w-full bg-white/90 backdrop-blur border-b">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 hover:opacity-90">
          <img src="/logo.png" alt="E-Voting" className="h-7 w-7 rounded" />
          <span className="font-extrabold tracking-tight text-lg">E-Voting</span>
        </Link>

        <div className="flex items-center gap-2">
          {isAdmin ? (
            <>
              {item("/admin", "Admin")}
              {item("/faq", "FAQ")}
              <button onClick={signOut} className="px-3 py-1 text-red-600 hover:bg-red-50 rounded transition">Sign out</button>
            </>
          ) : (
            <>
              {loggedIn && item("/vote", "Vote")}
              {loggedIn && item("/results", "Results")}
              {loggedIn && item("/profile", "Profile")}
              {item("/faq", "FAQ")}
              {!loggedIn && item("/login", "Login")}
              {!loggedIn && item("/register", "Register")}
              {loggedIn && (
                <button onClick={signOut} className="px-3 py-1 text-red-600 hover:bg-red-50 rounded transition">
                  Sign out
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
