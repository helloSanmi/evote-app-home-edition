import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { jget } from "../lib/apiBase";
import { notifyError } from "../components/Toast";

const STATUS_COPY = {
  none: {
    headline: "Verify your identity to continue",
    body: "Upload the required documents so an administrator can confirm your eligibility.",
  },
  pending: {
    headline: "Verification submitted",
    body: "Your documents are under review. We will notify you as soon as an administrator responds.",
  },
  rejected: {
    headline: "Verification needs attention",
    body: "The last submission was not approved. Review the notes below and upload updated documents.",
  },
};

function normalizeStatus(value) {
  return (value || "").toLowerCase();
}

function formatStamp(value) {
  if (!value) return "–";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "–" : date.toLocaleString();
}

function updateVerificationState(profile) {
  if (typeof window === "undefined" || !profile) return;
  const status = normalizeStatus(profile.verificationStatus);
  if (status) {
    localStorage.setItem("verificationStatus", status);
  } else {
    localStorage.removeItem("verificationStatus");
  }
  if (status === "verified") {
    localStorage.removeItem("needsVerification");
  } else {
    localStorage.setItem("needsVerification", "true");
  }
  window.dispatchEvent(new Event("storage"));
}

export default function VerificationRequired() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (typeof window !== "undefined" && !localStorage.getItem("token")) {
          router.replace("/login");
          return;
        }
        const [me, history] = await Promise.all([
          jget("/api/profile/me"),
          jget("/api/verification/requests/me").catch(() => []),
        ]);
        if (!active) return;
        setProfile(me);
        updateVerificationState(me);
        const status = normalizeStatus(me.verificationStatus);
        if (status === "verified") {
          router.replace("/");
          return;
        }
        if (Array.isArray(history)) setRequests(history);
      } catch (err) {
        if (err?.code === "UNAUTHENTICATED") {
          router.replace("/login");
          return;
        }
        notifyError(err.message || "Unable to load verification status");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleStorage = () => {
      const status = normalizeStatus(localStorage.getItem("verificationStatus"));
      const needsVerification = localStorage.getItem("needsVerification") === "true";
      if (status === "verified" || !needsVerification) {
        router.replace("/");
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [router]);

  const status = normalizeStatus(profile?.verificationStatus) || "none";
  const copy = STATUS_COPY[status] || STATUS_COPY.none;
  const latestRequest = useMemo(() => {
    if (!requests.length) return null;
    return [...requests].sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))[0];
  }, [requests]);

  const hasPending = requests.some((item) => normalizeStatus(item.status) === "pending");
  const showHistory = requests.length > 0;

  return (
    <div className="min-h-screen bg-slate-100 py-12">
      <div className="mx-auto max-w-3xl px-4">
        <div className="rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-200/70">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-500">Account review</p>
          <h1 className="mt-4 text-3xl font-bold text-slate-900">{loading ? "Loading verification..." : copy.headline}</h1>
          <p className="mt-3 text-sm text-slate-600">{copy.body}</p>

          {!loading && (
            <>
              <div className="mt-8 space-y-4">
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm text-indigo-900">
                  {status === "pending" ? (
                    <p>
                      Thank you for submitting your documents. Our verification team typically responds within 24–48 hours.
                      You can continue to review your profile but other features remain locked until approval.
                    </p>
                  ) : (
                    <p>
                      Before participating in elections, upload government-issued identification and any supporting documents.
                      Click the button below to manage your submission from your profile.
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <h2 className="text-sm font-semibold text-slate-900">What happens next?</h2>
                  <ol className="mt-3 space-y-2 text-sm text-slate-600">
                    <li>1. Gather a clear scan of your National ID, Voter&apos;s card, passport, or supporting document.</li>
                    <li>2. Upload the files from your profile page using the identity verification form.</li>
                    <li>3. Wait for an administrator to approve your request. We will send a notification with the decision.</li>
                  </ol>
                </div>
              </div>

              {latestRequest && (
                <div className="mt-8 rounded-2xl border border-slate-200 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Latest submission</p>
                      <p className="text-xs text-slate-500">
                        Submitted {latestRequest.submittedAt ? formatStamp(latestRequest.submittedAt) : "recently"}
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                      {normalizeStatus(latestRequest.status) === "pending" ? "Pending review" : normalizeStatus(latestRequest.status)}
                    </span>
                  </div>
                  {latestRequest.adminNotes && (
                    <p className="mt-3 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">
                      Reviewer notes: {latestRequest.adminNotes}
                    </p>
                  )}
                </div>
              )}

              {showHistory && (
                <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-600">
                  <p className="font-semibold text-slate-700">Submission history</p>
                  <ul className="mt-2 space-y-2">
                    {requests.map((req) => (
                      <li key={req.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2 last:border-none last:pb-0">
                        <span>{formatStamp(req.submittedAt)}</span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                          {normalizeStatus(req.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/profile"
              className="inline-flex items-center rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
            >
              {hasPending ? "View your submission" : "Upload documents"}
            </Link>
            <Link
              href="/"
              className="inline-flex items-center rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
