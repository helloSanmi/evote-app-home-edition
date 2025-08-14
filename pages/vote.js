// frontend/pages/vote.js
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { notifyError, notifySuccess } from "../components/Toast";
import { api } from "../lip/apiBase";

export default function Vote() {
  const router = useRouter();
  const token = useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("token") : null), []);
  const [period, setPeriod] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [myVote, setMyVote] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nowTick, setNowTick] = useState(Date.now());

  const refreshTimer = useRef(null);
  const pollTimer = useRef(null);

  useEffect(() => {
    if (!token) { router.replace("/login"); return; }
    loadAll();
    const tick = setInterval(() => setNowTick(Date.now()), 1000);
    pollTimer.current = setInterval(loadAll, 10000);
    return () => { clearInterval(tick); clearInterval(pollTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadAll = async () => {
    try {
      setLoading(true);
      const pr = await fetch(api("/public/period"));
      const p = await pr.json();
      setPeriod(p);

      if (!p) { setCandidates([]); setMyVote(null); setLoading(false); return; }

      const sr = await fetch(api(`/vote/status?periodId=${p.id}`), { headers: { Authorization: `Bearer ${token}` } });
      const s = await sr.json();
      setMyVote(s?.youVoted || null);

      const active = p.status === "active";
      if (active && !s?.hasVoted) {
        const cr = await fetch(api(`/public/candidates?periodId=${p.id}`));
        setCandidates(await cr.json());
      } else {
        setCandidates([]);
      }

      setLoading(false);
    } catch {
      notifyError("Failed to load voting session");
      setLoading(false);
    }
  };

  const timeUntil = () => {
    if (!period) return "";
    const start = new Date(period.startTime).getTime();
    const diff = start - nowTick;
    if (diff <= 0) {
      if (!refreshTimer.current) {
        refreshTimer.current = setTimeout(() => { loadAll(); refreshTimer.current = null; }, 500);
      }
      return "";
    }
    const secs = Math.floor(diff / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h}h ${m}m ${s}s`;
  };

  const castVote = async () => {
    if (!selected) return notifyError("Select a candidate");
    try {
      const res = await fetch(api("/vote"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ candidateId: selected }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) return notifyError(data.error || "Error casting vote");
      setMyVote({ id: data.candidateId, name: data.candidateName });
      setCandidates([]); // lock
      notifySuccess(`You voted for ${data.candidateName}`);
    } catch {
      notifyError("Error casting vote");
    }
  };

  const noParticipationCard = () => (
    <div className="p-4 rounded border bg-amber-50">
      <div className="font-medium">
        You didn’t participate in <span className="font-semibold">{period?.title || "this election"}</span>.
      </div>
      <div className="text-sm text-amber-700">Results are visible only to participants after they’re published.</div>
    </div>
  );

  if (loading) return <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-6 mt-6 animate-pulse">Loading…</div>;

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-6 mt-6 transition hover:shadow-lg">
      {!period ? (
        <div>No voting session yet.</div>
      ) : (
        <>
          <h1 className="text-xl font-bold mb-2">{period.title || "Election"}</h1>
          {period.description && <p className="text-gray-600 mb-2">{period.description}</p>}
          <p className="text-sm text-gray-500 mb-4">
            {new Date(period.startTime).toLocaleString()} — {new Date(period.endTime).toLocaleString()}
          </p>

          {period.status === "upcoming" && (
            <div className="p-4 rounded bg-blue-50 border mb-4">
              <div className="font-semibold">Voting starts in:</div>
              <div className="text-2xl font-extrabold mt-1">{timeUntil()}</div>
            </div>
          )}

          {period.status === "ended" && (
            <div className="p-4 rounded bg-amber-50 border mb-4">
              {period.resultsPublished ? (
                <div className="flex items-center justify-between">
                  <span>Voting ended. Results are published.</span>
                  <button
                    onClick={() => router.push("/results")}
                    className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    View Results
                  </button>
                </div>
              ) : (
                <span>Voting ended. Awaiting results.</span>
              )}
            </div>
          )}

          {period.status !== "active" && !myVote && period?.resultsPublished && noParticipationCard()}

          {myVote && (
            <div className="p-3 rounded bg-green-50 border mb-4">
              You voted for <span className="font-semibold">{myVote.name}</span>.
            </div>
          )}

          {period.status === "active" && !myVote ? (
            <>
              <h2 className="text-lg font-semibold mb-3">Choose your candidate</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {candidates.map((c) => {
                  const isSel = selected === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelected(c.id)}
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
                      <div className="text-sm text-gray-600">{c.lga || "-"}</div>
                      {isSel && <div className="mt-1 text-blue-700 font-medium">Selected</div>}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={castVote}
                disabled={!selected}
                className="mt-4 bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50 transition hover:bg-green-700"
              >
                Submit Vote
              </button>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
