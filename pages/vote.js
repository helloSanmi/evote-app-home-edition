import { useEffect, useMemo, useState } from "react";
import { jget, jpost } from "../lib/apiBase";
import { mediaUrl } from "../lib/mediaUrl";
import { notifyError, notifySuccess } from "../components/Toast";

function useCountdown(dt) {
  const target = useMemo(() => (dt ? new Date(dt).getTime() : 0), [dt]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, target - now);
  const s = Math.floor(left/1000);
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return left > 0 ? `${h}h ${m}m ${sec}s` : "00h 00m 00s";
}

export default function Vote() {
  const [sessions, setSessions] = useState(null);
  const [byId, setById] = useState({}); // periodId -> candidates[]
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await jget("/api/public/eligible-sessions"); // backend/public.js :contentReference[oaicite:5]{index=5}
        if (!mounted) return;
        setSessions(list);
        // prefetch candidates per session
        const obj = {};
        for (const p of list) {
          obj[p.id] = await jget(`/api/public/candidates?periodId=${p.id}`);
        }
        setById(obj);
      } catch (e) {
        notifyError(e.message || "Failed to load active sessions");
        setSessions([]);
      }
    })();
    return () => (mounted = false);
  }, []);

  if (sessions === null) return <div className="max-w-5xl mx-auto px-4 py-8">Loading…</div>;
  if (sessions.length === 0) return <div className="max-w-5xl mx-auto px-4 py-8 text-gray-600">No eligible sessions right now.</div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 grid gap-4">
      {sessions.map(p => <SessionCard key={p.id} p={p} cands={byId[p.id] || []} onVote={async (cid) => {
        setBusy(true);
        try {
          await jpost("/api/vote", { candidateId: cid }); // backend/vote.js (POST /) :contentReference[oaicite:6]{index=6}
          notifySuccess("Vote recorded");
          const obj = { ...byId };
          obj[p.id] = await jget(`/api/public/candidates?periodId=${p.id}`);
          setById(obj);
        } catch (e) {
          notifyError(e.message);
        } finally {
          setBusy(false);
        }
      }} busy={busy} />)}
    </div>
  );
}

function SessionCard({ p, cands, onVote, busy }) {
  const startCountdown = useCountdown(p.startTime);
  const endCountdown = useCountdown(p.endTime);
  const now = Date.now();
  const started = now >= new Date(p.startTime).getTime();
  const ended = now > new Date(p.endTime).getTime();

  return (
    <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/85 p-5 shadow-[0_25px_70px_-40px_rgba(15,23,42,0.6)] backdrop-blur">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-lg font-bold">{p.title || `Session #${p.id}`}</div>
          <div className="text-sm text-gray-600">
            {new Date(p.startTime).toLocaleString()} — {new Date(p.endTime).toLocaleString()}
          </div>
          <div className="text-xs mt-1">
            Scope: <span className="font-medium uppercase">{p.scope}</span>
            {p.scope !== "national" && p.scopeState ? ` • ${p.scopeState}` : ""}
            {p.scope === "local" && p.scopeLGA ? ` • ${p.scopeLGA}` : ""}
          </div>
        </div>
        <div className="text-sm bg-indigo-50 text-indigo-700 rounded px-2 py-1">
          {started ? (ended ? "Ended" : `Ends in: ${endCountdown}`) : `Starts in: ${startCountdown}`}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cands.length === 0 ? (
          <div className="text-gray-500">No candidates.</div>
        ) : cands.map(c => (
          <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white/70 p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <img src={mediaUrl(c.photoUrl)} className="h-12 w-12 rounded-full object-cover ring-1 ring-slate-200/70" alt={c.name} />
              <div>
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-gray-600">{c.state} • {c.lga}</div>
              </div>
            </div>
            <button
              disabled={!started || ended || busy}
              onClick={() => onVote(c.id)}
              className={`btn-primary h-10 px-6 ${(!started || ended || busy) ? "opacity-60 pointer-events-none" : ""}`}
            >
              Vote
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
