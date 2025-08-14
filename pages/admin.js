// frontend/pages/admin.js  (replace)
import { useEffect, useMemo, useRef, useState } from "react";
import io from "socket.io-client";
import { useRouter } from "next/router";
import { notifyError, notifySuccess } from "../components/Toast";

const API = process.env.NEXT_PUBLIC_API_URL || "";

export default function Admin() {
  const router = useRouter();

  const [tab, setTab] = useState("overview");
  const [period, setPeriod] = useState(null);
  const [meta, setMeta] = useState({ title: null, description: null });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const [name, setName] = useState("");
  const [lga, setLga] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [unpublished, setUnpublished] = useState([]);
  const [unpubLoading, setUnpubLoading] = useState(false);

  const [periods, setPeriods] = useState([]);
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [audit, setAudit] = useState(null);

  const [liveVotes, setLiveVotes] = useState([]);
  const [publishing, setPublishing] = useState(false);

  const token = useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("token") : null), []);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);

  const socketRef = useRef(null);
  const liveTimer = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const admin = localStorage.getItem("isAdmin") === "true";
    if (!localStorage.getItem("token") || !admin) router.replace("/login");
  }, [router]);

  const isActive = (p) => {
    if (!p) return false;
    const now = Date.now();
    return !p.forcedEnded && now >= new Date(p.startTime).getTime() && now < new Date(p.endTime).getTime();
  };
  const canPublish = (p) => {
    if (!p) return false;
    const now = Date.now();
    return p.forcedEnded || now >= new Date(p.endTime).getTime();
  };

  useEffect(() => {
    socketRef.current = io(API, { transports: ["websocket", "polling"] });
    socketRef.current.on("voteUpdate", () => isActive(period) && loadLiveVotes());
    socketRef.current.on("resultsPublished", () => { loadPeriod(); setLiveVotes([]); });
    return () => socketRef.current?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  useEffect(() => { loadPeriod(); loadUnpublished(); }, []); // eslint-disable-line
  useEffect(() => { if (tab === "past") loadPeriods(); }, [tab]);

  useEffect(() => {
    // keep admin live results updating periodically while active
    clearInterval(liveTimer.current);
    if (isActive(period)) {
      liveTimer.current = setInterval(loadLiveVotes, 5000);
      loadLiveVotes();
    }
    return () => clearInterval(liveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period?.startTime, period?.endTime, period?.forcedEnded]);

  async function safeJson(res) {
    try {
      if (!res) return null;
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) { await res.text(); return null; }
      return await res.json();
    } catch { return null; }
  }

  const loadPeriod = async () => {
    const r = await fetch(`${API}/api/admin/get-period`, { headers });
    const p = await safeJson(r);
    setPeriod(p || null);
    if (p) {
      const mr = await fetch(`${API}/api/admin/meta?periodId=${p.id}`, { headers });
      const m = await safeJson(mr);
      setMeta(m || { title: null, description: null });
    } else {
      setMeta({ title: null, description: null });
    }
  };

  const loadUnpublished = async () => {
    setUnpubLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/unpublished`, { headers });
      const data = await safeJson(r);
      if (!r.ok) throw new Error(data?.error || "Failed to load unpublished");
      setUnpublished(Array.isArray(data) ? data : []);
    } catch (e) {
      setUnpublished([]);
      notifyError(e.message);
    } finally {
      setUnpubLoading(false);
    }
  };

  const addCandidate = async (e) => {
    e.preventDefault();
    const payload = { name: (name || "").trim(), lga: (lga || "").trim(), photoUrl: (photoUrl || "").trim() };
    if (!payload.name) return notifyError("Name is required");
    try {
      const res = await fetch(`${API}/api/admin/candidate`, { method: "POST", headers, body: JSON.stringify(payload) });
      const data = await safeJson(res);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Error adding candidate");
      setName(""); setLga(""); setPhotoUrl("");
      await loadUnpublished();
      notifySuccess("Candidate added");
    } catch (e) { notifyError(e.message); }
  };

  const deleteCandidate = async (id) => {
    if (!confirm("Delete this candidate?")) return;
    try {
      const res = await fetch(`${API}/api/admin/remove-candidate?candidateId=${id}`, { method: "DELETE", headers });
      const data = await safeJson(res);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Delete failed");
      await loadUnpublished();
      notifySuccess("Candidate deleted");
    } catch (e) { notifyError(e.message); }
  };

  const startVoting = async () => {
    if (!title.trim() || !start || !end) return notifyError("Enter title, start, end");
    if (unpublished.length === 0) return notifyError("Add candidates first");
    const res = await fetch(`${API}/api/admin/voting-period`, {
      method: "POST", headers, body: JSON.stringify({ title, description, start, end })
    });
    const data = await safeJson(res);
    if (!res.ok || !data?.success) return notifyError(data?.error || "Error starting voting");
    setTitle(""); setDescription(""); setStart(""); setEnd("");
    await loadPeriod(); await loadUnpublished(); setTab("overview");
    notifySuccess("Voting started");
  };

  const publishResults = async () => {
    setPublishing(true);
    const res = await fetch(`${API}/api/admin/publish-results`, { method: "POST", headers });
    const data = await safeJson(res);
    setPublishing(false);
    if (!res.ok || !data?.success) {
      if (data?.already) { await loadPeriod(); return; }
      return notifyError(data?.error || "Error publishing results");
    }
    await loadPeriod();
    notifySuccess("Results published");
  };

  const endVotingEarly = async () => {
    const res = await fetch(`${API}/api/admin/end-voting-early`, { method: "POST", headers });
    const data = await safeJson(res);
    if (!res.ok || !data?.success) return notifyError(data?.error || "Error ending voting");
    await loadPeriod();
    notifySuccess("Voting ended early");
  };

  const loadPeriods = async () => {
    setPeriodsLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/periods`, { headers });
      const data = await safeJson(r);
      if (!r.ok) throw new Error(data?.error || "Failed to load sessions");
      setPeriods(Array.isArray(data) ? data : []);
    } catch (e) {
      setPeriods([]);
      notifyError(e.message);
    } finally {
      setPeriodsLoading(false);
    }
  };

  const viewPeriod = async (p) => {
    setSelectedPeriod(p); setSelectedCandidates([]); setAudit(null);
    try {
      const [cr, ar] = await Promise.all([
        fetch(`${API}/api/admin/candidates?periodId=${p.id}`, { headers }),
        fetch(`${API}/api/admin/audit?periodId=${p.id}`, { headers }),
      ]);
      setSelectedCandidates((await cr.json()) || []);
      setAudit((await ar.json()) || null);
    } catch {
      notifyError("Failed to load period details");
    }
  };

  const loadLiveVotes = async () => {
    const r = await fetch(`${API}/api/admin/live-votes`, { headers });
    setLiveVotes((await r.json()) || []);
  };

  return (
    <div className="max-w-6xl mx-auto px-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <button onClick={() => setTab("overview")} className={`px-4 py-2 rounded-t transition ${tab === "overview" ? "bg-white border border-b-transparent shadow-sm" : "bg-gray-200 hover:bg-gray-300"}`}>Dashboard</button>
        <button onClick={() => setTab("past")} className={`px-4 py-2 rounded-t transition ${tab === "past" ? "bg-white border border-b-transparent shadow-sm" : "bg-gray-200 hover:bg-gray-300"}`}>Previous Sessions</button>
      </div>

      {tab === "overview" && (
        <div className="space-y-6 mt-4">
          {/* Current Period */}
          <div className="bg-white rounded-2xl shadow p-5 transition hover:shadow-lg">
            <h2 className="text-lg font-bold mb-2">Current / Latest Voting Period</h2>
            {period ? (
              <>
                <div className="font-semibold">{meta?.title || "Untitled Election"}</div>
                {meta?.description && <div className="text-gray-600 mb-2">{meta.description}</div>}
                <div>Start: {new Date(period.startTime).toLocaleString()}</div>
                <div>End: {new Date(period.endTime).toLocaleString()}</div>
                <div>Results Published: {period.resultsPublished ? "Yes" : "No"}</div>
                <div className="flex gap-2 mt-3">
                  {/* Publish enabled only when end reached or forced ended */}
                  <button
                    onClick={publishResults}
                    disabled={publishing || !!period.resultsPublished || !canPublish(period)}
                    className={`px-4 py-2 rounded ${period.resultsPublished ? "bg-gray-400" : canPublish(period) ? "bg-green-600 text-white hover:bg-green-700" : "bg-gray-300"}`}
                  >
                    {period.resultsPublished ? "Results Published" : (publishing ? "Publishing..." : "Publish Results")}
                  </button>
                  {/* Hide End Early when not active */}
                  {isActive(period) && !period.resultsPublished && (
                    <button onClick={endVotingEarly} className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700">
                      End Voting Early
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="text-gray-600">No period yet.</div>
            )}
          </div>

          {/* Add Candidate */}
          <div className="bg-white rounded-2xl shadow p-5 transition hover:shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">Add Candidate</h2>
              <button onClick={loadUnpublished} className="text-sm px-3 py-1 rounded border hover:bg-gray-50">Reload Preview</button>
            </div>
            <form onSubmit={addCandidate} className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input className="border p-2 rounded" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
              <input className="border p-2 rounded" placeholder="LGA" value={lga} onChange={(e) => setLga(e.target.value)} />
              <input className="border p-2 rounded" placeholder="Photo URL" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} />
              <div className="md:col-span-3">
                <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Add Candidate</button>
              </div>
            </form>
          </div>

          {/* Unpublished with Delete */}
          <div className="bg-white rounded-2xl shadow p-5 transition hover:shadow-lg">
            <h2 className="text-lg font-bold mb-3">Unpublished Candidates</h2>
            {unpubLoading ? (
              <div className="text-gray-500 animate-pulse">Loading preview…</div>
            ) : unpublished.length === 0 ? (
              <div className="text-gray-500">No unpublished candidates</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {unpublished.map((c) => (
                  <div key={c.id} className="border rounded p-3 flex items-center justify-between bg-gray-50">
                    <div className="flex items-center gap-3">
                      <img src={c.photoUrl || "/placeholder.png"} className="w-12 h-12 rounded object-cover" alt={c.name} />
                      <div>
                        <div className="font-semibold">{c.name}</div>
                        <div className="text-sm text-gray-600">{c.lga || "-"}</div>
                      </div>
                    </div>
                    <button onClick={() => deleteCandidate(c.id)} className="text-white bg-red-600 px-3 py-1 rounded hover:bg-red-700">Delete</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Start Voting */}
          <div className="bg-white rounded-2xl shadow p-5 transition hover:shadow-lg">
            <h2 className="text-lg font-bold mb-3">Start Voting</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input className="border p-2 rounded md:col-span-2" placeholder="Election Title (e.g., Presidential Election 2025)" value={title} onChange={(e) => setTitle(e.target.value)} />
              <textarea className="border p-2 rounded md:col-span-2" placeholder="Short Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
              <input type="datetime-local" className="border p-2 rounded" value={start} onChange={(e) => setStart(e.target.value)} />
              <input type="datetime-local" className="border p-2 rounded" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <button
              onClick={startVoting}
              className={`mt-3 px-4 py-2 rounded text-white ${unpublished.length === 0 || !title || !start || !end ? "bg-gray-400" : "bg-indigo-600 hover:bg-indigo-700"}`}
              disabled={unpublished.length === 0 || !title || !start || !end}
            >
              Start Voting
            </button>
          </div>

          {/* Live Votes */}
          {isActive(period) && (
            <div className="bg-white rounded-2xl shadow p-5 transition hover:shadow-lg">
              <h2 className="text-lg font-bold mb-3">Live Votes</h2>
              {liveVotes.length === 0 ? (
                <div className="text-gray-500">No candidates</div>
              ) : (
                <div className="space-y-2">
                  {liveVotes.map((c) => (
                    <div key={c.id} className="flex items-center justify-between border p-2 rounded">
                      <div className="flex items-center gap-3">
                        <img src={c.photoUrl || "/placeholder.png"} className="w-8 h-8 rounded object-cover" alt={c.name} />
                        <span className="font-medium">{c.name}</span>
                      </div>
                      <span className="font-semibold">{c.votes}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "past" && (
        <div className="grid grid-cols-1 md-grid-cols-2 md:grid-cols-2 gap-4 mt-4">
          <div className="bg-white rounded-2xl shadow p-5 transition hover:shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">Previous Voting Sessions</h2>
              <button onClick={() => loadPeriods()} className="text-sm px-3 py-1 rounded border hover:bg-gray-50">Reload</button>
            </div>
            {periodsLoading ? (
              <div className="text-gray-500 animate-pulse">Loading sessions…</div>
            ) : periods.length === 0 ? (
              <div className="text-gray-500">No sessions yet.</div>
            ) : (
              <div className="space-y-2">
                {periods.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => viewPeriod(p)}
                    className={`w-full text-left border rounded p-3 hover:bg-gray-50 transition ${selectedPeriod?.id === p.id ? "bg-blue-50 border-blue-400" : ""}`}
                  >
                    <div className="font-semibold">{p.title || `Session #${p.id}`}</div>
                    <div className="text-sm text-gray-600">Start: {new Date(p.startTime).toLocaleString()}</div>
                    <div className="text-sm text-gray-600">End: {new Date(p.endTime).toLocaleString()}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow p-5 transition hover:shadow-lg">
            <h2 className="text-lg font-bold mb-3">Session Details</h2>
            {!selectedPeriod ? (
              <div className="text-gray-500">Select a session to view details.</div>
            ) : (
              <>
                {selectedPeriod?.title && (
                  <div className="mb-3">
                    <div className="font-semibold">{selectedPeriod.title}</div>
                    {selectedPeriod?.description && <div className="text-gray-600">{selectedPeriod.description}</div>}
                  </div>
                )}
                {audit && (
                  <div className="mb-3 rounded border p-2 text-sm">
                    <div className="font-semibold mb-1">Audit</div>
                    <div>Total candidate votes: {audit.candidateVotes}</div>
                    <div>Total vote records: {audit.voteRows}</div>
                    <div>
                      Consistent:{" "}
                      <span className={`font-semibold ${audit.consistent ? "text-green-700" : "text-red-700"}`}>
                        {audit.consistent ? "Yes" : "No"}
                      </span>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {selectedCandidates.length === 0 ? (
                    <div className="text-gray-500">No candidates</div>
                  ) : (
                    selectedCandidates.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 border rounded p-2">
                        <img src={c.photoUrl || "/placeholder.png"} className="w-10 h-10 rounded object-cover" alt={c.name} />
                        <div className="flex-1">
                          <div className="font-medium">{c.name}</div>
                          <div className="text-sm text-gray-600">{c.lga || "-"}</div>
                        </div>
                        <div className="font-semibold">{c.votes} votes</div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
