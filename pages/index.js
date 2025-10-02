// frontend/pages/index.js
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { jget } from "../lib/apiBase";
import { notifyError } from "../components/Toast";

const features = [
  {
    title: "Secure by design",
    description: "Every ballot is encrypted end-to-end and auditable by administrators in real time.",
  },
  {
    title: "Live visibility",
    description: "Track voting windows, monitor participation, and view published outcomes instantly.",
  },
  {
    title: "Inclusive access",
    description: "Eligibility rules adapt to national, state, or local elections so the right voters are onboarded.",
  },
];

const quickLinks = [
  { href: "/vote", title: "Vote", subtitle: "Cast your ballot in live sessions" },
  { href: "/results", title: "Results", subtitle: "Review published outcomes" },
  { href: "/profile", title: "Profile", subtitle: "Update your personal details" },
  { href: "/faq", title: "Help / FAQ", subtitle: "Learn how the platform works" },
];

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [active, setActive] = useState(null);
  const [loadingActive, setLoadingActive] = useState(true);

  useEffect(() => {
    setMounted(true);
    const sync = () => {
      const token = localStorage.getItem("token");
      setLoggedIn(!!token);
      setUsername(localStorage.getItem("username") || "");
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    if (!loggedIn) {
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
        notifyError(e.message || "Failed to detect active session");
        setActive(null);
      } finally {
        setLoadingActive(false);
      }
    })();
  }, [loggedIn]);

  const heroButtons = useMemo(() => (
    <div className="mt-8 flex flex-wrap items-center gap-4">
      <Link href="/register" className="btn-primary">
        Create free account
      </Link>
      <Link href="/login" className="btn-secondary">
        Sign in
      </Link>
    </div>
  ), []);

  if (!mounted) return null;

  if (!loggedIn) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 py-12">
        <section className="relative overflow-hidden rounded-[2.5rem] border border-white/40 bg-white/80 px-8 py-14 text-center shadow-[0_40px_120px_-60px_rgba(15,23,42,0.6)] backdrop-blur">
          <div className="mx-auto max-w-3xl space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
              Trusted digital ballots
            </span>
            <h1 className="text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">
              Secure, transparent elections for modern institutions
            </h1>
            <p className="text-base text-slate-600 sm:text-lg">
              Run nationwide or hyper-local elections with live insights, audit trails, and real-time voter eligibility—all in one collaborative dashboard.
            </p>
            {heroButtons}
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="flex flex-col gap-2 rounded-2xl border border-white/45 bg-white/80 p-6 text-left shadow-sm backdrop-blur-sm"
              >
                <h3 className="text-sm font-semibold tracking-wide text-indigo-600 uppercase">
                  {feature.title}
                </h3>
                <p className="text-sm text-slate-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 py-8">
      <section className="rounded-[2.25rem] border border-white/45 bg-white/85 px-6 py-10 shadow-[0_35px_110px_-65px_rgba(15,23,42,0.55)] backdrop-blur md:px-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <p className="text-sm uppercase tracking-[0.35em] text-slate-500">
              Welcome back
            </p>
            <h2 className="text-3xl font-semibold text-slate-900">
              Hello{username ? `, ${username}` : ""} 👋
            </h2>
            <p className="text-sm text-slate-500 md:text-base">
              Stay on top of your active elections, review results, and manage your profile from a single control centre.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex flex-col gap-1 rounded-2xl border border-slate-100 bg-white/80 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="text-sm font-semibold text-slate-900">{link.title}</span>
                  <span className="text-xs text-slate-500">{link.subtitle}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white/75 p-5 shadow-md md:max-w-xs">
            <h3 className="text-sm font-semibold text-slate-900">Active voting window</h3>
            {loadingActive ? (
              <p className="mt-3 text-sm text-slate-500 animate-pulse">Checking live sessions…</p>
            ) : !active ? (
              <p className="mt-3 text-sm text-slate-500">No session is currently open.</p>
            ) : (
              <div className="mt-3 space-y-2 text-sm">
                <div className="font-semibold text-slate-900">{active.title || `Session #${active.id}`}</div>
                <div className="text-slate-500">
                  {new Date(active.startTime).toLocaleString()} — {new Date(active.endTime).toLocaleString()}
                </div>
                <Link href="/vote" className="btn-primary w-full justify-center">
                  Go vote now
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-5 rounded-[2rem] border border-white/45 bg-white/80 p-6 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur md:grid-cols-3 md:p-10">
        <div className="md:col-span-1 space-y-3">
          <h3 className="text-2xl font-semibold text-slate-900">Why institutions trust us</h3>
          <p className="text-sm text-slate-500">
            The platform delivers full lifecycle support for administrators and voters—from registration to final audit.
          </p>
        </div>
        <ul className="md:col-span-2 grid gap-4">
          {[
            {
              title: "Real-time oversight",
              detail: "Admin dashboards highlight unpublished sessions, live participation, and audit discrepancies instantly.",
            },
            {
              title: "Voter confidence",
              detail: "Eligibility checks, profile photo uploads, and secure reset flows keep identities verified without friction.",
            },
            {
              title: "Scalable infrastructure",
              detail: "Socket-powered updates and SQL-backed storage make it ready for organisations of any size.",
            },
          ].map((item) => (
            <li key={item.title} className="rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-sm">
              <h4 className="text-sm font-semibold text-slate-900">{item.title}</h4>
              <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>
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
