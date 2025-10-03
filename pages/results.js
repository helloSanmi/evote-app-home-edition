import { useEffect, useRef, useState } from "react";
import { jget } from "../lib/apiBase";
import { mediaUrl } from "../lib/mediaUrl";
import { notifyError } from "../components/Toast";

export default function Results() {
  const [sessions, setSessions] = useState(null);
  const [sel, setSel] = useState("");
  const selRef = useRef("");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await jget("/api/public/published-sessions");
        if (!mounted) return;
        setSessions(list);
        if (Array.isArray(list) && list.length && !selRef.current) {
          selRef.current = String(list[0].id);
          setSel(String(list[0].id));
        }
      } catch (e) {
        notifyError(e.message || "Failed to load sessions");
        setSessions([]);
      }
    })();
    return () => (mounted = false);
  }, []);

  useEffect(() => {
    if (!sel) return setRows([]);
    selRef.current = sel;
    (async () => {
      try {
        const r = await jget(`/api/public/results?periodId=${sel}`);
        setRows(r);
      } catch (e) {
        notifyError(e.message || "Failed to load results");
        setRows([]);
      }
    })();
  }, [sel]);

  if (sessions === null) {
    return (
      <div className="mx-auto flex min-h-[40vh] w-full max-w-4xl items-center justify-center px-4">
        <div className="rounded-3xl border border-slate-200 bg-white px-10 py-12 text-center shadow-[0_35px_110px_-65px_rgba(15,23,42,0.55)] backdrop-blur">
          <div className="animate-pulse text-sm text-slate-500">Loading published sessions…</div>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="mx-auto flex min-h-[40vh] w-full max-w-4xl items-center justify-center px-4">
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-10 py-12 text-center text-slate-600 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">No results published yet</h2>
          <p className="mt-2 text-sm text-slate-500">Once administrators publish a session, you will immediately see the breakdown here.</p>
        </div>
      </div>
    );
  }

  const selectedSession = sessions.find((s) => String(s.id) === sel) || sessions[0];
  const [eligibleRow] = sessions;
  const selectedRows = sel ? rows : [];


  if (selectedSession) {
    const scope = (selectedSession.scope || 'national').toLowerCase();
    const userState = (typeof window !== 'undefined' ? localStorage.getItem('state') : '') || '';
    const userLga = (typeof window !== 'undefined' ? localStorage.getItem('residenceLGA') : '') || '';
    if (scope === 'state') {
      if (!selectedSession.scopeState || !userState || selectedSession.scopeState.toLowerCase() !== userState.toLowerCase()) {
        return (
          <div className="mx-auto flex min-h-[40vh] w-full max-w-4xl items-center justify-center px-4">
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-10 py-12 text-center text-slate-600 shadow-sm">
              <h2 className="text-2xl font-semibold text-slate-900">Restricted results</h2>
              <p className="mt-2 text-sm text-slate-500">This state-wide election is not available for your location.</p>
            </div>
          </div>
        );
      }
    }
    if (scope === 'local') {
      const matchState = selectedSession.scopeState && userState && selectedSession.scopeState.toLowerCase() === userState.toLowerCase();
      const matchLga = selectedSession.scopeLGA && userLga && selectedSession.scopeLGA.toLowerCase() === userLga.toLowerCase();
      if (!matchState || !matchLga) {
        return (
          <div className="mx-auto flex min-h-[40vh] w-full max-w-4xl items-center justify-center px-4">
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-10 py-12 text-center text-slate-600 shadow-sm">
              <h2 className="text-2xl font-semibold text-slate-900">Restricted results</h2>
              <p className="mt-2 text-sm text-slate-500">This local election is not available for your location.</p>
            </div>
          </div>
        );
      }
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6">
      <section className="rounded-[2.25rem] border border-slate-200 bg-white px-6 py-10 shadow-[0_35px_110px_-65px_rgba(15,23,42,0.55)] backdrop-blur md:px-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Latest results</p>
            <h1 className="text-3xl font-semibold text-slate-900">
              {selectedSession.title || `Session #${selectedSession.id}`}
            </h1>
            <p className="text-sm text-slate-500">
              {new Date(selectedSession.startTime).toLocaleString()} — {new Date(selectedSession.endTime).toLocaleString()}
            </p>
          </div>
          <div className="w-full max-w-xs">
            <label className="form-label" htmlFor="session-picker">View another session</label>
            <select
              id="session-picker"
              className="form-control"
              value={sel || String(selectedSession.id)}
              onChange={(e) => setSel(e.target.value)}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {(s.title || `Session #${s.id}`)} — {new Date(s.startTime).toLocaleString()}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur">
        <h2 className="text-lg font-semibold text-slate-900">Candidate breakdown</h2>
        {selectedRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center text-sm text-slate-500">
            Results will appear once votes are tallied for this session.
          </div>
        ) : (
          <div className="grid gap-3">
            {selectedRows.map((candidate, index) => {
              const rank = index + 1;
              const badge = rank === 1 ? "Winner" : rank === 2 ? "Runner-up" : `Rank #${rank}`;
              const highlight =
                rank === 1
                  ? "border-amber-200 bg-amber-50"
                  : rank === 2
                    ? "border-slate-200 bg-slate-100"
                    : "border-slate-100 bg-white";
              const badgeColor =
                rank === 1 ? "text-amber-600" : rank === 2 ? "text-slate-600" : "text-slate-500";
              return (
                <div
                  key={candidate.id}
                  className={`flex items-center justify-between gap-4 rounded-2xl border p-4 shadow-sm transition ${highlight}`}
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={mediaUrl(candidate.photoUrl)}
                      className="h-12 w-12 rounded-full object-cover ring-1 ring-slate-200/70"
                      alt={candidate.name}
                    />
                    <div>
                      <div className="text-base font-semibold text-slate-900">{candidate.name}</div>
                      <div className="text-xs text-slate-500">{candidate.state} • {candidate.lga}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-slate-900">{candidate.votes.toLocaleString()} votes</div>
                    <div className={`text-xs font-semibold ${badgeColor}`}>{badge}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
