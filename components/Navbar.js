// frontend/components/Navbar.js
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { absUrl } from "../lib/apiBase";
import NotificationBell from "./NotificationBell";

export default function Navbar() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState("user");
  const [loggedIn, setLoggedIn] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [avatar, setAvatar] = useState("/avatar.png");
  const profileRef = useRef(null);
  const mobileRef = useRef(null);

  const resolveAvatar = (raw) => {
    const value = (raw || "").trim();
    if (!value) return "/avatar.png";
    if (value === "/avatar.png") return value;
    if (/^https?:/i.test(value)) return value;
    if (value.startsWith("/uploads")) return absUrl(value);
    if (value.startsWith("uploads/")) return absUrl(`/${value}`);
    return value;
  };

  useEffect(() => {
    setMounted(true);
    const sync = () => {
      const storedRole = (localStorage.getItem("role") || "user").toLowerCase();
      setRole(storedRole);
      const adm = storedRole === "admin" || storedRole === "super-admin";
      setIsAdmin(adm);
      setLoggedIn(Boolean(localStorage.getItem("token")));
      const storedAvatar = localStorage.getItem("profilePhoto");
      setAvatar(resolveAvatar(storedAvatar));
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    const closeOnOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
      if (mobileRef.current && !mobileRef.current.contains(e.target)) setMobileOpen(false);
    };
    if (profileOpen || mobileOpen) document.addEventListener("click", closeOnOutside);
    return () => document.removeEventListener("click", closeOnOutside);
  }, [profileOpen, mobileOpen]);

  const signOut = () => {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("userId");
      localStorage.removeItem("username");
      localStorage.removeItem("fullName");
      localStorage.removeItem("profilePhoto");
      localStorage.removeItem("role");
      localStorage.removeItem("isAdmin");
      localStorage.removeItem("state");
      localStorage.removeItem("residenceLGA");
      localStorage.removeItem("chatGuestName");
      localStorage.removeItem("chatGuestToken");
      window.dispatchEvent(new Event("storage"));
    } catch {}
    if (typeof window !== "undefined") window.location.replace("/login");
  };

  const navItem = (href, label, { compact = false } = {}) => (
    <Link
      key={href}
      href={href}
      onClick={() => {
        setProfileOpen(false);
        setMobileOpen(false);
      }}
      className={`rounded-full border ${compact ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-base"} font-semibold transition-colors ${
        router.pathname === href
          ? "border-indigo-200 bg-indigo-50 text-indigo-700 shadow"
          : "border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
      }`}
    >
      {label}
    </Link>
  );

  const adminLinks = [
    { href: "/admin", label: "Admin" },
    { href: "/chat-history", label: "Chat History" },
  ];

  const memberLinks = [
    loggedIn && { href: "/vote", label: "Vote" },
    loggedIn && { href: "/results", label: "Results" },
    loggedIn && { href: "/chat-history", label: "Chat History" },
  ].filter(Boolean);

  const guestLinks = [
    { href: "/login", label: "Login" },
    { href: "/register", label: "Register" },
  ];

  if (!mounted) return null;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-slate-200/60 bg-white/95 backdrop-blur-md shadow-sm">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 md:px-8">
        <Link
          href={isAdmin ? "/admin" : "/"}
          className="flex items-center gap-2 rounded-full px-2 py-1 transition hover:bg-slate-100"
          onClick={() => {
            setProfileOpen(false);
            setMobileOpen(false);
          }}
        >
          <img
            src="/logo.png"
            alt="E-Voting"
            className="h-9 w-9 rounded-full ring-1 ring-slate-200/70"
          />
          <span className="font-extrabold tracking-tight text-base sm:text-lg text-slate-900">
            E-Voting
          </span>
          {isAdmin && (
            <span className="hidden rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-600 md:inline-flex">
              {role === "super-admin" ? "Super Admin" : "Admin"}
            </span>
          )}
        </Link>

        <div className="hidden md:flex items-center gap-3">
          {isAdmin ? (
            <>
              {adminLinks.map((link) => navItem(link.href, link.label, { compact: true }))}
              <NotificationBell />
              <button
                type="button"
                onClick={signOut}
                className="rounded-full px-3.5 py-1.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
              >
                Sign out
              </button>
            </>
          ) : loggedIn ? (
            <>
              {memberLinks.map((link) => navItem(link.href, link.label, { compact: true }))}
              <NotificationBell />
              <div className="relative" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => setProfileOpen((prev) => !prev)}
                  aria-haspopup="true"
                  aria-expanded={profileOpen}
                  className="h-10 w-10 overflow-hidden rounded-full border border-slate-200/60 bg-white shadow-sm ring-1 ring-slate-200/60 transition hover:ring-2 hover:ring-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
                >
                  <img
                    src={resolveAvatar(avatar)}
                    alt="My profile"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = "/avatar.png";
                    }}
                  />
                </button>
                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200/60 bg-white shadow-lg backdrop-blur z-50">
                    <Link
                      href="/profile"
                      className="block px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                      onClick={() => setProfileOpen(false)}
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
            </>
          ) : (
            guestLinks.map((link) => navItem(link.href, link.label, { compact: true }))
          )}
        </div>

        <div className="flex items-center gap-2 md:hidden" ref={mobileRef}>
          <NotificationBell />
          {loggedIn && !isAdmin && (
            <button
              type="button"
              onClick={() => {
                setProfileOpen((prev) => !prev);
                setMobileOpen(false);
              }}
              aria-haspopup="true"
              aria-expanded={profileOpen}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40"
            >
              <img
                src={resolveAvatar(avatar)}
                alt="My profile"
                className="h-8 w-8 rounded-full object-cover"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = "/avatar.png";
                }}
              />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setMobileOpen((prev) => !prev);
              setProfileOpen(false);
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40"
            aria-label="Toggle navigation menu"
          >
            <span className="sr-only">Toggle navigation menu</span>
            <span className="relative block h-4 w-5">
              <span
                className={`absolute left-0 block h-0.5 w-5 rounded-full bg-slate-700 transition-transform ${mobileOpen ? "top-1.5 rotate-45" : "top-0"}`}
              />
              <span
                className={`absolute left-0 top-1.5 block h-0.5 w-5 rounded-full bg-slate-700 transition ${mobileOpen ? "opacity-0" : "opacity-100"}`}
              />
              <span
                className={`absolute left-0 block h-0.5 w-5 rounded-full bg-slate-700 transition-transform ${mobileOpen ? "top-1.5 -rotate-45" : "top-3"}`}
              />
            </span>
          </button>
        </div>

        {profileOpen && loggedIn && !isAdmin && (
          <div className="absolute right-4 top-16 z-50 w-48 overflow-hidden rounded-xl border border-slate-200/60 bg-white shadow-lg backdrop-blur md:hidden">
            <Link
              href="/profile"
              className="block px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              onClick={() => setProfileOpen(false)}
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

      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200/60 bg-white/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4">
            {(isAdmin ? adminLinks : loggedIn ? memberLinks : guestLinks).map((link) => (
              <div key={link.href} className="w-full">
                {navItem(link.href, link.label, { compact: true })}
              </div>
            ))}

            {(isAdmin || loggedIn) && (
              <button
                type="button"
                onClick={signOut}
                className="w-full rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
