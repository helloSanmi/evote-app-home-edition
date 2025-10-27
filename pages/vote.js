import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { jget, jpost } from "../lib/apiBase";
import { mediaUrl } from "../lib/mediaUrl";
import { notifyError, notifySuccess } from "../components/Toast";
import { getSocket } from "../lib/socket";
import ConfirmDialog from "../components/ConfirmDialog";
import { resolveSessionTiming, formatCountdown } from "../lib/time";

export default function Vote() {
  const router = useRouter();
  const [accessChecked, setAccessChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [sessions, setSessions] = useState(null);
  const [candidatesByPeriod, setCandidatesByPeriod] = useState({});
  const [statusByPeriod, setStatusByPeriod] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(null); // { period, candidate }
  const socketRef = useRef(null);
  const pollRef = useRef(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [secureOverlay, setSecureOverlay] = useState(false);
  const overlayTimerRef = useRef(null);

  const loadSessions = async ({ suppressErrors } = {}) => {
    try {
      const periods = await jget("/api/public/eligible-sessions");
      setSessions(Array.isArray(periods) ? periods : []);
      const updates = await Promise.all(
        (periods || []).map(async (period) => {
          const [candList, status] = await Promise.all([
            jget(`/api/public/candidates?periodId=${period.id}`),
            jget(`/api/vote/status?periodId=${period.id}`).catch(() => null),
          ]);
          return {
            periodId: period.id,
            candidates: Array.isArray(candList) ? candList : [],
            status: status || { hasVoted: false, youVoted: null },
          };
        })
      );

      setCandidatesByPeriod(updates.reduce((acc, cur) => ({ ...acc, [cur.periodId]: cur.candidates }), {}));
      setStatusByPeriod(updates.reduce((acc, cur) => ({ ...acc, [cur.periodId]: cur.status }), {}));
      setSelectedSessionId((prev) => {
        if (prev && updates.some((cur) => cur.periodId === prev)) return prev;
        return updates.length ? updates[0].periodId : null;
      });
    } catch (e) {
      if (!suppressErrors) {
        notifyError(e.message || "Failed to load active sessions");
      }
      setSessions([]);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateAccess = () => {
      const role = (localStorage.getItem("role") || "user").toLowerCase();
      const privileged = role === "admin" || role === "super-admin";
      setAllowed(!privileged);
      setAccessChecked(true);
      if (privileged) {
        router.replace("/admin");
      }
    };
    updateAccess();
    window.addEventListener("storage", updateAccess);
    return () => window.removeEventListener("storage", updateAccess);
  }, [router]);

  useEffect(() => {
    if (!allowed) return;
    let mounted = true;
    (async () => {
      await loadSessions();
      if (!mounted) return;
    })();

    const socket = getSocket();
    socketRef.current = socket;
    const handleRefresh = () => loadSessions({ suppressErrors: true });

    socket?.on("periodCreated", handleRefresh);
    socket?.on("resultsPublished", handleRefresh);
    socket?.on("periodUpdated", handleRefresh);
    socket?.on("periodCancelled", handleRefresh);
    socket?.on("periodEnded", handleRefresh);

    return () => {
      mounted = false;
      socket?.off("periodCreated", handleRefresh);
      socket?.off("resultsPublished", handleRefresh);
      socket?.off("periodUpdated", handleRefresh);
      socket?.off("periodCancelled", handleRefresh);
      socket?.off("periodEnded", handleRefresh);
    };
  }, [allowed]);

  useEffect(() => {
    if (allowed) return;
    setSessions(null);
    setCandidatesByPeriod({});
    setStatusByPeriod({});
  }, [allowed]);

  useEffect(() => {
    if (!allowed) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(() => {
      loadSessions({ suppressErrors: true });
    }, 8000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const refreshPeriod = async (periodId) => {
    try {
      const [candList, status] = await Promise.all([
        jget(`/api/public/candidates?periodId=${periodId}`),
        jget(`/api/vote/status?periodId=${periodId}`).catch(() => null),
      ]);
      setCandidatesByPeriod((prev) => ({
        ...prev,
        [periodId]: Array.isArray(candList) ? candList : [],
      }));
      setStatusByPeriod((prev) => ({
        ...prev,
        [periodId]: status || prev[periodId] || { hasVoted: true, youVoted: null },
      }));
    } catch (e) {
      notifyError(e.message || "Failed to refresh session");
    }
  };

  const handleVote = async ({ period, candidate }) => {
    setBusy(true);
    try {
      await jpost("/api/vote", { candidateId: candidate.id });
      notifySuccess("Vote recorded");
      await refreshPeriod(period.id);
      setSecureOverlay(true);
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = setTimeout(() => setSecureOverlay(false), 6000);
    } catch (e) {
      notifyError(e.message || "Unable to cast vote");
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  useEffect(() => {
    return () => {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    };
  }, []);

  const selectedSession = Array.isArray(sessions) ? sessions.find((session) => session.id === selectedSessionId) : null;
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const selectedCandidates = selectedSession ? candidatesByPeriod[selectedSession.id] || [] : [];
  const selectedStatus = selectedSession ? statusByPeriod[selectedSession.id] || {} : {};
  const youVotedId = selectedStatus?.youVoted?.id;
  const hasVoted = !!selectedStatus?.hasVoted;
  const isSessionActive = (session, referenceTime = clock) => {
    if (!session || session.forcedEnded || session.resultsPublished) return false;
    const start = new Date(session.startTime).getTime();
    const end = new Date(session.endTime).getTime();
    return referenceTime >= start && referenceTime <= end;
  };
  const selectedTiming = resolveSessionTiming(selectedSession, clock);
  const sortedSessions = useMemo(() => {
    if (!Array.isArray(sessions)) return [];
    return [...sessions].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  }, [sessions]);

  if (!accessChecked || (accessChecked && !allowed)) {
    return null;
  }

  if (sessions === null) {
    return (
      <div className="mx-auto flex min-h-[40vh] w-full max-w-5xl items-center justify-center px-4">
        <div className="rounded-3xl border border-slate-200 bg-white px-10 py-12 text-center shadow-[0_35px_120px_-60px_rgba(15,23,42,0.55)] backdrop-blur">
          <div className="animate-pulse text-sm text-slate-500">Loading available sessions…</div>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="mx-auto flex min-h-[40vh] w-full max-w-5xl items-center justify-center px-4">
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-10 py-12 text-center text-slate-600 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">No eligible sessions yet</h2>
          <p className="mt-2 text-sm text-slate-500">
            Stay tuned. Once a voting period opens for your region, it will appear here automatically.
          </p>
        </div>
      </div>
    );
  }

  const currentConfirmation = confirming && {
    period: confirming.period,
    candidate: confirming.candidate,
  };

  return (
    <>
      {secureOverlay && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm px-6 text-center">
          <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900/90 px-6 py-7 text-white shadow-2xl">
            <h3 className="text-lg font-semibold tracking-tight">Ballot secured</h3>
            <p className="mt-3 text-sm text-slate-200">
              Your vote has been locked in. We’ve hidden the ballot details so no one can capture or replay your selection.
              You can safely leave this page or review other sessions.
            </p>
          </div>
        </div>
      )}
      <div className={`mx-auto w-full max-w-5xl space-y-4 px-4 py-6 ${hasVoted ? "select-none" : ""}`}>
        {sortedSessions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500 shadow-sm">
            No eligible sessions yet. As soon as one opens, it will appear here.
          </div>
        ) : (
          <div className="space-y-4 md:grid md:grid-cols-[minmax(0,260px)_1fr] md:gap-4 md:space-y-0">
            <aside className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <h2 className="px-2 text-sm font-semibold text-slate-700">Upcoming ballots</h2>
              <div className="space-y-1">
                  {sortedSessions.map((session) => {
                  const active = selectedSessionId === session.id;
                  const timing = resolveSessionTiming(session, clock);
                  const statusLabel = timing.phase === "live"
                    ? "Live"
                    : timing.phase === "upcoming"
                      ? "Starting soon"
                      : timing.forcedEnded
                        ? "Ended early"
                        : "Closed";
                  const statusTone = timing.phase === "live"
                    ? "bg-emerald-100 text-emerald-700"
                    : timing.phase === "upcoming"
                      ? "bg-indigo-100 text-indigo-700"
                      : timing.forcedEnded
                        ? "bg-rose-100 text-rose-600"
                        : "bg-slate-200 text-slate-600";
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
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone}`}>{statusLabel}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{new Date(session.startTime).toLocaleString()}</p>
                      {!timing.forcedEnded && timing.phase !== "closed" && timing.countdownMs > 0 && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          {timing.phase === "live" ? "Ends in" : "Starts in"}{" "}
                          <span className="font-semibold text-slate-700">{formatCountdown(timing.countdownMs)}</span>
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </aside>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              {!selectedSession ? (
                <div className="text-sm text-slate-500">Select a session from the list to view candidates.</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">{selectedSession.title || `Session #${selectedSession.id}`}</h2>
                      <p className="text-xs text-slate-500">{new Date(selectedSession.startTime).toLocaleString()} to {new Date(selectedSession.endTime).toLocaleString()}</p>
                      {selectedTiming.forcedEnded ? (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-600">
                          Ended early by administrators
                        </span>
                      ) : selectedTiming.phase !== "closed" && selectedTiming.countdownMs > 0 && (
                        <span
                          className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                            selectedTiming.phase === "live" ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"
                          }`}
                        >
                          {selectedTiming.phase === "live" ? "Ends in" : "Starts in"}
                          <span className="text-slate-900">{formatCountdown(selectedTiming.countdownMs)}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold uppercase">Scope: {selectedSession.scope}</span>
                      {selectedSession.scopeState && <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold uppercase">{selectedSession.scopeState}</span>}
                      {selectedSession.scope === "local" && selectedSession.scopeLGA && (
                        <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold uppercase">{selectedSession.scopeLGA}</span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                    {hasVoted ? (
                      <p className="font-semibold text-emerald-700">
                        Your vote has been recorded and ballot details are now hidden to protect you from coercion or vote buying.
                      </p>
                    ) : selectedTiming.forcedEnded ? (
                      <p className="font-semibold text-rose-600">
                        Voting for this session was ended early by administrators. No further ballots can be cast.
                      </p>
                    ) : (
                      <p>Select your preferred candidate. You can only vote once.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    {hasVoted ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                        Ballot sealed. For your security the candidate list is no longer visible. You may close this page or return to the dashboard.
                      </div>
                    ) : selectedCandidates.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">No candidates published yet.</div>
                    ) : (
                      selectedCandidates.map((candidate) => {
                        const isChoice = youVotedId === candidate.id;
                        const sessionActive = isSessionActive(selectedSession, clock);
                        const sessionNotStarted = selectedSession && clock < new Date(selectedSession.startTime).getTime();
                        const endedEarly = selectedSession?.forcedEnded;
                        const disabledChoice = busy || hasVoted || !sessionActive;
                        return (
                          <button
                            key={candidate.id}
                            type="button"
                            onClick={() => setConfirming({ period: selectedSession, candidate })}
                            disabled={disabledChoice}
                            className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 ${
                              isChoice ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white hover:-translate-y-0.5 hover:shadow-md"
                            } ${disabledChoice && !isChoice ? "opacity-70" : ""}`}
                          >
                            <div className="flex items-center gap-3">
                              <img
                                src={mediaUrl(candidate.photoUrl || "/placeholder.png")}
                                alt={candidate.name}
                                className="h-10 w-10 rounded-full object-cover ring-1 ring-slate-200/70"
                              />
                              <div>
                                <div className="text-sm font-semibold text-slate-900">{candidate.name}</div>
                                <div className="text-xs text-slate-500">{candidate.state}{candidate.lga ? ` • ${candidate.lga}` : ""}</div>
                              </div>
                            </div>
                            <div className="text-xs font-semibold text-slate-500">
                              {isChoice
                                ? "Your selection"
                                : sessionActive
                                  ? "Tap to vote"
                                  : hasVoted
                                    ? "Vote recorded"
                                    : endedEarly
                                      ? "Ended early"
                                      : sessionNotStarted
                                        ? "Starting soon"
                                        : "Voting closed"}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!currentConfirmation}
        title="Confirm your vote"
        message={currentConfirmation ? `Are you sure you want to vote for ${currentConfirmation.candidate.name}? This action cannot be changed.` : ""}
        confirmLabel="Cast vote"
        cancelLabel="Review candidates"
        onConfirm={() => currentConfirmation && handleVote(currentConfirmation)}
        onCancel={() => !busy && setConfirming(null)}
      />
    </>
  );
}
