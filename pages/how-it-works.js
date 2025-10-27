import Head from "next/head";
import Link from "next/link";
import { useMemo } from "react";

const STEP_CARDS = [
  {
    title: "Create your secure profile",
    description: "Sign up with verified contact details. We guide you through each identity step so every vote is trusted.",
    icon: (
      <svg className="h-10 w-10 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Z" />
        <path d="M4 22a8 8 0 0 1 16 0" />
      </svg>
    ),
  },
  {
    title: "Join eligible elections",
    description: "Smart filters show the ballots you can participate in, whether national, state, or local.",
    icon: (
      <svg className="h-10 w-10 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 5h18" />
        <path d="M7 4v16" />
        <path d="M17 4v16" />
        <path d="M3 19h18" />
        <path d="m9 9 2.5 2 3.5-4" />
      </svg>
    ),
  },
  {
    title: "Cast & confirm securely",
    description: "Every selection is encrypted, double-checked, and locked with a private receipt for your records.",
    icon: (
      <svg className="h-10 w-10 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 3 4 7v7c0 5 8 7 8 7s8-2 8-7V7Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "Track results in real time",
    description: "Follow live dashboards, turnout analytics, and final results once the polls close.",
    icon: (
      <svg className="h-10 w-10 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 3v18h18" />
        <path d="M7 13l3 3 6-8" />
        <path d="M16 16h2v-6" />
      </svg>
    ),
  },
];

const EXPERIENCE_ROWS = [
  {
    heading: "Built for every voter",
    body: "Accessible design, adaptive language support, and mobile-first ballots help you participate with confidence.",
  },
  {
    heading: "Transparency in every click",
    body: "Live notifications and ballot receipts keep you informed from the first reminder to the final result.",
  },
  {
    heading: "Security without friction",
    body: "Multi-factor checks, encrypted storage, and tamper monitors protect your voice without slowing you down.",
  },
];

export default function HowItWorks() {
  const timeline = useMemo(() => [
    {
      label: "Step 1",
      title: "Verify & get ready",
      copy: "Create your account, confirm your identity, and set your voting preferences. We provide gentle prompts so nothing is missed.",
    },
    {
      label: "Step 2",
      title: "Explore your ballots",
      copy: "See the elections you are eligible for, read about candidates, and follow countdowns until voting opens.",
    },
    {
      label: "Step 3",
      title: "Cast with confidence",
      copy: "Authenticate, select your candidate, and lock your ballot. Once sealed, screenshots are blocked to keep you protected.",
    },
    {
      label: "Step 4",
      title: "Follow the results",
      copy: "Track turnout, receive instant updates, and revisit the results archive whenever you need a refresher.",
    },
  ], []);

  return (
    <>
      <Head>
        <title>How it works · E-Voting</title>
      </Head>
      <div className="relative isolate overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-100">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.12),transparent_55%)]" aria-hidden />
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <header className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white/95 px-6 py-12 shadow-[0_40px_120px_-60px_rgba(37,99,235,0.35)] backdrop-blur lg:px-12 lg:py-16">
            <div className="absolute -top-20 right-12 hidden h-32 w-32 rounded-full bg-indigo-100/70 blur-3xl lg:block" aria-hidden />
            <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div className="space-y-6">
                <span className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-indigo-600">
                  Your trusted voting companion
                </span>
                <h1 className="text-3xl font-bold leading-tight text-slate-900 sm:text-4xl lg:text-5xl">
                  A delightful voting journey designed around you
                </h1>
                <p className="max-w-2xl text-base text-slate-600 sm:text-lg">
                  From the first reminder to the confirmed result, the E-Voting experience keeps you informed, secure, and in control of your voice.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/register"
                    className="group inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100"
                  >
                    Create your account
                    <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M3.5 8H12" />
                      <path d="m8.5 4 4 4-4 4" />
                    </svg>
                  </Link>
                  <Link
                    href="#journey"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    See the journey
                  </Link>
                </div>
              </div>

              <div className="relative isolate">
                <div className="absolute -right-2 -top-4 h-28 w-28 rounded-full bg-indigo-100 blur-2xl" aria-hidden />
                <div className="animate-glow-pulse rounded-3xl border border-indigo-100/70 bg-white/95 p-6 shadow-[0_35px_120px_-65px_rgba(79,70,229,0.45)]">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <span>Live session</span>
                      <span>National</span>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-inner">
                      <div className="flex items-center justify-between text-sm text-slate-600">
                        <span>Turnout</span>
                        <span className="font-semibold text-indigo-600">72%</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400" style={{ width: "72%" }} />
                      </div>
                    </div>
                    <div className="space-y-3">
                      {["Security scanners", "Audit trail", "Notification hub"].map((item) => (
                        <div key={item} className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">✓</span>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <section className="grid gap-6 lg:grid-cols-4" id="journey">
            {STEP_CARDS.map((card, index) => (
              <div
                key={card.title}
                className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_90px_-60px_rgba(15,23,42,0.35)] transition hover:-translate-y-2 hover:border-indigo-200"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <div className="absolute -top-8 right-6 h-16 w-16 rounded-full bg-indigo-100/50 blur-2xl transition group-hover:bg-indigo-200/60" aria-hidden />
                <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500 shadow-sm animate-float-slow">
                  {card.icon}
                </div>
                <h3 className="text-lg font-semibold text-slate-900">{card.title}</h3>
                <p className="mt-3 text-sm text-slate-600">{card.description}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-8 rounded-3xl border border-slate-200 bg-white/95 p-8 shadow-[0_45px_120px_-80px_rgba(14,165,233,0.5)] lg:p-12">
            <div className="max-w-3xl space-y-4">
              <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">A transparent timeline from setup to success</h2>
              <p className="text-base text-slate-600 sm:text-lg">
                Every election follows a rhythm. We’ve distilled the process into four delightful phases, each supported by automation, insights, and human-friendly cues.
              </p>
            </div>
            <div className="space-y-6">
              {timeline.map((stage, index) => (
                <div key={stage.label} className="relative flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-5 shadow-inner animate-rise" style={{ animationDelay: `${index * 90}ms` }}>
                  <span className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{stage.label}</span>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-lg font-semibold text-slate-900">{stage.title}</h3>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Step {index + 1}</span>
                  </div>
                  <p className="text-sm text-slate-600">{stage.copy}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div className="space-y-5">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Why voters love us
              </span>
              <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Experience that feels handcrafted</h2>
              <p className="text-base text-slate-600">
                We sweat the small details—motion, microcopy, and meaningful notifications—so your community feels respected at every tap.
              </p>
              <div className="grid gap-3">
                {EXPERIENCE_ROWS.map((row) => (
                  <div key={row.heading} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-1">
                    <h3 className="text-sm font-semibold text-slate-900">{row.heading}</h3>
                    <p className="mt-2 text-sm text-slate-600">{row.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative isolate">
                  <div className="absolute -left-6 top-10 h-20 w-20 rounded-full bg-emerald-100 blur-2xl" aria-hidden />
                  <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-[0_35px_120px_-70px_rgba(16,185,129,0.45)]">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">🎉</span>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">Success story</p>
                          <p className="text-sm font-semibold text-slate-900">“Voting felt effortless”</p>
                        </div>
                      </div>
                      <p className="text-sm text-slate-600">
                        “Everything was clear, speedy, and safe. I cast my ballot from my phone in minutes and instantly saw confirmation in my notifications.”
                      </p>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>Community voter</span>
                        <span className="font-semibold text-emerald-600">Verified citizen</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

          <section className="rounded-3xl border border-slate-200 bg-white px-6 py-10 text-center shadow-[0_50px_140px_-80px_rgba(79,70,229,0.45)] sm:px-10">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Ready to modernize your election?</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600 sm:text-base">
              Spin up a test election in minutes, invite your team, and experience the end-to-end journey before launch day.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-5 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100"
              >
                Register to vote
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Sign in instead
              </Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
