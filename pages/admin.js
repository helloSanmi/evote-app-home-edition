// frontend/pages/admin.js
import { useEffect, useMemo, useRef, useState } from "react";
import io from "socket.io-client";
import { useRouter } from "next/router";
import { api, safeJson } from "../lib/apiBase";
import { notifyError, notifySuccess } from "../components/Toast";

export default function Admin() {
  const router = useRouter();
  const token = useMemo(() => (typeof window !== "undefined" ? localStorage.getItem("token") : null), []);
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  // Tabs
  const [tab, setTab] = useState("overview");

  // Unpublished candidates
  const [unpub, setUnpub] = useState([]);

  // Candidate form
  const [name, setName] = useState("");
  const [stateSel, setStateSel] = useState("");
  const [lgaSel, setLgaSel] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // NG states/LGAs (loaded from /public/ng-states-lgas.json)
  const [ngStates, setNgStates] = useState([]); // [{state, lgas:[]}]
  const [lgas, setLgas] = useState([]);

  // Start session
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  // Sessions
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Past details
  const [selected, setSelected] = useState(null);
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [audit, setAudit] = useState(null);

  // Live votes per periodId
  const [live, setLive] = useState({});
  const socketRef = useRef(null);

  // Guard
  useEffect(() => {
    const isAdmin = localStorage.getItem("isAdmin") === "true";
    if (!localStorage.getItem("token") || !isAdmin) router.replace("/login");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load NG states (from public JSON) & normalize
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/ng-states-lgas.json", { cache: "force-cache" });
        const raw = await r.json();
        let arr = [];
        if (Array.isArray(raw)) {
          // expected shape already
          arr = raw;
        } else if (Array.isArray(raw?.states)) {
          arr = raw.states;
        } else if (raw && typeof raw === "object") {
          // possibly { "Lagos": ["Ikeja", ...], ... }
          arr = Object.keys(raw).map((k) => ({ state: k, lgas: raw[k] || [] }));
        }
        setNgStates(arr);
      } catch {
        setNgStates([]);
      }
    })();
  }, []);

  // Update LGAs when state changes
  useEffect(() => {
    const st = ngStates.find((s) => String(s.state || "").toLowerCase() === String(stateSel || "").toLowerCase());
    setLgas(st?.lgas || []);
    setLgaSel("");
  }, [stateSel, ngStates]);

  // Socket events
  useEffect(() => {
    socketRef.current = io(api(""), { transports: ["websocket", "polling"] });
    socketRef.current.on("voteUpdate", ({ periodId }) => loadLiveFor(periodId));
    socketRef.current.on("sessionStarted", () => loadAll());
    socketRef.current.on("sessionEnded", () => loadAll());
    socketRef.current.on("resultsPublished", () => loadAll());
    return () => socketRef.current?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, []);

  async function loadAll() { await Promise.all([loadUnpub(), loadSessions()]); }

  async function loadUnpub() {
    try {
      const r = await fetch(api("/api/admin/unpublished"), { headers: authHeaders });
      const data = await safeJson(r);
      if (!r.ok) throw new Error(data?.error || "Failed to load unpublished");
      setUnpub(Array.isArray(data) ? data : []);
    } catch (e) {
      setUnpub([]);
      notifyError(e.message);
    }
  }

  async function loadSessions() {
    setLoadingSessions(true);
    try {
      const r = await fetch(api("/api/admin/periods"), { headers: authHeaders });
      const data = await safeJson(r);
      if (!r.ok) throw new Error(data?.error || "Failed to load sessions");
      setSessions(Array.isArray(data) ? data : []);
      const now = Date.now();
      const active = (Array.isArray(data) ? data : []).filter(
        (s) =>
          !s.resultsPublished &&
          !s.forcedEnded &&
          now >= new Date(s.startTime).getTime() &&
          now < new Date(s.endTime).getTime()
      );
      await Promise.all(active.map((s) => loadLiveFor(s.id)));
    } catch (e) {
      setSessions([]);
      notifyError(e.message);
    } finally {
      setLoadingSessions(false);
    }
  }

  async function loadLiveFor(periodId) {
    try {
      const r = await fetch(api(`/api/admin/candidates?periodId=${periodId}`), { headers: authHeaders });
      const arr = (await safeJson(r)) || [];
      setLive((prev) => ({ ...prev, [periodId]: Array.isArray(arr) ? arr : [] }));
    } catch {}
  }

  const isActive = (s) =>
    !s.resultsPublished &&
    !s.forcedEnded &&
    Date.now() >= new Date(s.startTime).getTime() &&
    Date.now() < new Date(s.endTime).getTime();
  const isUpcoming = (s) =>
    !s.resultsPublished && !s.forcedEnded && Date.now() < new Date(s.startTime).getTime();
  const isEndedUnpublished = (s) =>
    !s.resultsPublished && (s.forcedEnded || Date.now() >= new Date(s.endTime).getTime());

  async function onUploadFile(file) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(api("/api/admin/upload"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await safeJson(r);
      if (!r.ok) throw new Error(data?.error || "Upload failed");
      setPhotoUrl(data.url || "");
      notifySuccess("Image uploaded");
    } catch (e) {
      notifyError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function addCandidate(e) {
    e.preventDefault();
    if (!name.trim() || !stateSel || !lgaSel) return notifyError("Name, State and LGA are required");
    try {
      const r = await fetch(api("/api/admin/candidate"), {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          state: stateSel,
          lga: lgaSel,
          photoUrl: photoUrl || null,
        }),
      });
      const data = await safeJson(r);
      if (!r.ok || !data?.success) throw new Error(data?.error || "Error adding candidate");
      setName(""); setStateSel(""); setLgaSel(""); setPhotoUrl("");
      await loadUnpub();
      notifySuccess("Candidate added");
    } catch (e) {
      notifyError(e.message);
    }
  }

  async function deleteCandidate(id) {
    if (!confirm("Delete this candidate?")) return;
    try {
      const r = await fetch(api(`/api/admin/remove-candidate?candidateId=${id}`), {
        method: "DELETE",
        headers: authHeaders,
      });
      const data = await safeJson(r);
      if (!r.ok || !data?.success) throw new Error(data?.error || "Delete failed");
      await loadUnpub();
      notifySuccess("Candidate deleted");
    } catch (e) {
      notifyError(e.message);
    }
  }

  async function startSession() {
    if (!title.trim() || !start || !end) return notifyError("Enter title, start & end");
    if (unpub.length === 0) return notifyError("Add candidates first");
    try {
      const r = await fetch(api("/api/admin/voting-period"), {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, start, end }),
      });
      const data = await safeJson(r);
      if (!r.ok || !data?.success) throw new Error(data?.error || "Error starting voting");
      setTitle(""); setDescription(""); setStart(""); setEnd("");
      await Promise.all([loadUnpub(), loadSessions()]);
      notifySuccess("Voting session started");
      setTab("overview");
    } catch (e) {
      notifyError(e.message);
    }
  }

  async function endEarly(periodId) {
    try {
      const r = await fetch(api(`/api/admin/end-voting-early?periodId=${periodId}`), {
        method: "POST",
        headers: authHeaders,
      });
      const data = await safeJson(r);
      if (!r.ok || !data?.success) throw new Error(data?.error || "Error ending voting");
      await loadSessions();
      notifySuccess("Voting ended early");
    } catch (e) {
      notifyError(e.message);
    }
  }

  async function publish(periodId) {
    try {
      const r = await fetch(api(`/api/admin/publish-results?periodId=${periodId}`), {
        method: "POST",
        headers: authHeaders,
      });
      const data = await safeJson(r);
      if (!r.ok || !data?.success) {
        if (data?.already) { await loadSessions(); return; }
        throw new Error(data?.error || "Error publishing");
      }
      await loadSessions();
      notifySuccess("Results published");
    } catch (e) {
      notifyError(e.message);
    }
  }

  async function loadPastDetails(s) {
    setSelected(s);
    try {
      const [cr, ar] = await Promise.all([
        fetch(api(`/api/admin/candidates?periodId=${s.id}`), { headers: authHeaders }),
        fetch(api(`/api/admin/audit?periodId=${s.id}`), { headers: authHeaders }),
      ]);
      const cs = (await safeJson(cr)) || [];
      const ad = (await safeJson(ar)) || null;
      setSelectedCandidates(Array.isArray(cs) ? cs : []);
      setAudit(ad);
    } catch {
      setSelectedCandidates([]);
      setAudit(null);
      notifyError("Failed to load session details");
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2 sticky top-0 bg-gray-50 z-10">
        <button onClick={() => setTab("overview")} className={`px-4 py-2 rounded-t ${tab === "overview" ? "bg-white border border-b-transparent shadow-sm" : "bg-gray-200 hover:bg-gray-300"}`}>Dashboard</button>
        <button onClick={() => setTab("past")} className={`px-4 py-2 rounded-t ${tab === "past" ? "bg-white border border-b-transparent shadow-sm" : "bg-gray-200 hover:bg-gray-300"}`}>Previous Sessions</button>
      </div>

      {tab === "overview" && (
        <div className="space-y-6 mt-4">
          {/* Unpublished + Add Candidate */}
          <div className="bg-white rounded-2xl shadow p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">Unpublished Candidates</h2>
              <button onClick={loadUnpub} className="text-sm px-3 py-1 rounded border hover:bg-gray-50">Reload</button>
            </div>

            <form onSubmit={addCandidate} className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <input className="border p-2 rounded" placeholder="Candidate Name" value={name} onChange={(e) => setName(e.target.value)} />
              <select className="border p-2 rounded" value={stateSel} onChange={(e) => setStateSel(e.target.value)}>
                <option value="">Select State</option>
                {ngStates.map((s) => <option key={s.state} value={s.state}>{s.state}</option>)}
              </select>
              <select className="border p-2 rounded" value={lgaSel} onChange={(e) => setLgaSel(e.target.value)} disabled={!stateSel}>
                <option value="">{stateSel ? "Select LGA" : "Select State first"}</option>
                {lgas.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>

              <div className="flex items-center gap-2">
                <label className="px-3 py-2 border rounded cursor-pointer hover:bg-gray-50">
                  {uploading ? "Uploading..." : "Upload Photo"}
                  <input type="file" className="hidden" accept="image/*" onChange={(e) => onUploadFile(e.target.files?.[0])} />
                </label>
                <input className="border p-2 rounded flex-1" placeholder="or paste Photo URL" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} />
              </div>

              <div className="md:col-span-4">
                <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Add Candidate</button>
              </div>
            </form>

            {unpub.length === 0 ? (
              <div className="text-gray-500">No unpublished candidates</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {unpub.map((c) => (
                  <div key={c.id} className="border rounded p-3 flex items-center justify-between bg-gray-50">
                    <div className="flex items-center gap-3">
                      <img
                        src={c.photoUrl ? api(c.photoUrl) : "/placeholder.png"}
                        className="w-12 h-12 rounded object-cover"
                        alt={c.name}
                        onError={(e) => (e.currentTarget.src = "/placeholder.png")}
                      />
                      <div>
                        <div className="font-semibold">{c.name}</div>
                        <div className="text-sm text-gray-600">{(c.state || "").trim()} {(c.state && c.lga) ? "•" : ""} {(c.lga || "").trim()}</div>
                      </div>
                    </div>
                    <button onClick={() => deleteCandidate(c.id)} className="text-white bg-red-600 px-3 py-1 rounded hover:bg-red-700">
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Start session */}
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
              className={`mt-3 px-4 py-2 rounded text-white ${unpub.length === 0 || !title || !start || !end ? "bg-gray-400" : "bg-indigo-600 hover:bg-indigo-700"}`}
              disabled={unpub.length === 0 || !title || !start || !end}
            >
              Start Voting
            </button>
          </div>

          {/* Active / Upcoming / Awaiting publish */}
          <div className="bg-white rounded-2xl shadow p-5">
            <h2 className="text-lg font-bold mb-3">Active / Upcoming / Awaiting Publish</h2>
            {loadingSessions ? (
              <div className="text-gray-500 animate-pulse">Loading…</div>
            ) : (
              <>
                {sessions.filter((s) => !s.resultsPublished && (isActive(s) || isUpcoming(s) || isEndedUnpublished(s) || s.forcedEnded)).length === 0 ? (
                  <div className="text-gray-500">No sessions in progress.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sessions
                      .filter((s) => !s.resultsPublished && (isActive(s) || isUpcoming(s) || isEndedUnpublished(s) || s.forcedEnded))
                      .map((s) => (
                        <div key={s.id} className="border rounded p-4">
                          <div className="font-semibold">{s.title || `Session #${s.id}`}</div>
                          {s.description && <div className="text-sm text-gray-600 mb-1">{s.description}</div>}
                          <div className="text-sm text-gray-600">
                            {new Date(s.startTime).toLocaleString()} — {new Date(s.endTime).toLocaleString()}
                          </div>

                          {isActive(s) && (
                            <div className="mt-3 border rounded p-2 bg-gray-50">
                              <div className="text-sm font-semibold mb-1">Live Votes</div>
                              {(live[s.id] || []).length === 0 ? (
                                <div className="text-sm text-gray-500">Loading…</div>
                              ) : (
                                <div className="space-y-1">
                                  {(live[s.id] || []).map((c) => (
                                    <div key={c.id} className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <img
                                          src={c.photoUrl ? api(c.photoUrl) : "/placeholder.png"}
                                          className="w-7 h-7 rounded object-cover"
                                          alt={c.name}
                                          onError={(e) => (e.currentTarget.src = "/placeholder.png")}
                                        />
                                        <span>{c.name}</span>
                                      </div>
                                      <span className="font-semibold">{c.votes}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="mt-3 flex items-center gap-2">
                            {isActive(s) && (
                              <button onClick={() => endEarly(s.id)} className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700">
                                End Early
                              </button>
                            )}
                            {isEndedUnpublished(s) && (
                              <button onClick={() => publish(s.id)} className="px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700">
                                Publish Results
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {tab === "past" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="bg-white rounded-2xl shadow p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">Previous Voting Sessions</h2>
              <button onClick={loadSessions} className="text-sm px-3 py-1 rounded border hover:bg-gray-50">Reload</button>
            </div>
            {loadingSessions ? (
              <div className="text-gray-500 animate-pulse">Loading…</div>
            ) : (
              <div className="space-y-2">
                {sessions.filter((s) => s.resultsPublished).length === 0 ? (
                  <div className="text-gray-500">No published sessions yet.</div>
                ) : (
                  sessions
                    .filter((s) => s.resultsPublished)
                    .map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSelected(null);
                          setSelectedCandidates([]);
                          setAudit(null);
                          loadPastDetails(s);
                        }}
                        className={`w-full text-left border rounded p-3 hover:bg-gray-50 transition ${selected?.id === s.id ? "bg-blue-50 border-blue-400" : ""}`}
                      >
                        <div className="font-semibold">{s.title || `Session #${s.id}`}</div>
                        <div className="text-sm text-gray-600">
                          {new Date(s.startTime).toLocaleString()} — {new Date(s.endTime).toLocaleString()}
                        </div>
                      </button>
                    ))
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow p-5">
            <h2 className="text-lg font-bold mb-3">Session Details</h2>
            {!selected ? (
              <div className="text-gray-500">Select a session to view details.</div>
            ) : (
              <>
                {selected?.title && (
                  <div className="mb-3">
                    <div className="font-semibold">{selected.title}</div>
                    {selected?.description && <div className="text-gray-600">{selected.description}</div>}
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
                        <img
                          src={c.photoUrl ? api(c.photoUrl) : "/placeholder.png"}
                          className="w-10 h-10 rounded object-cover"
                          alt={c.name}
                          onError={(e) => (e.currentTarget.src = "/placeholder.png")}
                        />
                        <div className="flex-1">
                          <div className="font-medium">{c.name}</div>
                          <div className="text-sm text-gray-600">{(c.state || "").trim()} {(c.state && c.lga) ? "•" : ""} {(c.lga || "").trim()}</div>
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
