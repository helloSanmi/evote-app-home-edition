import { useEffect, useState } from "react";
import { jget } from "../lib/apiBase";
import { mediaUrl } from "../lib/mediaUrl";
import { notifyError } from "../components/Toast";

export default function Results() {
  const [sessions, setSessions] = useState(null);
  const [sel, setSel] = useState("");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await jget("/api/public/published-sessions");
        if (!mounted) return;
        setSessions(list);
      } catch (e) {
        notifyError(e.message || "Failed to load sessions");
        setSessions([]);
      }
    })();
    return () => (mounted = false);
  }, []);

  useEffect(() => {
    if (!sel) return setRows([]);
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

  if (sessions === null) return <div className="max-w-4xl mx-auto px-4 py-8">Loading…</div>;
  if (sessions.length === 0) return <div className="max-w-4xl mx-auto px-4 py-8 text-gray-600">No published results yet.</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div className="rounded-2xl border border-white/60 bg-white/85 p-5 shadow-[0_25px_70px_-40px_rgba(15,23,42,0.6)] backdrop-blur">
        <div className="text-sm text-gray-600 mb-1">Pick a session</div>
        <select className="form-control" value={sel} onChange={e=>setSel(e.target.value)}>
          <option value="">Select…</option>
          {sessions.map(s => (
            <option key={s.id} value={s.id}>
              {(s.title || `Session #${s.id}`)} — {new Date(s.startTime).toLocaleString()}
            </option>
          ))}
        </select>
      </div>

      {sel && (
        <div className="rounded-2xl border border-white/60 bg-white/85 p-5 shadow-[0_25px_70px_-40px_rgba(15,23,42,0.6)] backdrop-blur">
          <div className="font-bold mb-3">Results</div>
          {rows.length === 0 ? (
            <div className="text-gray-500">No data.</div>
          ) : (
            <div className="space-y-2">
              {rows.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-white/70 p-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <img src={mediaUrl(c.photoUrl)} className="h-12 w-12 rounded-full object-cover ring-1 ring-slate-200/70" alt={c.name} />
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-gray-600">{c.state} • {c.lga}</div>
                    </div>
                  </div>
                  <div className="font-semibold">{c.votes} votes</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
