// frontend/components/Navbar.js
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

export default function Navbar() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatar, setAvatar] = useState("/avatar.png");
  const menuRef = useRef(null);

  useEffect(() => {
    setMounted(true);
    const sync = () => {
      const adm = (localStorage.getItem("isAdmin") || "").toLowerCase();
      setIsAdmin(adm === "true" || adm === "1");
      setLoggedIn(!!localStorage.getItem("token"));
      const storedAvatar = localStorage.getItem("profilePhoto");
      setAvatar(storedAvatar || "/avatar.png");
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [menuOpen]);

  const signOut = () => {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("userId");
      localStorage.removeItem("username");
      localStorage.removeItem("profilePhoto");
      localStorage.removeItem("isAdmin");
      window.dispatchEvent(new Event("storage"));
    } catch {}
    if (typeof window !== "undefined") window.location.replace("/login");
  };

  const navItem = (href, label) => (
    <Link
      key={href}
      href={href}
      className={`rounded-full border px-4 py-2 text-base font-semibold transition-colors ${
        router.pathname === href
          ? "border-indigo-200 bg-indigo-50 text-indigo-700 shadow"
          : "border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
      }`}
    >
      {label}
    </Link>
  );

  if (!mounted) return null;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-slate-200/60 bg-white backdrop-blur-md shadow-sm">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-full px-2 py-1 transition hover:bg-slate-100"
        >
          <img
            src="/logo.png"
            alt="E-Voting"
            className="h-9 w-9 rounded-full ring-1 ring-slate-200/70"
          />
          <span className="font-extrabold tracking-tight text-lg text-slate-900">
            E-Voting
          </span>
        </Link>

        <div className="flex items-center gap-2 md:gap-3">
          {isAdmin ? (
            <>
              {navItem("/admin", "Admin")}
              <button
                type="button"
                onClick={signOut}
                className="rounded-full px-3.5 py-1.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              {loggedIn && navItem("/vote", "Vote")}
              {loggedIn && navItem("/results", "Results")}
              {loggedIn ? (
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setMenuOpen((open) => !open)}
                    aria-haspopup="true"
                    aria-expanded={menuOpen}
                    className="h-10 w-10 overflow-hidden rounded-full border border-slate-200/60 bg-white shadow-sm transition hover:ring-2 hover:ring-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
                  >
                    <img src={avatar} alt="My profile" className="h-full w-full object-cover" />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200/60 bg-white shadow-lg backdrop-blur z-50">
                      <Link
                        href="/profile"
                        className="block px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                      >
                        Profile
                      </Link>
                      <button
                        type="button"
                        onClick={signOut}
                        className="w-full px-4 py-2 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                      >
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {navItem("/login", "Login")}
                  {navItem("/register", "Register")}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
