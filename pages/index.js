import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { jget } from "../lib/apiBase";
import { notifyError } from "../components/Toast";

const benefits = [
  {
    title: "Trusted results",
    description: "Every vote is stored securely with clear records.",
  },
  {
    title: "Live status",
    description: "See when a session opens, closes, and publishes.",
  },
  {
    title: "Simple onboarding",
    description: "Guide every voter through sign up in a few steps.",
  },
];

const quickLinks = [
  { href: "/vote", title: "Vote", subtitle: "Place your ballot when a session is open." },
  { href: "/results", title: "Results", subtitle: "Read the latest published outcomes." },
  { href: "/profile", title: "Profile", subtitle: "Keep your personal details current." },
  { href: "/faq", title: "Help", subtitle: "Learn how the platform works." },
];

const formatDisplayName = (value) => {
  if (!value) return "";
  return value
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

export default function Home() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("user");
  const [active, setActive] = useState(null);
  const [loadingActive, setLoadingActive] = useState(true);

  useEffect(() => {
    setMounted(true);
    const sync = () => {
      const token = localStorage.getItem("token");
      setLoggedIn(!!token);
      setUsername(localStorage.getItem("username") || "");
      setFullName(localStorage.getItem("fullName") || "");
      const storedRole = (localStorage.getItem("role") || "user").toLowerCase();
      setRole(storedRole);
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (role === "admin" || role === "super-admin") {
      router.replace("/admin");
    }
  }, [role, router, mounted]);

  useEffect(() => {
    if (!loggedIn || role === "admin" || role === "super-admin") {
      setActive(null);
      setLoadingActive(false);
      return;
    }
    (async () => {
      setLoadingActive(true);
      try {
        const current = await findActivePeriod();
        setActive(current || null);
      } catch (e) {
        notifyError(e.message || "We could not load your sessions.");
        setActive(null);
      } finally {
        setLoadingActive(false);
      }
    })();
  }, [loggedIn, role]);

  if (!mounted) return null;
  if (role === "admin" || role === "super-admin") {
    return null;
  }

  const greetingNameRaw = fullName || username;
  const greetingName = formatDisplayName(greetingNameRaw);

  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-slate-100">
        <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-10">
          <div className="grid gap-10 md:grid-cols-2">
            <div className="flex flex-col justify-center text-slate-700">
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-indigo-500 shadow-sm">
                Digital voting
              </span>
              <h1 className="mt-6 text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
                Online voting with security and confidence.
              </h1>
              <p className="mt-4 text-base text-slate-600 sm:text-lg">
                Vote and view results.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link href="/register" className="btn-primary text-base shadow-lg shadow-indigo-300/40 hover:shadow-indigo-400/40">
                  Create account
                </Link>
                <Link href="/login" className="inline-flex items-center rounded-full border border-slate-200 bg-white px-6 py-2.5 text-base font-semibold text-slate-700 transition hover:border-indigo-400 hover:text-indigo-500">
                  Sign in
                </Link>
              </div>
            </div>

            <div className="flex items-center">
              <div className="w-full rounded-3xl bg-white p-6 shadow-xl">
                <h3 className="text-sm font-semibold text-slate-900">Why voters choose us</h3>
                <ul className="mt-6 space-y-4 text-sm text-slate-600">
                  {benefits.map((item) => (
                    <li key={item.title} className="flex items-start gap-3">
                      <span className="mt-1 inline-flex h-2.5 w-2.5 flex-none rounded-full bg-indigo-400" />
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">{item.title}</span>
                        <span className="text-sm font-normal text-slate-600">{item.description}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="flex flex-col rounded-3xl bg-white p-8 shadow-xl">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600">
              Dashboard
            </span>
            <h2 className="mt-6 text-3xl font-semibold text-slate-900 sm:text-4xl">
              {greetingName ? `Welcome back, ${greetingName}.` : "Welcome back."}
            </h2>
            <p className="mt-4 text-sm text-slate-600 sm:text-base">
              Track live activity, review past votes, and stay ready for the next session.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-md"
                >
                  <span className="text-sm font-semibold text-slate-900">{link.title}</span>
                  <span className="text-xs text-slate-500">{link.subtitle}</span>
                  <span className="text-sm font-semibold text-indigo-500 transition group-hover:text-indigo-400">&rarr;</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-3xl bg-white p-6 shadow-xl">
              <h3 className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-600">
                Active session
              </h3>
              {loadingActive ? (
                <p className="mt-4 text-sm text-slate-500 animate-pulse">Checking for live sessions...</p>
              ) : !active ? (
                <p className="mt-4 text-sm text-slate-500">No session is open right now.</p>
              ) : (
                <div className="mt-4 space-y-3 text-sm">
                  <div className="text-base font-semibold text-slate-900">{active.title || `Session #${active.id}`}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(active.startTime).toLocaleString()} to {new Date(active.endTime).toLocaleString()}
                  </div>
                  <Link href="/vote" className="btn-primary w-full justify-center text-base">
                    Go to voting
                  </Link>
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-xl">
              <h3 className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-600">Stay ready</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                <li className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-2.5 w-2.5 flex-none rounded-full bg-indigo-400" />
                  <span>Review your profile before each session begins.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-2.5 w-2.5 flex-none rounded-full bg-indigo-400" />
                  <span>Set reminders so you never miss the closing time.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-2.5 w-2.5 flex-none rounded-full bg-indigo-400" />
                  <span>Share the invite link with voters who are not yet registered.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  async function findActivePeriod() {
    const sessions = await jget("/api/public/eligible-sessions");
    if (!Array.isArray(sessions)) return null;
    const now = Date.now();
    const activePeriod = sessions.find((session) => {
      const start = new Date(session.startTime).getTime();
      const end = new Date(session.endTime).getTime();
      return now >= start && now <= end && !session.resultsPublished && !session.forcedEnded;
    });
    return activePeriod || null;
  }
}
