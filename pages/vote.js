// frontend/pages/vote.js
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import io from "socket.io-client";
import { notifyError, notifySuccess } from "../components/Toast";
import { useModal } from "../components/Modal";

const API = process.env.NEXT_PUBLIC_API_URL;

export default function Vote() {
  const router = useRouter();
  const { open } = useModal();
  const token = useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("token") : null), []);
  const [sessions, setSessions] = useState([]);          // all periods
  const [myVote, setMyVote] = useState({});              // periodId -> {id,name}
  const [cands, setCands] = useState({});                // periodId -> candidates[]
  const [sel, setSel] = useState({});                    // periodId -> candidateId
  const [loading, setLoading] = useState(true);
  const tickRef = useRef(null);
  const sock = useRef(null);

  useEffect(() => {
    if (!token) { router.replace("/login"); return; }
    loadAll().finally(() => setLoading(false));
    tickRef.current = setInterval(() => setSessions((s) => [...s]), 1000); // re-render for countdowns
    // socket for result publish popup
    sock.current = io(API, { transports: ["websocket", "polling"] });
    sock.current.on("resultsPublished", ({ periodId }) => {
      const p = sessions.find((x) => x.id === periodId);
      open({
        title: "Results Published",
        message: `Results for “${p?.title || `Session #${periodId}`}` + "” are now available.",
        confirmText: "View Results",
        onConfirm: () => router.push(`/results?periodId=${periodId}`),
        onCancel: () => {}, // blocks until user clicks one
        cancelText: "Close",
      });
    });
    return () => {
      clearInterval(tickRef.current);
      sock.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, router]);

  const timeUntil = (p) => {
    const diff = new Date(p.startTime).getTime() - Date.now();
    if (diff <= 0) return "";
    const secs = Math.floor(diff / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h}h ${m}m ${s}s`;
  };

  const loadAll = async () => {
    try {
      const pr = await fetch(`${API}/api/public/periods`);
      const periods = await pr.json();
      const list = Array.isArray(periods) ? periods : [];
      setSessions(list);
      // For each, load status & candidates
      for (const p of list) {
        // vote status
        const sr = await fetch(`${API}/api/vote/status?periodId=${p.id}`, { headers: { Authorization: `Bearer ${token}` } });
        const s = await sr.json();
        if (sr.ok && s?.youVoted) setMyVote((st) => ({ ...st, [p.id]: s.youVoted }));
        // candidates only if active and not voted
        if (p.status === "active" && !(s?.hasVoted)) {
          const cr = await fetch(`${API}/api/public/candidates?periodId=${p.id}`);
          const cs = await cr.json();
          if (cr.ok) setCands((st) => ({ ...st, [p.id]: Array.isArray(cs) ? cs : [] }));
        }
      }
    } catch {
      notifyError("Failed to load sessions");
    }
  };

  const castVote = async (periodId) => {
    const candId = sel[periodId];
    if (!candId) return notifyError("Select a candidate");
    try {
      const res = await fetch(`${API}/api/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ candidateId: candId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) return notifyError(data.error || "Error casting vote");
      setMyVote((s) => ({ ...s, [periodId]: { id: data.candidateId, name: data.candidateName } }));
      setCands((s) => ({ ...s, [periodId]: [] })); // lock
      notifySuccess(`You voted for ${data.candidateName}`);
    } catch {
      notifyError("Error casting vote");
    }
  };

  const renderCard = (p) => {
    const voted = myVote[p.id];
    const list = cands[p.id] || [];
    const status = p.status;
    return (
      <div key={p.id} className="border rounded-2xl bg-white p-5 hover:shadow transition">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-bold">{p.title || `Session #${p.id}`}</div>
            {p.description && <div className="text-gray-600">{p.description}</div>}
            <div className="text-xs text-gray-500">
              {new Date(p.startTime).toLocaleString()} — {new Date(p.endTime).toLocaleString()}
            </div>
          </div>
          <span className={`text-xs px-2 py-1 rounded ${status === "active" ? "bg-green-100 text-green-800" : status === "ended" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
            {status === "active" ? "Active" : status === "ended" ? "Ended" : "Upcoming"}
          </span>
        </div>

        {/* Upcoming */}
        {status === "upcoming" && (
          <div className="mt-3 p-3 rounded bg-blue-50 border">
            <div className="font-semibold">Voting starts in:</div>
            <div className="text-2xl font-extrabold mt-1">{timeUntil(p)}</div>
          </div>
        )}

        {/* Ended */}
        {status === "ended" && (
          <div className="mt-3 p-3 rounded bg-amber-50 border flex items-center justify-between">
            {p.resultsPublished ? (
              <>
                <span>Voting ended. Results are published.</span>
                <button
                  onClick={() => router.push(`/results?periodId=${p.id}`)}
                  className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  View Results
                </button>
              </>
            ) : (
              <span>Voting ended. Awaiting results.</span>
            )}
          </div>
        )}

        {/* Your vote */}
        {voted && (
          <div className="mt-3 p-3 rounded bg-green-50 border">
            You voted for <span className="font-semibold">{voted.name}</span>.
          </div>
        )}

        {/* Active voting */}
        {status === "active" && !voted && (
          <>
            <h3 className="text-sm font-semibold mt-4 mb-2">Choose your candidate</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {list.map((c) => {
                const isSel = sel[p.id] === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSel((s) => ({ ...s, [p.id]: c.id }))}
                    className={`border rounded p-3 text-center transition transform hover:-translate-y-0.5 hover:shadow ${
                      isSel ? "ring-2 ring-blue-600 border-blue-600" : "border-gray-300"
                    }`}
                  >
                    <img
                      src={c.photoUrl || "/placeholder.png"}
                      className={`w-24 h-24 rounded-full mx-auto object-cover mb-2 transition transform ${isSel ? "scale-105" : "hover:scale-105"}`}
                      alt={c.name}
                    />
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-sm text-gray-600">{c.state || "-"}</div>
                    {isSel && <div className="mt-1 text-blue-700 font-medium">Selected</div>}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => castVote(p.id)}
              disabled={!sel[p.id]}
              className="mt-4 bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50 transition hover:bg-green-700"
            >
              Submit Vote
            </button>
          </>
        )}
      </div>
    );
  };

  if (loading) return <div className="max-w-6xl mx-auto bg-white rounded-xl shadow p-6 mt-6 animate-pulse">Loading…</div>;

  const activeOrUpcoming = sessions.filter((p) => p.status !== "ended");
  const endedList = sessions.filter((p) => p.status === "ended");

  return (
    <div className="max-w-6xl mx-auto px-4 mt-6 space-y-6">
      {activeOrUpcoming.length === 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          There is no active voting session.{" "}
          <button className="text-indigo-700 underline" onClick={() => router.push("/results")}>
            Go to Results
          </button>{" "}
          to view results of sessions you participated in when they’re published.
        </div>
      )}

      {activeOrUpcoming.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeOrUpcoming.map(renderCard)}
        </div>
      )}

      {endedList.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-bold mb-3">Recently Ended</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {endedList.slice(0, 4).map(renderCard)}
          </div>
        </div>
      )}
    </div>
  );
}
