// frontend/pages/vote.js
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { notifyError, notifySuccess } from "../components/Toast";
import { api, safeJson } from "../lib/apiBase";

export default function Vote() {
  const router = useRouter();
  const token = useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("token") : null), []);
  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [sessions, setSessions] = useState([]);
  const [statusBy, setStatusBy] = useState({});
  const [candsBy, setCandsBy] = useState({});
  const [selectedBy, setSelectedBy] = useState({});
  const [loading, setLoading] = useState(true);

  const tick = useRef(null);
  const refresher = useRef(null);

  useEffect(() => {
    if (!token) { router.replace("/login"); return; }
    (async () => { await loadAll(); setLoading(false); })();

    refresher.current = setInterval(loadAll, 10000);
    tick.current = setInterval(checkEdges, 1000);

    return () => { clearInterval(tick.current); clearInterval(refresher.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function checkEdges() {
    const now = Date.now();
    sessions.forEach(s => {
      const start = new Date(s.startTime).getTime();
      if (now >= start && (statusBy[s.id]?.status === "upcoming")) {
        refreshSession(s.id);
      }
    });
  }

  async function loadAll() {
    try {
      const pr = await fetch(api("/api/public/periods"), { headers: auth });
      const listRaw = await safeJson(pr);
      const list = Array.isArray(listRaw) ? listRaw : (Array.isArray(listRaw?.sessions) ? listRaw.sessions : []);
      setSessions(list);

      await Promise.all(list.map(async (p) => {
        await refreshSession(p.id);
      }));
    } catch (e) {
      console.error("loadAll:", e);
      notifyError("Failed to load sessions");
      setSessions([]);
    }
  }

  async function refreshSession(pid) {
    try {
      const s = await fetch(api(`/api/vote/status?periodId=${pid}`), { headers: auth }).then(safeJson);
      setStatusBy(prev => ({ ...prev, [pid]: s || {} }));
      if ((s?.status === "active") && !s?.hasVoted) {
        const cr = await fetch(api(`/api/public/candidates?periodId=${pid}`)).then(safeJson);
        setCandsBy(prev => ({ ...prev, [pid]: Array.isArray(cr) ? cr : [] }));
      } else {
        setCandsBy(prev => ({ ...prev, [pid]: [] }));
      }
    } catch {
      // keep previous state
    }
  }

  async function cast(pid) {
    const candidateId = selectedBy[pid];
    if (!candidateId) return notifyError("Select a candidate");
    try {
      const res = await fetch(api("/api/vote"), {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, periodId: pid }),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.success) return notifyError(data?.error || "Error casting vote");
      notifySuccess(`You voted for ${data.candidateName}`);
      await refreshSession(pid);
    } catch {
      notifyError("Error casting vote");
    }
  }

  function timeUntil(s) {
    const diff = new Date(s.startTime).getTime() - Date.now();
    if (diff <= 0) return "";
    const sec = Math.floor(diff / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s2 = sec % 60;
    return `${h}h ${m}m ${s2}s`;
  }

  if (loading) return <div className="max-w-5xl mx-auto bg-white rounded-xl shadow p-6 mt-6 animate-pulse">Loading…</div>;

  return (
    <div className="max-w-5xl mx-auto px-4">
      {sessions.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-6 mt-6">
          <div className="font-semibold mb-1">No voting session available right now.</div>
          <div className="text-sm text-gray-600">Check back later or watch your notifications.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {sessions.map(s => {
            const st = statusBy[s.id] || {};
            const cands = candsBy[s.id] || [];
            const sel = selectedBy[s.id] || null;

            return (
              <div key={s.id} className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-100 p-5">
                <div className="font-semibold">{s.title || `Session #${s.id}`}</div>
                {s.description && <div className="text-sm text-gray-600">{s.description}</div>}
                <div className="text-xs text-gray-600 mb-2">
                  {new Date(s.startTime).toLocaleString()} — {new Date(s.endTime).toLocaleString()}
                </div>

                {st.status === "upcoming" && (
                  <div className="p-3 rounded bg-blue-50 border mb-3">
                    <div className="text-sm font-medium">Starts in:</div>
                    <div className="text-xl font-extrabold">{timeUntil(s)}</div>
                  </div>
                )}

                {st.status === "ended" && (
                  <div className="p-3 rounded bg-amber-50 border mb-3 text-sm">
                    {s.resultsPublished ? (
                      <div className="flex items-center justify-between">
                        <span>Voting ended. Results are published.</span>
                        <button
                          onClick={() => router.push(`/results?periodId=${s.id}`)}
                          className="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                        >
                          View Results
                        </button>
                      </div>
                    ) : (
                      <span>Voting ended. Awaiting results.</span>
                    )}
                  </div>
                )}

                {st.youVoted && (
                  <div className="p-2 rounded bg-green-50 border text-sm mb-2">
                    You voted for <span className="font-semibold">{st.youVoted.name}</span>.
                  </div>
                )}

                {st.status === "active" && !st.hasVoted ? (
                  <>
                    <div className="text-sm font-medium mb-2">Choose your candidate</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {cands.map(c => {
                        const isSel = sel === c.id;
                        return (
                          <button
                            key={c.id}
                            onClick={() => setSelectedBy(prev => ({ ...prev, [s.id]: c.id }))}
                            className={`border rounded p-3 text-left transition ${isSel ? "ring-2 ring-blue-600 border-blue-600" : "hover:shadow"}`}
                          >
                            <div className="flex items-center gap-3">
                              <img
                                src={c.photoUrl ? api(c.photoUrl) : "/placeholder.png"}
                                className={`w-14 h-14 rounded object-cover ${isSel ? "scale-105" : ""}`}
                                alt={c.name}
                              />
                              <div>
                                <div className="font-semibold">{c.name}</div>
                                <div className="text-xs text-gray-600">{c.state || "-"} • {c.lga || "-"}</div>
                              </div>
                            </div>
                            {isSel && <div className="mt-1 text-blue-700 text-sm font-medium">Selected</div>}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => cast(s.id)}
                      disabled={!sel}
                      className="mt-3 bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50 hover:bg-green-700"
                    >
                      Submit Vote
                    </button>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
