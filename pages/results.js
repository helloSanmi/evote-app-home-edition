import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { jget } from "../lib/apiBase";
import { mediaUrl } from "../lib/mediaUrl";
import { notifyError } from "../components/Toast";

export default function Results() {
  const router = useRouter();
  const [accessChecked, setAccessChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [sessions, setSessions] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [rows, setRows] = useState([]);
  const [participation, setParticipation] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateAccess = () => {
      const role = (localStorage.getItem("role") || "user").toLowerCase();
      const privileged = role === "admin" || role === "super-admin";
      setAllowed(!privileged);
      setAccessChecked(true);
      if (privileged) router.replace("/admin");
    };
    updateAccess();
    window.addEventListener("storage", updateAccess);
    return () => window.removeEventListener("storage", updateAccess);
  }, [router]);

  useEffect(() => {
    if (!allowed) return;
    let mounted = true;
    (async () => {
      try {
        const list = await jget("/api/public/published-sessions");
        if (!mounted) return;
        setSessions(list);
        if (Array.isArray(list) && list.length) {
          setSelectedSessionId((prev) => {
            if (prev && list.some((session) => session.id === prev)) return prev;
            return list[0].id;
          });
        } else {
          setSelectedSessionId(null);
        }
      } catch (e) {
        notifyError(e.message || "Failed to load sessions");
        setSessions([]);
        setSelectedSessionId(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    if (!selectedSessionId) {
      setRows([]);
      setParticipation(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await jget(`/api/public/results?periodId=${selectedSessionId}`);
        if (!cancelled) setRows(Array.isArray(r) ? r : []);
      } catch (e) {
        if (!cancelled) {
          notifyError(e.message || "Failed to load results");
          setRows([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSessionId, allowed]);

  useEffect(() => {
    if (!allowed) return;
    if (!selectedSessionId) {
      setParticipation(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const status = await jget(`/api/vote/status?periodId=${selectedSessionId}`);
        if (!cancelled) {
          setParticipation({ hasVoted: !!status?.hasVoted, youVoted: status?.youVoted || null });
        }
      } catch (e) {
        if (!cancelled) setParticipation(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSessionId, allowed]);

  useEffect(() => {
    if (allowed) return;
    setSessions(null);
    setRows([]);
    setSelectedSessionId(null);
    setParticipation(null);
  }, [allowed]);

  const sortedSessions = useMemo(() => {
    if (!Array.isArray(sessions)) return [];
    return [...sessions].sort((a, b) => new Date(b.endTime) - new Date(a.endTime));
  }, [sessions]);

  const selectedSession = useMemo(() => {
    if (!sortedSessions.length) return null;
    const match = sortedSessions.find((session) => session.id === selectedSessionId);
    return match || sortedSessions[0];
  }, [sortedSessions, selectedSessionId]);

  const displayRows = useMemo(() => {
    if (!Array.isArray(rows)) return [];
    return [...rows].sort((a, b) => b.votes - a.votes);
  }, [rows]);

  if (!accessChecked || (accessChecked && !allowed)) {
    return null;
  }

  if (sessions === null) {
    return (
      <div className="mx-auto flex min-h-[40vh] w-full max-w-4xl items-center justify-center px-4">
        <div className="rounded-3xl border border-slate-200 bg-white px-10 py-12 text-center shadow-[0_35px_110px_-65px_rgba(15,23,42,0.55)] backdrop-blur">
          <div className="animate-pulse text-sm text-slate-500">Loading published sessions…</div>
        </div>
      </div>
    );
  }

  if (!sortedSessions.length) {
    return (
      <div className="mx-auto flex min-h-[40vh] w-full max-w-4xl items-center justify-center px-4">
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-10 py-12 text-center text-slate-600 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">No results published yet</h2>
          <p className="mt-2 text-sm text-slate-500">As soon as administrators publish a session, its breakdown will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6">
      <div className="space-y-4 md:grid md:grid-cols-[minmax(0,260px)_1fr] md:gap-4 md:space-y-0">
        <aside className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <h2 className="px-2 text-sm font-semibold text-slate-700">Published sessions</h2>
          <div className="space-y-1">
            {sortedSessions.map((session) => {
              const active = selectedSession && selectedSession.id === session.id;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setSelectedSessionId(session.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    active ? "border-indigo-300 bg-indigo-50 shadow" : "border-slate-200 bg-white hover:border-indigo-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{session.title || `Session #${session.id}`}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-600">
                      {session.scope}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{new Date(session.endTime).toLocaleString()}</p>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!selectedSession ? (
            <div className="text-sm text-slate-500">Pick a session from the list to view its results.</div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-xl font-semibold text-slate-900">{selectedSession.title || `Session #${selectedSession.id}`}</h1>
                  <p className="text-xs text-slate-500">{new Date(selectedSession.startTime).toLocaleString()} — {new Date(selectedSession.endTime).toLocaleString()}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold uppercase">Scope: {selectedSession.scope}</span>
                  {selectedSession.scopeState && <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold uppercase">{selectedSession.scopeState}</span>}
                  {selectedSession.scope === "local" && selectedSession.scopeLGA && (
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold uppercase">{selectedSession.scopeLGA}</span>
                  )}
                </div>
              </div>

              {participation && (
                <div className={`rounded-2xl border px-4 py-4 text-sm ${
                  participation.hasVoted
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}>
                  {participation.hasVoted ? (
                    <>
                      You voted in this election{participation.youVoted?.name ? ` and chose ${participation.youVoted.name}.` : "."}
                    </>
                  ) : (
                    <>You didn’t cast a ballot in this election, but the published results are shown for your awareness.</>
                  )}
                </div>
              )}

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Candidate</th>
                      <th className="px-4 py-3 text-left">State</th>
                      <th className="px-4 py-3 text-left">LGA</th>
                      <th className="px-4 py-3 text-right">Votes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {displayRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">Results will appear once votes are tallied for this session.</td>
                      </tr>
                    ) : (
                      displayRows.map((candidate, index) => {
                        const rankBadge = index === 0 ? "Winner" : index === 1 ? "Runner-up" : `Rank #${index + 1}`;
                        return (
                          <tr key={candidate.id} className={index === 0 ? "bg-amber-50/60" : index === 1 ? "bg-slate-50" : "bg-white"}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <img
                                  src={mediaUrl(candidate.photoUrl || "/placeholder.png")}
                                  alt={candidate.name}
                                  className="h-10 w-10 rounded-full object-cover ring-1 ring-slate-200/70"
                                />
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">{candidate.name}</div>
                                  <div className="text-xs text-slate-500">{rankBadge}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600">{candidate.state || "—"}</td>
                            <td className="px-4 py-3 text-xs text-slate-600">{candidate.lga || "—"}</td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">{candidate.votes.toLocaleString()}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
