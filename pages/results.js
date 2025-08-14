// frontend/pages/results.js
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { notifyError } from "../components/Toast";
import { api } from "../lip/apiBase";

export default function Results() {
  const router = useRouter();
  const token = useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("token") : null), []);
  const [period, setPeriod] = useState(null);
  const [list, setList] = useState([]);
  const [youVoted, setYouVoted] = useState(null);
  const [winnerIds, setWinnerIds] = useState([]);
  const [img, setImg] = useState(null);
  const [loading, setLoading] = useState(true);
  const pollTimer = useRef(null);

  useEffect(() => {
    if (!token) { router.replace("/login"); return; }
    loadAll();
    pollTimer.current = setInterval(loadAll, 8000);
    return () => clearInterval(pollTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const computeWinners = (arr) => {
    if (!arr?.length) return [];
    const top = Math.max(...arr.map((c) => Number(c.votes || 0)));
    return arr.filter((c) => Number(c.votes || 0) === top).map((c) => c.id);
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      const pr = await fetch(api("/public/period"));
      const p = await pr.json();
      setPeriod(p);

      if (!p) { setList([]); setYouVoted(null); setLoading(false); return; }

      const sr = await fetch(api(`/vote/status?periodId=${p.id}`), { headers: { Authorization: `Bearer ${token}` } });
      const s = await sr.json();
      setYouVoted(s?.youVoted || null);

      if (p.resultsPublished) {
        const rr = await fetch(api(`/public/results?periodId=${p.id}`), { headers: { Authorization: `Bearer ${token}` } });
        if (rr.ok) {
          const data = await rr.json();
          const arr = Array.isArray(data.candidates) ? data.candidates : [];
          setList(arr);
          setWinnerIds(computeWinners(arr));
          setPeriod((old) => ({ ...(data.period || p) }));
        } else {
          setList([]);
          setWinnerIds([]);
        }
      } else {
        setList([]);
        setWinnerIds([]);
      }
      setLoading(false);
    } catch {
      notifyError("Failed to load results");
      setLoading(false);
    }
  };

  if (loading) return <div className="max-w-6xl mx-auto px-4 bg-white rounded-xl shadow p-6 mt-6 animate-pulse">Loading…</div>;

  return (
    <div className="max-w-6xl mx-auto px-4">
      {!period ? (
        <div className="bg-white rounded-xl shadow p-6 mt-6">No results available yet.</div>
      ) : (
        <div className="bg-white rounded-xl shadow p-6 mt-6 transition hover:shadow-lg">
          <h2 className="text-xl font-bold mb-1">{period.title || "Election Results"}</h2>
          {period.description && <p className="text-gray-600">{period.description}</p>}
          <p className="text-gray-600 mb-4">
            {new Date(period.startTime).toLocaleString()} — {new Date(period.endTime).toLocaleString()}
          </p>

          {youVoted && (
            <div className="p-3 rounded bg-green-50 border mb-4">
              You voted for <span className="font-semibold">{youVoted.name}</span>.
            </div>
          )}

          {!period.resultsPublished ? (
            <div className="text-gray-500">Results not published yet.</div>
          ) : list.length === 0 ? (
            <div className="text-gray-500">You’re not eligible to view results for this session.</div>
          ) : (
            <>
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {list.map((c) => (
                  <div
                    key={c.id}
                    className={`border rounded p-3 text-center transition transform hover:-translate-y-0.5 hover:shadow ${winnerIds.includes(c.id) ? "ring-2 ring-indigo-600" : ""}`}
                  >
                    <img
                      src={c.photoUrl || "/placeholder.png"}
                      className="w-24 h-24 rounded-full mx-auto object-cover cursor-pointer mb-2 transition transform hover:scale-105"
                      alt={c.name}
                      onClick={() => c.photoUrl && setImg(c.photoUrl)}
                    />
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-sm text-gray-600">{c.lga || "-"}</div>
                    <div className="mt-1 font-bold">{c.votes} votes</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {img && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center transition" onClick={() => setImg(null)}>
          <img src={img} alt="candidate" className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-xl" />
        </div>
      )}
    </div>
  );
}
