import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { jget } from "../lib/apiBase";
import { notifyError } from "../components/Toast";

const heroSlides = [
  {
    eyebrow: "National mandate",
    title: "Deliver credible elections from a single command platform.",
    description: "Coordinate federal, state, and local results with provable integrity, built for election commissions and government partners.",
    highlights: [
      "Full compliance with national electoral regulations across all regions.",
      "Chain-of-custody dashboards for ballots, observers, and result forms.",
    ],
    gradient: "from-indigo-100 via-sky-50 to-white",
    accent: "bg-indigo-500",
  },
  {
    eyebrow: "Command visibility",
    title: "Track turnout and infrastructure readiness as it happens.",
    description: "National situation rooms monitor live participation, logistics, and security escalation pathways on one synchronized map.",
    highlights: [
      "State-by-state turnout heat maps with historic baselines.",
      "Automated anomaly alerts and incident workflows for rapid response.",
    ],
    gradient: "from-emerald-100 via-teal-50 to-white",
    accent: "bg-emerald-500",
  },
  {
    eyebrow: "Inclusive access",
    title: "Every citizen guided securely from registration to results.",
    description: "Multilingual portals, diaspora support, and accessibility-first flows make the national ballot available to every eligible voter.",
    highlights: [
      "Progressive verification for citizens at home and abroad.",
      "Accessibility compliance for assistive technologies and rural bandwidth.",
    ],
    gradient: "from-rose-100 via-fuchsia-50 to-white",
    accent: "bg-rose-500",
  },
];

const strategicPillars = [
  {
    title: "Identity assurance",
    body: "Integrate national ID registries, diaspora rolls, and observer whitelists with layered verification and audit trails.",
  },
  {
    title: "Resilient operations",
    body: "Geo-redundant infrastructure, end-to-end encryption, and adaptive rate limiting maintain uptime under election-day load.",
  },
  {
    title: "Transparent accountability",
    body: "Realtime reconciliation reports, observer dashboards, and exportable audit packs satisfy domestic and international oversight.",
  },
];

const deliverySteps = [
  { title: "Calibrate the election", detail: "Set the national calendar, map constituencies, and onboard central and state administrators." },
  { title: "Accredit officials & voters", detail: "Synchronise national ID, diaspora, and observer lists with automated notifications and reminders." },
  { title: "Coordinate election day", detail: "Monitor turnout, logistics, and security signals while resolving incidents through SOP playbooks." },
  { title: "Declare & archive", detail: "Publish certified results, lodge requisite forms, and hand audit evidence to oversight bodies." },
];

const capabilityBlocks = [
  {
    title: "Unified command centre",
    description: "National, state, and LGA dashboards share turnout, incidents, and escalations in real time with role-based controls.",
  },
  {
    title: "Electoral data governance",
    description: "Retention policies, legal holds, and anonymisation schedules uphold statutory requirements and privacy mandates.",
  },
  {
    title: "Interoperable services",
    description: "REST and socket APIs integrate with call centres, SMS gateways, accreditation devices, and observer portals.",
  },
];

const quickLinks = [
  { href: "/vote", title: "Vote", subtitle: "Place your ballot when a session is open." },
  { href: "/results", title: "Results", subtitle: "Read the latest published outcomes." },
  { href: "/profile", title: "Profile", subtitle: "Keep your personal details current." },
  { href: "/faq", title: "Help", subtitle: "Learn how the platform works." },
];

