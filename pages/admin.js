// frontend/pages/admin.js
import { useEffect, useMemo, useRef, useState } from "react";
import io from "socket.io-client";
import { notifyError, notifySuccess } from "../components/Toast";
import { useRouter } from "next/router";
import { useModal } from "../components/Modal";

const API = process.env.NEXT_PUBLIC_API_URL || "";

export default function Admin() {
  const router = useRouter();
  const { open } = useModal();

  const token = useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("token") : null), []);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);

  const [tab, setTab] = useState("overview");

  // New session form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  // Unpublished pool
  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [unpublished, setUnpublished] = useState([]);
  const [unpubLoading, setUnpubLoading] = useState(false);

  // Active/upcoming/awaiting publish sessions
  const [sessions, setSessions] = useState([]);
  const [live, setLive] = useState({}); // periodId -> [{id,name,votes,...}]
  const timersRef = useRef({});
  const sock = useRef(null);

  // Past
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [selectedCandidates, setSelectedCandidates] = useState([]); // ensure array
  const [audit, setAudit] = useState(null);

  useEffect(() => {
    const admin = localStorage.getItem("isAdmin") === "true";
    if (!localStorage.getItem("token") || !admin) router.replace("/login");
  }, [router]);

  useEffect(() => {
    loadSessions();
    loadUnpublished();
  }, []); // eslint-disable-line

  useEffect(() => {
    // socket listeners
    sock.current = io(API, { transports: ["websocket", "polling"] });
    sock.current.on("voteUpdate", ({ periodId }) => {
      if (periodId) fetchLive(periodId);
    });
    sock.current.on("resultsPublished", ({ periodId }) => {
      open({
        title: "Results Published",
        message: `Results for Session #${periodId} are now available.`,
        confirmText: "OK",
      });
      loadSessions();
    });
    return () => sock.current?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // poll live for active sessions
    Object.values(timersRef.current).forEach(clearInterval);
    timersRef.current = {};
    sessions
      .filter((s) => s.status === "active")
      .forEach((s) => {
        fetchLive(s.id);
        timersRef.current[s.id] = setInterval(() => fetchLive(s.id), 5000);
      });
    return () => {
      Object.values(timersRef.current).forEach(clearInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);

  async function safeJson(r) {
    try {
      if (!r) return null;
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("application/json")) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  const loadUnpublished = async () => {
    setUnpubLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/unpublished`, { headers });
      const data = await safeJson(r);
      if (!r || !r.ok) throw new Error((data && data.error) || "Failed to load unpublished");
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
    if (!name.trim()) return notifyError("Name is required");
    try {
      const r = await fetch(`${API}/api/admin/candidate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: name.trim(), state: state.trim(), photoUrl: (photoUrl || "").trim() }),
      });
      const data = await safeJson(r);
      if (!r || !r.ok || !data?.success) throw new Error((data && data.error) || "Error adding candidate");
      setName(""); setState(""); setPhotoUrl("");
      await loadUnpublished();
      notifySuccess("Candidate added");
    } catch (e) {
      notifyError(e.message);
    }
  };

  const removeCandidate = async (id) => {
    if (!confirm("Delete this candidate?")) return;
    const r = await fetch(`${API}/api/admin/remove-candidate?candidateId=${id}`, { method: "DELETE", headers });
    const data = await safeJson(r);
    if (!r || !r.ok || !data?.success) return notifyError((data && data.error) || "Delete failed");
    await loadUnpublished();
    notifySuccess("Candidate deleted");
  };

  const startSession = async () => {
    if (!title.trim() || !start || !end) return notifyError("Enter title, start, end");
    if (unpublished.length === 0) return notifyError("Add candidates first");
    const r = await fetch(`${API}/api/admin/voting-period`, {
      method: "POST", headers, body: JSON.stringify({ title, description, start, end }),
    });
    const data = await safeJson(r);
    if (!r || !r.ok || !data?.success) return notifyError((data && data.error) || "Error starting voting");
    setTitle(""); setDescription(""); setStart(""); setEnd("");
    await loadUnpublished(); await loadSessions();
    notifySuccess("Voting session started");
  };

  const loadSessions = async () => {
    const r = await fetch(`${API}/api/admin/active-periods`, { headers });
    const data = await safeJson(r);
    if (!r || !r.ok) return notifyError((data && data.error) || "Failed to load sessions");
    setSessions(Array.isArray(data) ? data : []);
  };

  const fetchLive = async (periodId) => {
    const r = await fetch(`${API}/api/admin/live-votes?periodId=${periodId}`, { headers });
    const data = await safeJson(r);
    if (r && r.ok) setLive((s) => ({ ...s, [periodId]: Array.isArray(data) ? data : [] }));
  };

  const publish = async (p) => {
    const r = await fetch(`${API}/api/admin/publish-results?periodId=${p.id}`, { method: "POST", headers });
    const data = await safeJson(r);
    if (!r || !r.ok || (!data?.success && !data?.already)) return notifyError((data && data.error) || "Error publishing");
    await loadSessions();
    notifySuccess("Results published");
  };

  const endEarly = async (p) => {
    const r = await fetch(`${API}/api/admin/end-voting-early?periodId=${p.id}`, { method: "POST", headers });
    const data = await safeJson(r);
    if (!r || !r.ok || !data?.success) return notifyError((data && data.error) || "Error ending voting");
    await loadSessions();
    notifySuccess("Voting ended");
  };

  // Past sessions
  const loadPast = async () => {
    const r = await fetch(`${API}/api/admin/periods`, { headers });
    const data = await safeJson(r);
    if (r && r.ok) setPeriods(Array.isArray(data) ? data : []);
  };
  useEffect(() => { if (tab === "past") loadPast(); }, [tab]); // eslint-disable-line

  const viewPeriod = async (p) => {
    setSelectedPeriod(p);
    try {
      const [cr, ar] = await Promise.all([
        fetch(`${API}/api/admin/candidates?periodId=${p.id}`, { headers }),
        fetch(`${API}/api/admin/audit?periodId=${p.id}`, { headers }),
      ]);
      const cand = (await cr.json());
      const aud = (await ar.json());
      setSelectedCandidates(Array.isArray(cand) ? cand : []);
      setAudit(aud || null);
    } catch {
      setSelectedCandidates([]);
      setAudit(null);
      notifyError("Failed to load period details");
    }
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
          {/* Multi-session deck */}
          <div className="bg-white rounded-2xl shadow p-5">
            <h2 className="text-lg font-bold mb-3">Active / Upcoming / Awaiting Publish</h2>
            {sessions.length === 0 ? (
              <div className="text-gray-600">No sessions yet.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sessions.map((p) => {
                  const l = live[p.id] || [];
                  const ended = p.status === "ended";
                  const canPublish = ended && !p.resultsPublished;
                  const active = p.status === "active";
                  return (
                    <div key={p.id} className="border rounded-xl p-4 hover:shadow transition">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{p.title || `Session #${p.id}`}</div>
                          {p.description && <div className="text-sm text-gray-600">{p.description}</div>}
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(p.startTime).toLocaleString()} — {new Date(p.endTime).toLocaleString()}
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${active ? "bg-green-100 text-green-800" : ended ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                          {active ? "Active" : ended ? "Ended" : "Upcoming"}
                        </span>
                      </div>

                      {/* Live panel */}
                      {active && (
                        <div className="mt-3">
                          <div className="text-sm font-semibold mb-1">Live Votes</div>
                          <div className="space-y-2">
                            {l.length === 0 ? (
                              <div className="text-sm text-gray-500">Loading…</div>
                            ) : (
                              l.map((c) => (
                                <div key={c.id} className="flex items-center justify-between border rounded p-2">
                                  <div className="flex items-center gap-2">
                                    <img src={c.photoUrl || "/placeholder.png"} className="w-7 h-7 rounded object-cover" alt={c.name} />
                                    <div className="text-sm">{c.name}</div>
                                  </div>
                                  <div className="font-semibold">{c.votes}</div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => publish(p)}
                          disabled={!canPublish}
                          className={`px-4 py-2 rounded ${canPublish ? "bg-green-600 text-white hover:bg-green-700" : "bg-gray-300 text-gray-700"}`}
                        >
                          {p.resultsPublished ? "Published" : "Publish Results"}
                        </button>
                        {active && (
                          <button onClick={() => endEarly(p)} className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700">
                            End Early
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Create new session */}
          <div className="bg-white rounded-2xl shadow p-5">
            <h2 className="text-lg font-bold mb-3">Start New Voting Session</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input className="border p-2 rounded md:col-span-2" placeholder="Election Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <textarea className="border p-2 rounded md:col-span-2" placeholder="Short Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
              <input type="datetime-local" className="border p-2 rounded" value={start} onChange={(e) => setStart(e.target.value)} />
              <input type="datetime-local" className="border p-2 rounded" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <button
              onClick={startSession}
              className={`mt-3 px-4 py-2 rounded text-white ${unpublished.length === 0 || !title || !start || !end ? "bg-gray-400" : "bg-indigo-600 hover:bg-indigo-700"}`}
              disabled={unpublished.length === 0 || !title || !start || !end}
            >
              Start Voting
            </button>
          </div>

          {/* Unpublished candidates */}
          <div className="bg-white rounded-2xl shadow p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">Unpublished Candidates</h2>
              <button onClick={loadUnpublished} className="text-sm px-3 py-1 rounded border hover:bg-gray-50">Reload</button>
            </div>
            <form onSubmit={addCandidate} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <input className="border p-2 rounded" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
              <input className="border p-2 rounded" placeholder="State" value={state} onChange={(e) => setState(e.target.value)} />
              <input className="border p-2 rounded" placeholder="Photo URL" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} />
              <div className="md:col-span-3">
                <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Add Candidate</button>
              </div>
            </form>
            {unpubLoading ? (
              <div className="text-gray-500 animate-pulse">Loading…</div>
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
                        <div className="text-sm text-gray-600">{c.state || "-"}</div>
                      </div>
                    </div>
                    <button onClick={() => removeCandidate(c.id)} className="text-white bg-red-600 px-3 py-1 rounded hover:bg-red-700">Delete</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "past" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="bg-white rounded-2xl shadow p-5">
            <h2 className="text-lg font-bold mb-3">Previous Voting Sessions</h2>
            <div className="space-y-2">
              {periods.length === 0 ? (
                <div className="text-gray-500">No sessions yet.</div>
              ) : (
                periods.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => viewPeriod(p)}
                    className={`w-full text-left border rounded p-3 hover:bg-gray-50 transition ${selectedPeriod?.id === p.id ? "bg-blue-50 border-blue-400" : ""}`}
                  >
                    <div className="font-semibold">{p.title || `Session #${p.id}`}</div>
                    <div className="text-sm text-gray-600">Start: {new Date(p.startTime).toLocaleString()}</div>
                    <div className="text-sm text-gray-600">End: {new Date(p.endTime).toLocaleString()}</div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-5">
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
                  {Array.isArray(selectedCandidates) && selectedCandidates.length > 0 ? (
                    selectedCandidates.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 border rounded p-2">
                        <img src={c.photoUrl || "/placeholder.png"} className="w-10 h-10 rounded object-cover" alt={c.name} />
                        <div className="flex-1">
                          <div className="font-medium">{c.name}</div>
                          <div className="text-sm text-gray-600">{c.state || "-"}</div>
                        </div>
                        <div className="font-semibold">{c.votes} votes</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-500">No candidates</div>
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
