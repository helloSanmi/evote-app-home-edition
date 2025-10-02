// frontend/pages/admin.js
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  apiGet,
  apiPost,
  apiDelete,
  safeJson,
  absUrl,
  API_BASE,
} from "../lib/apiBase";
import { notifyError, notifySuccess } from "../components/Toast";
import NG from "../public/ng-states-lgas.json"; // static JSON (works like Register)
import { getSocket } from "../lib/socket";

export default function Admin() {
  const router = useRouter();

  // Bearer (legacy support)
  const token = useMemo(
    () => (typeof window !== "undefined" ? localStorage.getItem("token") : null),
    []
  );

  // ---------- NGA states/LGAs ----------
  // Accept {states:[{state/name, lgas[]}]} OR array OR object { "Abia": [...] }
  const base = useMemo(() => {
    if (Array.isArray(NG?.states)) return NG.states;
    if (Array.isArray(NG)) return NG;
    if (NG && typeof NG === "object") {
      return Object.entries(NG).map(([state, lgas]) => ({ state, lgas }));
    }
    return [];
  }, []);
  const stateLabel = (s) => (s?.state || s?.name || "");
  const allStates = base.map(stateLabel);

  // Tabs
  const [tab, setTab] = useState("overview");

  // Candidates (unpublished)
  const [cName, setCName] = useState("");
  const [cState, setCState] = useState("");
  const [cLga, setCLga] = useState("");
  const [cPhotoUrl, setCPhotoUrl] = useState("");
  const candLgas =
    base.find((x) => stateLabel(x) === cState)?.lgas || [];
  const [unpublished, setUnpublished] = useState([]);
  const [unpubLoading, setUnpubLoading] = useState(false);

  // Start session
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState("national"); // 'national' | 'state' | 'local'
  const [scopeState, setScopeState] = useState("");
  const [scopeLGA, setScopeLGA] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [minAge, setMinAge] = useState("18");

  // Sessions
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Current view
  const [selPast, setSelPast] = useState(null);
  const [pastCands, setPastCands] = useState([]);
  const [audit, setAudit] = useState(null);

  // Live (pull every 5s)
  const [live, setLive] = useState([]); // [{period, candidates:[]}]
  const liveTimer = useRef(null);

  // socket
  const socketRef = useRef(null);

  // ---- guard: must be admin ----
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isAdmin = localStorage.getItem("isAdmin") === "true";
    if (!localStorage.getItem("token") || !isAdmin) router.replace("/login");
  }, [router]);

  // ---- initial load + socket ----
  useEffect(() => {
    loadUnpublished();
    loadSessions();

    const s = getSocket();
    socketRef.current = s;

    const onPublished = () => loadSessions();
    const onVote = () => refreshLive();

    s?.on("resultsPublished", onPublished);
    s?.on("voteUpdate", onVote);

    return () => {
      s?.off("resultsPublished", onPublished);
      s?.off("voteUpdate", onVote);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- refresh live every 5s when sessions change ----
  useEffect(() => {
    clearInterval(liveTimer.current);
    liveTimer.current = setInterval(refreshLive, 5000);
    refreshLive();
    return () => clearInterval(liveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);

  const isActive = (p) => {
    const now = Date.now();
    return (
      now >= new Date(p.startTime).getTime() &&
      now < new Date(p.endTime).getTime() &&
      !p.resultsPublished
    );
  };
  const isUpcoming = (p) =>
    Date.now() < new Date(p.startTime).getTime() && !p.resultsPublished;
  const isEndedUnpublished = (p) =>
    Date.now() >= new Date(p.endTime).getTime() && !p.resultsPublished;

  // ---------- data loaders ----------
  async function loadUnpublished() {
    setUnpubLoading(true);
    try {
      const data = await apiGet("/api/admin/unpublished");
      setUnpublished(Array.isArray(data) ? data : []);
    } catch (e) {
      setUnpublished([]);
      notifyError(e.message || "Failed to load unpublished");
    } finally {
      setUnpubLoading(false);
    }
  }

  async function loadSessions() {
    setLoadingSessions(true);
    try {
      const data = await apiGet("/api/admin/periods");
      setSessions(Array.isArray(data) ? data : []);
    } catch (e) {
      setSessions([]);
      notifyError(e.message || "Failed to load sessions");
    } finally {
      setLoadingSessions(false);
    }
  }

  // ---------- upload photo (FormData; includes credentials; keeps legacy Bearer) ----------
  async function uploadImage(file) {
    const fd = new FormData();
    fd.append("file", file);

    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/api/admin/upload-image`, {
      method: "POST",
      body: fd,
      headers,
      credentials: "include",
    });
    const d = await safeJson(res);
    if (!res.ok || !d?.success) throw new Error(d?.message || "Upload failed");
    return d.url; // /uploads/candidates/xxx.jpg
  }

  async function onPickImage(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!["image/png", "image/jpeg"].includes(f.type)) {
      notifyError("Only PNG/JPEG allowed");
      return;
    }
    try {
      const url = await uploadImage(f);
      setCPhotoUrl(url);
      notifySuccess("Photo uploaded");
    } catch (err) {
      notifyError(err.message);
    }
  }

  async function addCandidate(e) {
    e.preventDefault();
    if (!cName.trim() || !cState || !cLga) {
      notifyError("All candidate fields are required");
      return;
    }
    try {
      const d = await apiPost("/api/admin/candidate", {
        name: cName.trim(),
        state: cState,
        lga: cLga,
        photoUrl: cPhotoUrl || null,
      });
      if (!d?.success) throw new Error(d?.message || "Error adding candidate");
      setCName("");
      setCState("");
      setCLga("");
      setCPhotoUrl("");
      await loadUnpublished();
      notifySuccess("Candidate added");
    } catch (err) {
      notifyError(err.message);
    }
  }

  async function startVoting() {
    if (!title || !start || !end) return notifyError("Enter title, start, end");
    if (unpublished.length === 0)
      return notifyError("Add at least one candidate");
    if (scope === "state" && !scopeState)
      return notifyError("Select state for a state election");
    if (scope === "local" && (!scopeState || !scopeLGA))
      return notifyError("Select state & LGA for a local election");

    const body = {
      title,
      description,
      start,
      end,
      minAge: Math.max(Number(minAge || 18), 18),
      scope, // 'national' | 'state' | 'local'
      scopeState: scope !== "national" ? scopeState : null,
      scopeLGA: scope === "local" ? scopeLGA : null,
    };
    try {
      const d = await apiPost("/api/admin/voting-period", body);
      if (!d?.success) throw new Error(d?.message || "Failed to start session");
      // reset
      setTitle("");
      setDescription("");
      setStart("");
      setEnd("");
      setMinAge("18");
      setScope("national");
      setScopeState("");
      setScopeLGA("");
      await loadUnpublished();
      await loadSessions();
      notifySuccess("Voting session started");
    } catch (e) {
      notifyError(e.message);
    }
  }

  async function endEarly() {
    try {
      const d = await apiPost("/api/admin/end-voting-early", {});
      if (!d?.success) throw new Error(d?.message || "Failed to end");
      await loadSessions();
      notifySuccess("Voting ended");
    } catch (e) {
      notifyError(e.message);
    }
  }

  async function publishResults() {
    try {
      const d = await apiPost("/api/admin/publish-results", {});
      if (!d?.success) throw new Error(d?.message || "Failed to publish");
      await loadSessions();
      notifySuccess("Results published");
    } catch (e) {
      notifyError(e.message);
    }
  }

  async function viewPast(p) {
    setSelPast(p);
    setPastCands([]);
    setAudit(null);
    try {
      const [cands, aud] = await Promise.all([
        apiGet(`/api/admin/candidates?periodId=${p.id}`),
        apiGet(`/api/admin/audit?periodId=${p.id}`),
      ]);
      setPastCands(Array.isArray(cands) ? cands : []);
      setAudit(aud || null);
    } catch {
      notifyError("Failed to load session details");
    }
  }

  async function deleteSession(id) {
    try {
      const d = await apiDelete(`/api/admin/periods/delete?periodId=${id}`);
      if (!d?.success) throw new Error(d?.message || "Delete failed");
      setSelPast(null);
      await loadSessions();
      notifySuccess("Session deleted");
    } catch (e) {
      notifyError(e.message);
    }
  }

  async function refreshLive() {
    try {
      const actives = sessions.filter(isActive);
      const out = [];
      for (const p of actives) {
        const arr = await apiGet(`/api/admin/candidates?periodId=${p.id}`);
        if (Array.isArray(arr)) out.push({ period: p, candidates: arr });
      }
      setLive(out);
    } catch {
      setLive([]);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2 sticky top-0 bg-white z-10">
        {["overview", "candidates", "start", "live", "past", "logs"].map(
          (key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-t transition ${
                tab === key
                  ? "bg-white border border-b-transparent shadow-sm"
                  : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              {key === "overview"
                ? "Dashboard"
                : key === "candidates"
                ? "Candidates"
                : key === "start"
                ? "Start Session"
                : key === "live"
                ? "Live"
                : key === "past"
                ? "Previous Sessions"
                : "Logs"}
            </button>
          )
        )}
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="Active Sessions">
            <BigNumber>{sessions.filter(isActive).length}</BigNumber>
          </Card>
          <Card title="Upcoming Sessions">
            <BigNumber>{sessions.filter(isUpcoming).length}</BigNumber>
          </Card>
          <Card title="Ended (Unpublished)">
            <BigNumber>{sessions.filter(isEndedUnpublished).length}</BigNumber>
          </Card>

          <div className="md:col-span-3 bg-white rounded-2xl shadow p-5">
            <h3 className="font-bold mb-2">In Progress</h3>
            {loadingSessions ? (
              <div className="text-gray-500 animate-pulse">Loading…</div>
            ) : (
              <>
                {sessions.filter(
                  (p) =>
                    !p.resultsPublished &&
                    (isActive(p) ||
                      isUpcoming(p) ||
                      isEndedUnpublished(p) ||
                      p.forcedEnded)
                ).length === 0 ? (
                  <div className="text-gray-500">No sessions in progress.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sessions
                      .filter(
                        (p) =>
                          !p.resultsPublished &&
                          (isActive(p) ||
                            isUpcoming(p) ||
                            isEndedUnpublished(p) ||
                            p.forcedEnded)
                      )
                      .map((p) => (
                        <div
                          key={p.id}
                          className="border rounded-xl p-4 bg-gray-50"
                        >
                          <div className="font-semibold">
                            {p.title || `Session #${p.id}`}
                          </div>
                          <div className="text-sm text-gray-600">
                            {new Date(p.startTime).toLocaleString()} —{" "}
                            {new Date(p.endTime).toLocaleString()}
                          </div>
                          <div className="text-xs mt-1">
                            Scope:{" "}
                            <span className="font-medium uppercase">
                              {p.scope}
                            </span>
                            {p.scope !== "national" && p.scopeState
                              ? ` • ${p.scopeState}`
                              : ""}
                            {p.scope === "local" && p.scopeLGA
                              ? ` • ${p.scopeLGA}`
                              : ""}
                          </div>

                          <div className="mt-3 flex gap-2">
                            {isActive(p) && (
                              <button
                                onClick={endEarly}
                                className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                              >
                                End Early
                              </button>
                            )}
                            {isEndedUnpublished(p) && (
                              <button
                                onClick={publishResults}
                                className="px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700"
                              >
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

      {/* CANDIDATES */}
      {tab === "candidates" && (
        <div className="mt-4 space-y-6">
          <div className="bg-white rounded-2xl shadow p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">Add Candidate</h2>
              <button
                onClick={loadUnpublished}
                className="text-sm px-3 py-1 rounded border hover:bg-gray-50"
              >
                Reload
              </button>
            </div>
            <form
              onSubmit={addCandidate}
              className="grid grid-cols-1 md:grid-cols-4 gap-3"
            >
              <div className="md:col-span-2">
                <label className="text-xs text-gray-600">Name</label>
                <input
                  className="border p-2 rounded w-full"
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  placeholder="Candidate name"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">State</label>
                <select
                  className="border p-2 rounded w-full"
                  value={cState}
                  onChange={(e) => {
                    setCState(e.target.value);
                    setCLga("");
                  }}
                >
                  <option value="">Select state…</option>
                  {allStates.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">LGA</label>
                <select
                  className="border p-2 rounded w-full"
                  value={cLga}
                  onChange={(e) => setCLga(e.target.value)}
                  disabled={!cState}
                >
                  <option value="">
                    {cState ? "Select LGA…" : "Pick state first"}
                  </option>
                  {candLgas.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-3">
                <label className="text-xs text-gray-600">Photo</label>
                <div className="flex gap-2">
                  <input
                    className="border p-2 rounded w-full"
                    placeholder="Photo URL (auto-filled after upload)"
                    value={cPhotoUrl}
                    onChange={(e) => setCPhotoUrl(e.target.value)}
                  />
                  <label className="px-3 py-2 rounded border cursor-pointer hover:bg-gray-50">
                    Upload
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={onPickImage}
                    />
                  </label>
                </div>
              </div>
              <div className="md:col-span-1">
                <label className="text-xs text-gray-600 opacity-0">
                  submit
                </label>
                <button className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                  Add Candidate
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white rounded-2xl shadow p-5">
            <h2 className="text-lg font-bold mb-3">Unpublished Candidates</h2>
            {unpubLoading ? (
              <div className="text-gray-500 animate-pulse">Loading…</div>
            ) : unpublished.length === 0 ? (
              <div className="text-gray-500">No unpublished candidates</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {unpublished.map((c) => (
                  <div
                    key={c.id}
                    className="border rounded p-3 flex items-center justify-between bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={absUrl(c.photoUrl || "/placeholder.png")}
                        className="w-12 h-12 rounded object-cover"
                        alt={c.name}
                      />
                      <div>
                        <div className="font-semibold">{c.name}</div>
                        <div className="text-sm text-gray-600">
                          {c.state} • {c.lga}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setConfirm({ type: "deleteCandidate", id: c.id })
                      }
                      className="text-white bg-red-600 px-3 py-1 rounded hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* START SESSION */}
      {tab === "start" && (
        <div className="mt-4 bg-white rounded-2xl shadow p-5">
          <h2 className="text-lg font-bold mb-3">Start New Voting Session</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600">Title</label>
              <input
                className="border p-2 rounded w-full"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Presidential Election 2025"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600">Description</label>
              <textarea
                className="border p-2 rounded w-full"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional summary…"
              />
            </div>

            <div>
              <label className="text-xs text-gray-600">Scope</label>
              <select
                className="border p-2 rounded w-full"
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value);
                  setScopeState("");
                  setScopeLGA("");
                }}
              >
                <option value="national">National</option>
                <option value="state">State</option>
                <option value="local">Local Government</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">Minimum Age</label>
              <input
                type="number"
                min={18}
                className="border p-2 rounded w-full"
                value={minAge}
                onChange={(e) => setMinAge(e.target.value)}
              />
            </div>

            {(scope === "state" || scope === "local") && (
              <div>
                <label className="text-xs text-gray-600">State</label>
                <select
                  className="border p-2 rounded w-full"
                  value={scopeState}
                  onChange={(e) => {
                    setScopeState(e.target.value);
                    setScopeLGA("");
                  }}
                >
                  <option value="">Select state…</option>
                  {allStates.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {scope === "local" && (
              <div>
                <label className="text-xs text-gray-600">LGA</label>
                <select
                  className="border p-2 rounded w-full"
                  value={scopeLGA}
                  onChange={(e) => setScopeLGA(e.target.value)}
                  disabled={!scopeState}
                >
                  <option value="">
                    {scopeState ? "Select LGA…" : "Pick state first"}
                  </option>
                  {(
                    base.find((x) => stateLabel(x) === scopeState)?.lgas || []
                  ).map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs text-gray-600">Start</label>
              <input
                type="datetime-local"
                className="border p-2 rounded w-full"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">End</label>
              <input
                type="datetime-local"
                className="border p-2 rounded w-full"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4">
            <button
              onClick={startVoting}
              className={`px-4 py-2 rounded text-white ${
                unpublished.length === 0 || !title || !start || !end
                  ? "bg-gray-400"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
              disabled={
                unpublished.length === 0 || !title || !start || !end
              }
            >
              Start Voting
            </button>
          </div>
        </div>
      )}

      {/* LIVE */}
      {tab === "live" && (
        <div className="mt-4 space-y-4">
          {live.length === 0 ? (
            <div className="bg-white rounded-2xl shadow p-5 text-gray-500">
              No active sessions.
            </div>
          ) : (
            live.map((group) => (
              <div key={group.period.id} className="bg-white rounded-2xl shadow p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-bold">{group.period.title}</div>
                    <div className="text-xs text-gray-600">
                      Scope:{" "}
                      <span className="font-medium uppercase">
                        {group.period.scope}
                      </span>
                      {group.period.scope !== "national" &&
                      group.period.scopeState
                        ? ` • ${group.period.scopeState}`
                        : ""}
                      {group.period.scope === "local" && group.period.scopeLGA
                        ? ` • ${group.period.scopeLGA}`
                        : ""}
                    </div>
                  </div>
                  <button
                    onClick={endEarly}
                    className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                  >
                    End Early
                  </button>
                </div>
                {group.candidates.length === 0 ? (
                  <div className="text-gray-500">No candidates.</div>
                ) : (
                  <div className="space-y-2">
                    {group.candidates.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between border p-2 rounded"
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={absUrl(c.photoUrl || "/placeholder.png")}
                            className="w-8 h-8 rounded object-cover"
                            alt={c.name}
                          />
                          <span className="font-medium">{c.name}</span>
                          <span className="text-xs text-gray-600">
                            ({c.state} • {c.lga})
                          </span>
                        </div>
                        <span className="font-semibold">{c.votes}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* PAST */}
      {tab === "past" && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl shadow p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">Previous Sessions</h2>
              <button
                onClick={loadSessions}
                className="text-sm px-3 py-1 rounded border hover:bg-gray-50"
              >
                Reload
              </button>
            </div>
            {loadingSessions ? (
              <div className="text-gray-500 animate-pulse">Loading…</div>
            ) : (
              <div className="space-y-2">
                {sessions.filter(
                  (s) =>
                    s.resultsPublished ||
                    (!isActive(s) && !isUpcoming(s) && !isEndedUnpublished(s))
                ).length === 0 ? (
                  <div className="text-gray-500">No previous sessions.</div>
                ) : (
                  sessions
                    .filter(
                      (s) =>
                        s.resultsPublished ||
                        (!isActive(s) &&
                          !isUpcoming(s) &&
                          !isEndedUnpublished(s))
                    )
                    .map((s) => (
                      <button
                        key={s.id}
                        onClick={() => viewPast(s)}
                        className={`w-full text-left border rounded p-3 hover:bg-gray-50 transition ${
                          selPast?.id === s.id
                            ? "bg-blue-50 border-blue-400"
                            : ""
                        }`}
                      >
                        <div className="font-semibold">
                          {s.title || `Session #${s.id}`}
                        </div>
                        <div className="text-sm text-gray-600">
                          {new Date(s.startTime).toLocaleString()} —{" "}
                          {new Date(s.endTime).toLocaleString()}
                        </div>
                        <div className="text-xs">
                          Scope:{" "}
                          <span className="font-medium uppercase">
                            {s.scope}
                          </span>
                          {s.scope !== "national" && s.scopeState
                            ? ` • ${s.scopeState}`
                            : ""}
                          {s.scope === "local" && s.scopeLGA
                            ? ` • ${s.scopeLGA}`
                            : ""}
                        </div>
                      </button>
                    ))
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow p-5">
            <h2 className="text-lg font-bold mb-3">Session Details</h2>
            {!selPast ? (
              <div className="text-gray-500">Select a session.</div>
            ) : (
              <>
                <div className="mb-2">
                  <div className="font-semibold">
                    {selPast.title || `Session #${selPast.id}`}
                  </div>
                  <div className="text-sm text-gray-600">
                    {new Date(selPast.startTime).toLocaleString()} —{" "}
                    {new Date(selPast.endTime).toLocaleString()}
                  </div>
                  <div className="text-xs">
                    Scope:{" "}
                    <span className="font-medium uppercase">
                      {selPast.scope}
                    </span>
                    {selPast.scope !== "national" && selPast.scopeState
                      ? ` • ${selPast.scopeState}`
                      : ""}
                    {selPast.scope === "local" && selPast.scopeLGA
                      ? ` • ${selPast.scopeLGA}`
                      : ""}
                  </div>
                </div>

                {audit && (
                  <div className="mb-3 rounded border p-2 text-sm">
                    <div className="font-semibold mb-1">Audit</div>
                    <div>
                      Total candidate rows:{" "}
                      {audit.candidateCount ?? audit.candidateVotes}
                    </div>
                    <div>Total vote records: {audit.voteRows}</div>
                    <div>
                      Consistent:{" "}
                      <span
                        className={`font-semibold ${
                          audit.consistent ? "text-green-700" : "text-red-700"
                        }`}
                      >
                        {audit.consistent ? "Yes" : "No"}
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {pastCands.length === 0 ? (
                    <div className="text-gray-500">No candidates</div>
                  ) : (
                    pastCands.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-3 border rounded p-2"
                      >
                        <img
                          src={absUrl(c.photoUrl || "/placeholder.png")}
                          className="w-10 h-10 rounded object-cover"
                          alt={c.name}
                        />
                        <div className="flex-1">
                          <div className="font-medium">{c.name}</div>
                          <div className="text-sm text-gray-600">
                            {c.state} • {c.lga}
                          </div>
                        </div>
                        <div className="font-semibold">{c.votes} votes</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-4 flex gap-2">
                  {!selPast.resultsPublished && (
                    <button
                      onClick={publishResults}
                      className="px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700"
                    >
                      Publish Results
                    </button>
                  )}
                  <button
                    onClick={() => deleteSession(selPast.id)}
                    className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                  >
                    Delete Session
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* LOGS */}
      {tab === "logs" && <LogsPane />}
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="bg-white rounded-2xl shadow p-5">
      <div className="text-sm text-gray-600">{title}</div>
      <div className="text-2xl mt-1">{children}</div>
    </div>
  );
}
function BigNumber({ children }) {
  return <span className="text-3xl font-extrabold">{children}</span>;
}

function LogsPane() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    load();
  }, []); // eslint-disable-line

  async function load() {
    try {
      const j = await apiGet("/api/admin/logs");
      if (!Array.isArray(j)) throw new Error("Failed to load logs");
      setRows(j);
    } catch (e) {
      setRows([]);
    }
  }

  async function exportCsv() {
    try {
      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_BASE}/api/admin/logs/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text?.slice(0, 200) || "Export failed");
      const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "request_logs.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notifySuccess("CSV exported");
    } catch (e) {
      notifyError(e.message);
    }
  }

  return (
    <div className="mt-4 bg-white rounded-2xl shadow p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold">Request Logs</h2>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="px-3 py-1 rounded border hover:bg-gray-50"
          >
            Reload
          </button>
          <button
            onClick={exportCsv}
            className="px-3 py-1 rounded border hover:bg-gray-50"
          >
            Export CSV
          </button>
        </div>
      </div>
      {!rows ? (
        <div className="text-gray-500 animate-pulse">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-gray-500">No logs yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600">
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Method</th>
                <th className="py-2 pr-3">Path</th>
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3">IP</th>
                <th className="py-2 pr-3">Country</th>
                <th className="py-2 pr-3">City</th>
                <th className="py-2 pr-3">Agent</th>
                <th className="py-2 pr-3">Referrer</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-2 pr-3">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3">{r.method}</td>
                  <td className="py-2 pr-3">{r.path}</td>
                  <td className="py-2 pr-3">{r.userId ?? "-"}</td>
                  <td className="py-2 pr-3">{r.ip}</td>
                  <td className="py-2 pr-3">{r.country || "-"}</td>
                  <td className="py-2 pr-3">{r.city || "-"}</td>
                  <td
                    className="py-2 pr-3 truncate max-w-[240px]"
                    title={r.userAgent}
                  >
                    {r.userAgent}
                  </td>
                  <td
                    className="py-2 pr-3 truncate max-w-[240px]"
                    title={r.referer}
                  >
                    {r.referer}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