const footerColumns = [
  {
    title: "Platform",
    links: [
      { label: "Product overview", href: "/#product" },
      { label: "Security & compliance", href: "/#security" },
      { label: "Roadmap", href: "/#roadmap" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Implementation guide", href: "/#implementation" },
      { label: "Admin training", href: "/#training" },
      { label: "Support centre", href: "/faq" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About us", href: "/#about" },
      { label: "Leadership", href: "/#leadership" },
      { label: "Contact", href: "/contact" },
    ],
  },
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
  const [currentSlide, setCurrentSlide] = useState(0);

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

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  if (!mounted) return null;
  if (role === "admin" || role === "super-admin") {
    return null;
  }

  const greetingNameRaw = fullName || username;
  const greetingName = formatDisplayName(greetingNameRaw);
  const activeSlide = heroSlides[currentSlide];

  if (!loggedIn) {
    const accent = activeSlide.accent || "bg-indigo-500";
    return (
      <div className="bg-slate-50 text-slate-900">
        <main className="flex flex-col">
          <section className="relative overflow-hidden border-b border-slate-200">
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${activeSlide.gradient} opacity-80`} />
            <div className="relative mx-auto flex max-w-6xl flex-col gap-12 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:py-24">
              <div className="flex-1 space-y-6">
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/80 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-700 shadow-sm">
                  {activeSlide.eyebrow}
                </span>
                <h1 className="text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
                  {activeSlide.title}
                </h1>
                <p className="max-w-xl text-base text-slate-600 sm:text-lg">
                  {activeSlide.description}
                </p>
                <div className="flex flex-wrap gap-4">
                  <Link href="/register" className="btn-primary text-base shadow-lg shadow-indigo-200/60 hover:shadow-indigo-300/60">
                    Launch your election
                  </Link>
                  <Link href="/login" className="inline-flex items-center rounded-full border border-slate-300 bg-white px-6 py-2.5 text-base font-semibold text-slate-700 transition hover:border-slate-400 hover:text-indigo-600">
                    Sign in
                  </Link>
                </div>
                <ul className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                  {activeSlide.highlights.map((item) => (
                    <li key={item} className="flex items-start gap-3 rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
                      <span className={`mt-1 inline-flex h-2.5 w-2.5 flex-none rounded-full ${accent}`} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2 pt-2">
                  {heroSlides.map((_, idx) => (
                    <button
                      key={idx}
                      aria-label={`Go to slide ${idx + 1}`}
                      onClick={() => setCurrentSlide(idx)}
                      className={`h-2 w-8 rounded-full transition ${idx === currentSlide ? accent : "bg-slate-300 hover:bg-slate-400"}`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex-1 lg:max-w-xl">
                <div className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/80 p-6 shadow-2xl backdrop-blur">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    <span>Election control room</span>
                    <span>Live</span>
                  </div>
                  <div className="mt-6 grid gap-5">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Participation today</p>
                      <p className="mt-2 text-3xl font-semibold text-slate-900">82%</p>
                      <p className="text-xs text-slate-500">Projected close at 87%</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        { label: "Ballots in the last hour", value: "12,498" },
                        { label: "Support chats resolved", value: "94%" },
                        { label: "Integrity alerts", value: "0" },
                        { label: "Average response time", value: "1m 42s" },
                      ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{item.label}</p>
                          <p className="mt-2 text-lg font-semibold text-slate-900">{item.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Next milestone</p>
                      <p className="mt-2 text-slate-700">
                        Results publication window opens at 20:00 UTC with voter notifications primed.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-8 px-4 py-10 sm:px-6 lg:px-10">
              {[
                { value: "80M+", label: "Registered voters supported nationwide" },
                { value: "36", label: "States & FCT synchronized in real time" },
                { value: "176k", label: "Polling units monitored end-to-end" },
                { value: "99.98%", label: "Election week platform availability" },
              ].map((stat) => (
                <div key={stat.label} className="flex flex-col">
                  <span className="text-3xl font-semibold text-slate-900 sm:text-4xl">{stat.value}</span>
                  <span className="text-sm text-slate-500">{stat.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="product" className="bg-white">
            <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-10">
              <div className="mb-10 flex flex-col gap-4 text-slate-600 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <span className="inline-flex w-fit items-center gap-2 rounded-full bg-indigo-50 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-indigo-500">
                    Platform pillars
                  </span>
                  <h2 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">The digital backbone for national election delivery.</h2>
                </div>
                <p className="max-w-lg text-sm sm:text-base">
                  From identity assurance to declaration night, each module reinforces trust for federal election commissions and their partners.
                </p>
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                {strategicPillars.map((pill) => (
                  <div key={pill.title} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="text-base font-semibold text-slate-900">{pill.title}</h3>
                    <p className="text-sm text-slate-600">{pill.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="implementation" className="border-y border-slate-200 bg-slate-100/60">
            <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-10">
              <div className="flex flex-col gap-4">
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600">
                  Implementation playbook
                </span>
                <h2 className="text-3xl font-semibold text-slate-900 sm:text-4xl">From concept to certified results in four stages.</h2>
                <p className="text-base text-slate-600">
                  Proven government playbooks pair technology with policy guidance, ensuring each stage aligns with constitutional and INEC/commission directives.
                </p>
                <div className="mt-6 flex flex-wrap gap-3 text-sm text-indigo-600">
                  <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-2">
                    <span className="h-2 w-2 rounded-full bg-indigo-400" />
                    Configurable constituency and diaspora scopes
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-2">
                    <span className="h-2 w-2 rounded-full bg-indigo-400" />
                    Guided citizen onboarding & accreditation
                  </span>
                </div>
              </div>
              <div className="grid gap-5">
                {deliverySteps.map((step, index) => (
                  <div key={step.title} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-600">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">{step.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="security" className="bg-white">
            <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-10">
              <div className="mb-10 flex flex-col gap-4">
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Operational excellence
                </span>
                <h3 className="text-3xl font-semibold text-slate-900 sm:text-4xl">Capabilities designed for resilient national ballots.</h3>
              </div>
              <div className="grid gap-6 lg:grid-cols-3">
                {capabilityBlocks.map((item) => (
                  <div key={item.title} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h4 className="text-lg font-semibold text-slate-900">{item.title}</h4>
                    <p className="text-sm text-slate-600">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="about" className="border-t border-slate-200 bg-white">
            <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-10">
              <div className="flex flex-col gap-4">
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600">
                  Partnership first
                </span>
                <h3 className="text-3xl font-semibold text-slate-900 sm:text-4xl">Expert support from voter registration to national declaration.</h3>
                <p className="text-base text-slate-600">
                  National support centres, regional command rooms, and international observers rely on our joint operations team for guidance at every critical phase.
                </p>
              </div>
              <div className="grid gap-4 text-sm text-slate-600">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <span className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-500">Advisory</span>
                  <p className="mt-2 text-base text-slate-900">Dedicated electoral operations strategists embedded with your commission and security services.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <span className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-500">Training</span>
                  <p className="mt-2 text-base text-slate-900">Role-based walkthroughs for commissioners, returning officers, call-centre agents, and observers nationwide.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <span className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-500">Continuity</span>
                  <p className="mt-2 text-base text-slate-900">Post-election audits, lessons learned, and readiness programmes for subsequent electoral cycles.</p>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-slate-200 bg-white py-12 text-sm text-slate-600">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 sm:px-6 lg:px-10">
            <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
              <div>
                <h4 className="text-lg font-semibold text-slate-900">National Digital Voting Platform</h4>
                <p className="mt-3 max-w-lg text-sm text-slate-600">
                  Secure infrastructure for election commissions overseeing nationwide, state, local, and diaspora ballots.
                </p>
                <div className="mt-6 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    Certified compliance & national data residency
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2">
                    <span className="h-2 w-2 rounded-full bg-sky-400" />
                    24/7 national operations centre
                  </span>
                </div>
              </div>
              <div className="grid gap-6 sm:grid-cols-3">
                {footerColumns.map((column) => (
                  <div key={column.title}>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">{column.title}</p>
                    <ul className="mt-3 space-y-2">
                      {column.links.map((item) => (
                        <li key={item.label}>
                          <Link href={item.href} className="transition hover:text-indigo-600">
                            {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-6 text-xs text-slate-500">
              <span>&copy; {new Date().getFullYear()} Voting App. All rights reserved.</span>
              <div className="flex gap-4">
                <Link href="/privacy" className="hover:text-indigo-600">Privacy</Link>
                <Link href="/terms" className="hover:text-indigo-600">Terms</Link>
                <Link href="/status" className="hover:text-indigo-600">Status</Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center bg-slate-100">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-10">
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

Home.disableGlobalFooter = true;
Home.fullWidthLayout = true;
