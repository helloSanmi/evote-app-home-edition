// frontend/pages/results.js
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import io from "socket.io-client";
import { notifyError } from "../components/Toast";
import { useModal } from "../components/Modal";

const API = process.env.NEXT_PUBLIC_API_URL;

export default function Results() {
  const router = useRouter();
  const { open } = useModal();
  const token = useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("token") : null), []);
  const [periods, setPeriods] = useState([]);          // sessions user participated in
  const [sel, setSel] = useState(null);               // selected period id
  const [period, setPeriod] = useState(null);         // selected period detail
  const [list, setList] = useState([]);               // candidates
  const [youVoted, setYouVoted] = useState(null);     // {id,name}
  const [winnerIds, setWinnerIds] = useState([]);
  const [img, setImg] = useState(null);
  const [loading, setLoading] = useState(true);
  const pollTimer = useRef(null);
  const sock = useRef(null);

  useEffect(() => {
    if (!token) { router.replace("/login"); return; }
    loadPeriods().then(() => setLoading(false));
    pollTimer.current = setInterval(() => { if (sel) loadResults(sel); }, 8000);
    sock.current = io(API, { transports: ["websocket", "polling"] });
    sock.current.on("resultsPublished", ({ periodId }) => {
      if (periods.find((p) => p.id === periodId)) {
        open({
          title: "Results Published",
          message: `Results for “${period?.title || `Session #${periodId}`}` + "” are now available.",
          confirmText: "Refresh",
          onConfirm: () => sel === periodId ? loadResults(periodId) : setSel(periodId),
          onCancel: () => {},
          cancelText: "Close",
        });
      }
    });
    return () => { clearInterval(pollTimer.current); sock.current?.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // When arriving from /vote with a specific session
  useEffect(() => {
    const q = Number(router.query.periodId);
    if (q) {
      setSel(q);
      // try to load immediately (even if user didn’t participate it will show the explanatory text from backend)
      loadResults(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.periodId]);

  const loadPeriods = async () => {
    try {
      const r = await fetch(`${API}/api/user/participated-periods`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      const arr = Array.isArray(data) ? data : [];
      setPeriods(arr);
      // if nothing selected yet, pick first or query one
      const q = Number(router.query.periodId);
      if (q) {
        setSel(q);
        // do not auto-load here; handled by the effect above
      } else if (arr.length && sel == null) {
        setSel(arr[0].id);
        loadResults(arr[0].id);
      }
    } catch (e) {
      notifyError((e && e.message) || "Failed to load sessions");
      setPeriods([]);
    }
  };

  const computeWinners = (arr) => {
    if (!arr?.length) return [];
    const top = Math.max(...arr.map((c) => Number(c.votes || 0)));
    return arr.filter((c) => Number(c.votes || 0) === top).map((c) => c.id);
  };

  const loadResults = async (periodId) => {
    try {
      const r = await fetch(`${API}/api/user/results?periodId=${periodId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to load results");
      setPeriod(data.period || null);
      setList(Array.isArray(data.candidates) ? data.candidates : []);
      setYouVoted(data.youVoted || null);
      setWinnerIds(computeWinners(data.candidates || []));
    } catch (e) {
      // Show an explanatory empty state if user didn’t participate or not allowed
      setPeriod({ id: periodId, title: `Session #${periodId}` });
      setList([]);
      setYouVoted(null);
      setWinnerIds([]);
    }
  };

  const selectPeriod = (p) => {
    setSel(p.id);
    loadResults(p.id);
  };

  if (loading) return <div className="max-w-6xl mx-auto px-4 bg-white rounded-xl shadow p-6 mt-6 animate-pulse">Loading…</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
      {/* Session picker (clean list) */}
      <aside className="md:col-span-1">
        <div className="bg-white rounded-xl shadow p-3">
          <div className="text-sm font-semibold mb-2">Your Sessions</div>
          {periods.length === 0 ? (
            <div className="text-sm text-gray-500">You haven’t participated in any session yet.</div>
          ) : (
            <div className="space-y-2">
              {periods.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectPeriod(p)}
                  className={`w-full text-left border rounded p-3 hover:bg-gray-50 transition ${
                    sel === p.id ? "bg-blue-50 border-blue-400" : ""
                  }`}
                >
                  <div className="font-medium truncate">{p.title || `Session #${p.id}`}</div>
                  <div className="text-xs text-gray-600 truncate">
                    {new Date(p.startTime).toLocaleDateString()} – {new Date(p.endTime).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Results content */}
      <main className="md:col-span-3">
        <div className="bg-white rounded-xl shadow p-6">
          {!period ? (
            <div className="text-gray-600">Select a session on the left to view results.</div>
          ) : (
            <>
              {/* Header */}
              <div className="mb-4">
                <h2 className="text-xl font-bold">{period.title || "Election Results"}</h2>
                {period.description && <p className="text-gray-600">{period.description}</p>}
                {period.startTime && period.endTime && (
                  <p className="text-gray-600 text-sm">
                    {new Date(period.startTime).toLocaleString()} — {new Date(period.endTime).toLocaleString()}
                  </p>
                )}
              </div>

              {/* Your vote */}
              {youVoted && (
                <div className="p-3 rounded bg-green-50 border mb-4">
                  You voted for <span className="font-semibold">{youVoted.name}</span>.
                </div>
              )}

              {/* Results or explanation */}
              {list.length === 0 ? (
                <div className="text-gray-500">
                  You aren’t seeing results for this session because you didn’t participate in this election. Participate to view results when published.
                </div>
              ) : (
                <>
                  {/* Winner */}
                  <div className="mb-4 p-4 border rounded-lg bg-indigo-50">
                    <div className="font-bold mb-2">Winner{winnerIds.length > 1 ? "s" : ""}</div>
                    <div className="flex flex-wrap gap-3">
                      {list
                        .filter((c) => winnerIds.includes(c.id))
                        .map((c) => (
                          <div key={c.id} className="flex items-center gap-3">
                            <img src={c.photoUrl || "/placeholder.png"} className="w-10 h-10 rounded object-cover" alt={c.name} />
                            <div className="font-semibold">{c.name}</div>
                            <div className="text-sm text-gray-700 font-medium">({c.votes} votes)</div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Candidates */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {list.map((c) => (
                      <div
                        key={c.id}
                        className={`border rounded p-3 text-center transition transform hover:-translate-y-0.5 hover:shadow ${
                          winnerIds.includes(c.id) ? "ring-2 ring-indigo-600" : ""
                        }`}
                      >
                        <img
                          src={c.photoUrl || "/placeholder.png"}
                          className="w-24 h-24 rounded-full mx-auto object-cover cursor-pointer mb-2 transition transform hover:scale-105"
                          alt={c.name}
                          onClick={() => c.photoUrl && setImg(c.photoUrl)}
                        />
                        <div className="font-semibold">{c.name}</div>
                        <div className="text-sm text-gray-600">{c.state || "-"}</div>
                        <div className="mt-1 font-bold">{c.votes} votes</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>

      {img && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center transition" onClick={() => setImg(null)}>
          <img src={img} alt="candidate" className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-xl" />
        </div>
      )}
    </div>
  );
}
