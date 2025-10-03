import { useEffect, useMemo, useRef, useState } from "react";
import { jget, jpost } from "../lib/apiBase";
import { mediaUrl } from "../lib/mediaUrl";
import { notifyError, notifySuccess } from "../components/Toast";
import { getSocket } from "../lib/socket";
import ConfirmDialog from "../components/ConfirmDialog";

function useCountdown(dt) {
  const target = useMemo(() => (dt ? new Date(dt).getTime() : 0), [dt]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, target - now);
  const s = Math.floor(left / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return left > 0 ? `${h}h ${m}m ${sec}s` : "00h 00m 00s";
}

export default function Vote() {
  const [sessions, setSessions] = useState(null);
  const [candidatesByPeriod, setCandidatesByPeriod] = useState({});
  const [statusByPeriod, setStatusByPeriod] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(null); // { period, candidate }
  const socketRef = useRef(null);

  const loadSessions = async () => {
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
    } catch (e) {
      notifyError(e.message || "Failed to load active sessions");
      setSessions([]);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      await loadSessions();
      if (!mounted) return;
    })();

    const socket = getSocket();
    socketRef.current = socket;
    const handleRefresh = () => loadSessions();

    socket?.on("periodCreated", handleRefresh);
    socket?.on("resultsPublished", handleRefresh);
    socket?.on("periodUpdated", handleRefresh);

    return () => {
      mounted = false;
      socket?.off("periodCreated", handleRefresh);
      socket?.off("resultsPublished", handleRefresh);
      socket?.off("periodUpdated", handleRefresh);
    };
  }, []);

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
    } catch (e) {
      notifyError(e.message || "Unable to cast vote");
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

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
            Stay tuned—once a voting period opens for your region, it will appear here automatically.
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
      <div className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-6">
        {sessions.map((period) => (
          <SessionCard
            key={period.id}
            period={period}
            candidates={candidatesByPeriod[period.id] || []}
            status={statusByPeriod[period.id]}
            busy={busy}
            onRequestVote={(candidate) => setConfirming({ period, candidate })}
          />
        ))}
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

function SessionCard({ period, candidates, status, busy, onRequestVote }) {
  const startCountdown = useCountdown(period.startTime);
  const endCountdown = useCountdown(period.endTime);
  const now = Date.now();
  const started = now >= new Date(period.startTime).getTime();
  const ended = now > new Date(period.endTime).getTime();
  const youVotedId = status?.youVoted?.id;
  const hasVoted = !!status?.hasVoted;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white p-5 shadow-[0_25px_70px_-40px_rgba(15,23,42,0.6)] backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-lg font-bold text-slate-900">{period.title || `Session #${period.id}`}</div>
          <div className="text-sm text-slate-500">
            {new Date(period.startTime).toLocaleString()} — {new Date(period.endTime).toLocaleString()}
          </div>
          <div className="text-xs text-slate-500">
            Scope: <span className="font-medium uppercase text-slate-800">{period.scope}</span>
            {period.scope !== "national" && period.scopeState ? ` • ${period.scopeState}` : ""}
            {period.scope === "local" && period.scopeLGA ? ` • ${period.scopeLGA}` : ""}
          </div>
          {hasVoted && status?.youVoted && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600">
              <span>✅ You voted for <span className="font-semibold">{status.youVoted.name}</span></span>
            </div>
          )}
        </div>
        <div className="self-start rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">
          {started ? (ended ? "Ended" : `Ends in ${endCountdown}`) : `Starts in ${startCountdown}`}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {candidates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-sm text-slate-500">
            Candidates will appear here once added.
          </div>
        ) : (
          candidates.map((candidate) => {
            const isChoice = youVotedId === candidate.id;
            const disabled = busy || !started || ended || hasVoted;

            return (
              <button
                key={candidate.id}
                type="button"
                onClick={() => onRequestVote(candidate)}
                disabled={disabled}
                className={`flex h-full flex-col gap-4 rounded-2xl border p-4 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 ${
                  isChoice
                    ? "border-indigo-400 bg-indigo-50"
                    : "border-slate-100 bg-white hover:-translate-y-0.5 hover:shadow-md"
                } ${disabled && !isChoice ? "opacity-60" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={mediaUrl(candidate.photoUrl)}
                    alt={candidate.name}
                    className="h-12 w-12 rounded-full object-cover ring-1 ring-slate-200/70"
                  />
                  <div>
                    <div className="text-base font-semibold text-slate-900">{candidate.name}</div>
                    <div className="text-xs text-slate-500">{candidate.state} • {candidate.lga}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{candidate.votes} votes</span>
                  <span>{isChoice ? "Your selection" : !started ? "Voting locked" : ended ? "Session ended" : "Tap to vote"}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
