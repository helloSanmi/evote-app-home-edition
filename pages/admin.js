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
import NG from "../public/ng-states-lgas.json";
import { getSocket } from "../lib/socket";
import ConfirmDialog from "../components/ConfirmDialog";

export default function AdminPage() {
  const router = useRouter();

  const token = useMemo(
    () => (typeof window !== "undefined" ? localStorage.getItem("token") : null),
    []
  );

  const states = useMemo(() => {
    if (Array.isArray(NG?.states)) return NG.states.map((s) => ({ label: s.state || s.name, lgas: s.lgas || [] }));
    if (Array.isArray(NG)) return NG.map((s) => ({ label: s.state || s.name, lgas: s.lgas || [] }));
    if (NG && typeof NG === "object") {
      return Object.entries(NG).map(([label, lgas]) => ({ label, lgas: lgas || [] }));
    }
    return [];
  }, []);

  const [unpublished, setUnpublished] = useState([]);
  const [unpubLoading, setUnpubLoading] = useState(false);

  const sessionsRef = useRef([]);
  const statsRef = useRef({ active: 0, upcoming: 0, awaiting: 0 });
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState("national");
  const [scopeState, setScopeState] = useState("");
  const [scopeLGA, setScopeLGA] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [minAge, setMinAge] = useState("18");

  const [cName, setCName] = useState("");
  const [cState, setCState] = useState("");
  const [cLga, setCLga] = useState("");
  const [cPhotoUrl, setCPhotoUrl] = useState("");

  const [selPast, setSelPast] = useState(null);
  const [pastCands, setPastCands] = useState([]);
  const [audit, setAudit] = useState(null);

  const [live, setLive] = useState([]);
  const liveTimer = useRef(null);
  const socketRef = useRef(null);

  const [pendingAction, setPendingAction] = useState(null); // { type, period }
  const [tab, setTab] = useState("overview");

  const tabs = useMemo(() => [
    { id: "overview", label: "Overview" },
    { id: "candidates", label: "Candidates" },
    { id: "sessions", label: "Sessions" },
    { id: "live", label: "Live" },
    { id: "archive", label: "Archive" },
    { id: "logs", label: "Request Logs" },
  ], []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isAdmin = localStorage.getItem("isAdmin") === "true";
    if (!localStorage.getItem("token") || !isAdmin) router.replace("/login");
  }, [router]);

  useEffect(() => {
    loadUnpublished();
    loadSessions();

    const socket = getSocket();
    socketRef.current = socket;
    const handleCreated = () => {
      loadSessions();
      loadUnpublished();
    };
    const handlePublished = () => {
      loadSessions();
      loadUnpublished();
    };
    const handleVote = () => refreshLive();

    socket?.on("periodCreated", handleCreated);
    socket?.on("resultsPublished", handlePublished);
    socket?.on("voteUpdate", handleVote);

    return () => {
      socket?.off("periodCreated", handleCreated);
      socket?.off("resultsPublished", handlePublished);
      socket?.off("voteUpdate", handleVote);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    clearInterval(liveTimer.current);
    liveTimer.current = setInterval(refreshLive, 6000);
    refreshLive();
    return () => clearInterval(liveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);

  const isActive = (period) => {
    const now = Date.now();
    return now >= new Date(period.startTime).getTime() && now < new Date(period.endTime).getTime() && !period.resultsPublished;
  };
  const isUpcoming = (period) => Date.now() < new Date(period.startTime).getTime() && !period.resultsPublished;
  const awaitingPublish = (period) => Date.now() >= new Date(period.endTime).getTime() && !period.resultsPublished;

  const stats = useMemo(() => ({
    active: sessions.filter(isActive).length,
    upcoming: sessions.filter(isUpcoming).length,
    awaiting: sessions.filter(awaitingPublish).length,
  }), [sessions]);

  const activeSessions = useMemo(() => sessions.filter(isActive), [sessions]);
  const awaitingSessions = useMemo(() => sessions.filter(awaitingPublish), [sessions]);
  const upcomingSessions = useMemo(() => sessions.filter(isUpcoming), [sessions]);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);


  useEffect(() => {
    if (!selPast) return;
    const match = sessions.find((period) => period.id === selPast.id);
    if (!match) {
      setSelPast(null);
      setPastCands([]);
      setAudit(null);
    } else {
      setSelPast(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);
  async function loadUnpublished() {
    setUnpubLoading(true);
    try {
      const data = await apiGet("/api/admin/unpublished");
      setUnpublished(Array.isArray(data) ? data : []);
    } catch (e) {
      setUnpublished([]);
      notifyError(e.message || "Failed to load unpublished candidates");
    } finally {
      setUnpubLoading(false);
    }
  }

  async function loadSessions() {
    setLoadingSessions(true);
    try {
      const data = await apiGet("/api/admin/periods");
      const list = Array.isArray(data) ? data : [];
      sessionsRef.current = list;
      setSessions(list);
    } catch (e) {
      setSessions([]);
      notifyError(e.message || "Failed to load sessions");
    } finally {
      setLoadingSessions(false);
    }
  }

  async function uploadCandidateImage(file) {
    const fd = new FormData();
    fd.append("file", file);
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/api/admin/upload-image`, {
      method: "POST",
      headers,
      body: fd,
      credentials: "include",
    });
    const json = await safeJson(res);
    if (!res.ok || !json?.success) throw new Error(json?.message || "Failed to upload image");
    return json.url;
  }

  async function handlePickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/image\/(png|jpe?g)/i.test(file.type)) {
      notifyError("Only PNG or JPEG images are allowed");
      return;
    }
    try {
      const url = await uploadCandidateImage(file);
      setCPhotoUrl(url);
      notifySuccess("Candidate photo uploaded");
    } catch (err) {
      notifyError(err.message);
    }
  }

  async function addCandidate(e) {
    e.preventDefault();
    if (!cName.trim() || !cState || !cLga) {
      notifyError("Fill in all candidate details");
      return;
    }
    try {
      const payload = {
        name: cName.trim(),
        state: cState,
        lga: cLga,
        photoUrl: cPhotoUrl || null,
      };
      const resp = await apiPost("/api/admin/candidate", payload);
      if (!resp?.success) throw new Error(resp?.message || "Unable to add candidate");
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
    if (!title.trim() || !start || !end) {
      notifyError("Please provide title, start, and end times");
      return;
    }
    if (unpublished.length === 0) {
      notifyError("Add at least one candidate before starting a session");
      return;
    }
    if (scope === "state" && !scopeState) {
      notifyError("Select a state for this election scope");
      return;
    }
    if (scope === "local" && (!scopeState || !scopeLGA)) {
      notifyError("Select both state and LGA for a local election");
      return;
    }
    try {
      const body = {
        title: title.trim(),
        description: description?.trim() || null,
        start,
        end,
        minAge: Math.max(Number(minAge || 18), 18),
        scope,
        scopeState: scope !== "national" ? scopeState : null,
        scopeLGA: scope === "local" ? scopeLGA : null,
      };
      const resp = await apiPost("/api/admin/voting-period", body);
      if (!resp?.success) throw new Error(resp?.message || "Failed to start voting period");
      setTitle("");
      setDescription("");
      setStart("");
      setEnd("");
      setMinAge("18");
      setScope("national");
      setScopeState("");
      setScopeLGA("");
      await Promise.all([loadUnpublished(), loadSessions()]);
      notifySuccess("Voting session started");
    } catch (err) {
      notifyError(err.message);
    }
  }

  async function endVotingEarly(period) {
    try {
      const resp = await apiPost("/api/admin/end-voting-early", period ? { periodId: period.id } : {});
      if (!resp?.success && !resp?.already) throw new Error(resp?.message || "Failed to end voting early");
      await Promise.all([loadSessions(), loadUnpublished()]);
      setCName("");
      setCState("");
      setCLga("");
      setCPhotoUrl("");
      if (resp?.already) {
        notifySuccess("Session already ended");
      } else {
        notifySuccess("Voting ended for the session");
      }
    } catch (err) {
      notifyError(err.message);
    }
  }

  async function publishResults(period) {
    try {
      const resp = await apiPost("/api/admin/publish-results", period ? { periodId: period.id } : {});
      if (!resp?.success && !resp?.already) throw new Error(resp?.message || "Failed to publish results");
      await Promise.all([loadSessions(), loadUnpublished()]);
      setCName("");
      setCState("");
      setCLga("");
      setCPhotoUrl("");
      if (resp?.already) {
        notifySuccess("Results were already published for this session");
      } else {
        notifySuccess("Results published");
      }
    } catch (err) {
      notifyError(err.message);
    }
  }

  async function deleteSession(id) {
    try {
      const resp = await apiDelete(`/api/admin/periods/delete?periodId=${id}`);
      if (!resp?.success) throw new Error(resp?.message || "Failed to delete session");
      setSelPast(null);
      await Promise.all([loadSessions(), loadUnpublished()]);
      setCName("");
      setCState("");
      setCLga("");
      setCPhotoUrl("");
      notifySuccess("Session deleted");
    } catch (err) {
      notifyError(err.message);
    }
  }

  async function refreshLive() {
    try {
      const activeSessions = sessions.filter(isActive);
      const scoreboard = [];
      for (const period of activeSessions) {
        const candidates = await apiGet(`/api/admin/candidates?periodId=${period.id}`);
        if (Array.isArray(candidates)) {
          scoreboard.push({ period, candidates });
        }
      }
      setLive(scoreboard);
    } catch (err) {
      setLive([]);
    }
  }

  async function viewPast(period) {
    setSelPast(period);
    setPastCands([]);
    setAudit(null);
    try {
      const [candidateRows, auditData] = await Promise.all([
        apiGet(`/api/admin/candidates?periodId=${period.id}`),
        apiGet(`/api/admin/audit?periodId=${period.id}`),
      ]);
      setPastCands(Array.isArray(candidateRows) ? candidateRows : []);
      setAudit(auditData || null);
    } catch (err) {
      notifyError("Failed to load session details");
    }
  }

  const confirmCopy = useMemo(() => {
    if (!pendingAction) return { title: "", message: "" };
    if (pendingAction.type === "publish") {
      return {
        title: "Publish results",
        message: `Publish and announce results for ${pendingAction.period.title || `Session #${pendingAction.period.id}`}? This makes the outcome visible to every voter.`,
        tone: "indigo",
      };
    }
    if (pendingAction.type === "end") {
      return {
        title: "End voting early",
        message: `Force-close voting for ${pendingAction.period.title || `Session #${pendingAction.period.id}`}. Voters will no longer be able to submit ballots after this action.`,
        tone: "danger",
      };
    }
    if (pendingAction.type === "delete") {
      return {
        title: "Delete session",
        message: `Permanently remove ${pendingAction.period.title || `Session #${pendingAction.period.id}`}, its votes, and detach candidates. This cannot be undone.`,
        tone: "danger",
      };
    }
    return { title: "Confirm", message: "" };
  }, [pendingAction]);

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    try {
      if (pendingAction.type === "publish") await publishResults(pendingAction.period);
      if (pendingAction.type === "end") await endVotingEarly(pendingAction.period);
      if (pendingAction.type === "delete") await deleteSession(pendingAction.period.id);
    } finally {
      setPendingAction(null);
    }
  };

  const candidateState = states.find((s) => s.label === cState);
  const candidateLgas = candidateState?.lgas || [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6">
      <header className="rounded-[2.5rem] border border-slate-200 bg-white px-6 py-10 shadow-[0_35px_110px_-65px_rgba(15,23,42,0.55)] backdrop-blur md:px-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Admin console</p>
            <h1 className="text-3xl font-semibold text-slate-900">Election control centre</h1>
            <p className="text-sm text-slate-500 md:max-w-xl">
              Create sessions, manage candidates, oversee live participation, and publish results in one streamlined workspace.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <StatPill label="Active" value={stats.active} tone="emerald" />
            <StatPill label="Upcoming" value={stats.upcoming} tone="sky" />
            <StatPill label="Awaiting publish" value={stats.awaiting} tone="amber" />
          </div>
        </div>
      </header>

      <nav className="-mb-1 flex flex-wrap gap-2 overflow-x-auto rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-sm backdrop-blur">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-full border px-4 py-2 text-base font-semibold transition ${
              tab === item.id
                ? "border-indigo-200 bg-indigo-50 text-indigo-700 shadow"
                : "border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur md:p-8">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Snapshot</h2>
              <p className="mt-1 text-sm text-slate-500">A quick look at what’s happening right now.</p>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                <li>Active sessions: <span className="font-semibold text-slate-900">{stats.active}</span></li>
                <li>Awaiting publish: <span className="font-semibold text-slate-900">{stats.awaiting}</span></li>
                <li>Upcoming sessions: <span className="font-semibold text-slate-900">{stats.upcoming}</span></li>
              </ul>
            </div>
            <div className="space-y-4">
              <OverviewList title="Live now" sessions={activeSessions} emptyText="No sessions currently accepting votes." badge="Active" />
              <OverviewList title="Awaiting publish" sessions={awaitingSessions} emptyText="Nothing waiting to be published." badge="Ready" />
              <OverviewList title="Starting soon" sessions={upcomingSessions} emptyText="No upcoming sessions scheduled." badge="Upcoming" />
            </div>
          </div>
        </section>
      )}

      {tab === "candidates" && (
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <form onSubmit={addCandidate} className="w-full space-y-4 md:max-w-xl">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Add candidate</h2>
              <p className="text-sm text-slate-500">Prepare contenders before attaching them to a voting session.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="form-label" htmlFor="candidate-name">Full name</label>
                <input
                  id="candidate-name"
                  className="form-control"
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  placeholder="Candidate name"
                />
              </div>
              <div>
                <label className="form-label" htmlFor="candidate-state">State</label>
                <select
                  id="candidate-state"
                  className="form-control"
                  value={cState}
                  onChange={(e) => {
                    setCState(e.target.value);
                    setCLga("");
                  }}
                >
                  <option value="">Select state…</option>
                  {states.map((state) => (
                    <option key={state.label} value={state.label}>
                      {state.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="candidate-lga">LGA</label>
                <select
                  id="candidate-lga"
                  className="form-control"
                  value={cLga}
                  onChange={(e) => setCLga(e.target.value)}
                  disabled={!cState}
                >
                  <option value="">{cState ? "Select LGA…" : "Pick a state first"}</option>
                  {candidateLgas.map((lga) => (
                    <option key={lga} value={lga}>
                      {lga}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="form-label" htmlFor="candidate-photo">Photo</label>
                <div className="flex gap-3">
                  <input
                    id="candidate-photo"
                    className="form-control"
                    placeholder="Photo URL (auto-filled after upload)"
                    value={cPhotoUrl}
                    onChange={(e) => setCPhotoUrl(e.target.value)}
                  />
                  <label className="btn-secondary cursor-pointer px-4">
                    Upload
                    <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handlePickImage} />
                  </label>
                </div>
              </div>
            </div>
            <button type="submit" className="btn-primary">Add candidate</button>
          </form>

          <div className="flex-1 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Unpublished candidates</h3>
              <button type="button" onClick={loadUnpublished} className="btn-secondary px-4 py-2 text-xs">Reload</button>
            </div>
            <div className="mt-4 space-y-3">
              {unpubLoading ? (
                <div className="text-sm text-slate-500 animate-pulse">Loading…</div>
              ) : unpublished.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                  Added candidates will appear here until they are assigned to a session.
                </div>
              ) : (
                unpublished.map((candidate) => (
                  <div key={candidate.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                    <img
                      src={absUrl(candidate.photoUrl || "/placeholder.png")}
                      alt={candidate.name}
                      className="h-12 w-12 rounded-full object-cover ring-1 ring-slate-200/70"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-900">{candidate.name}</div>
                      <div className="text-xs text-slate-500">{candidate.state} • {candidate.lga}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
      )}


      {tab === "sessions" && (
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2 md:max-w-sm">
            <h2 className="text-lg font-semibold text-slate-900">Start a voting session</h2>
            <p className="text-sm text-slate-500">Schedule start and end times, set eligibility, and launch when you are ready.</p>
          </div>
          <div className="w-full md:max-w-2xl">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="form-label" htmlFor="session-title">Title</label>
                <input id="session-title" className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Eg. Presidential Primaries" />
              </div>
              <div className="md:col-span-2">
                <label className="form-label" htmlFor="session-description">Description</label>
                <textarea id="session-description" className="form-control min-h-[96px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional summary" />
              </div>
              <div>
                <label className="form-label" htmlFor="session-start">Start time</label>
                <input id="session-start" type="datetime-local" className="form-control" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div>
                <label className="form-label" htmlFor="session-end">End time</label>
                <input id="session-end" type="datetime-local" className="form-control" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
              <div>
                <label className="form-label" htmlFor="session-age">Minimum age</label>
                <input id="session-age" type="number" min={18} className="form-control" value={minAge} onChange={(e) => setMinAge(e.target.value)} />
              </div>
              <div>
                <label className="form-label" htmlFor="session-scope">Scope</label>
                <select id="session-scope" className="form-control" value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value="national">National</option>
                  <option value="state">State</option>
                  <option value="local">Local</option>
                </select>
              </div>
              {scope !== "national" && (
                <div>
                  <label className="form-label" htmlFor="session-scope-state">Scope state</label>
                  <select id="session-scope-state" className="form-control" value={scopeState} onChange={(e) => setScopeState(e.target.value)}>
                    <option value="">Select state…</option>
                    {states.map((state) => (
                      <option key={state.label} value={state.label}>
                        {state.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {scope === "local" && (
                <div>
                  <label className="form-label" htmlFor="session-scope-lga">Scope LGA</label>
                  <select id="session-scope-lga" className="form-control" value={scopeLGA} onChange={(e) => setScopeLGA(e.target.value)}>
                    <option value="">Select LGA…</option>
                    {states
                      .find((state) => state.label === scopeState)?.lgas?.map((lga) => (
                        <option key={lga} value={lga}>
                          {lga}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
            <div className="mt-4">
              <button type="button" className="btn-primary" onClick={startVoting}>
                Launch session
              </button>
            </div>
          </div>
        </div>
      </section>
      )}


{tab === "sessions" && (
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur md:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">In-progress sessions</h2>
            <p className="text-sm text-slate-500">Monitor live elections and trigger administrative actions.</p>
          </div>
          <button type="button" onClick={loadSessions} className="btn-secondary px-4 py-2 text-xs">
            Refresh
          </button>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {loadingSessions ? (
            <div className="col-span-full text-sm text-slate-500 animate-pulse">Loading sessions…</div>
          ) : sessions.filter((period) => awaitingPublish(period) || isUpcoming(period)).length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
              No upcoming or unpublished sessions at the moment.
            </div>
          ) : (
            sessions
              .filter((period) => awaitingPublish(period) || isUpcoming(period))
              .map((period) => (
                <div key={period.id} className="flex h-full flex-col justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold text-slate-900">{period.title || `Session #${period.id}`}</h3>
                      <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase text-indigo-600">
                        {awaitingPublish(period) ? "Awaiting publish" : "Upcoming"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {new Date(period.startTime).toLocaleString()} — {new Date(period.endTime).toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-500">
                      Scope: <span className="font-medium uppercase text-slate-800">{period.scope}</span>
                      {period.scope !== "national" && period.scopeState ? ` • ${period.scopeState}` : ""}
                      {period.scope === "local" && period.scopeLGA ? ` • ${period.scopeLGA}` : ""}
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {awaitingPublish(period) && (
                      <button type="button" className="btn-primary" onClick={() => setPendingAction({ type: "publish", period })}>
                        Publish results
                      </button>
                    )}
                  </div>
                </div>
              ))
          )}
        </div>
      </section>
      )}

      {tab === "live" && (
        <LivePanel live={live} refresh={refreshLive} />
      )}

      {tab === "archive" && (
      <section className="grid gap-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur md:grid-cols-2 md:p-8">
        <div>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Previous sessions</h2>
              <p className="text-sm text-slate-500">Review ended elections and audit their results.</p>
            </div>
            <button type="button" onClick={loadSessions} className="btn-secondary px-3 py-2 text-xs">
              Reload
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {loadingSessions ? (
              <div className="text-sm text-slate-500 animate-pulse">Loading sessions…</div>
            ) : sessions.filter((period) => period.resultsPublished || (!isActive(period) && !isUpcoming(period) && !awaitingPublish(period))).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                Once results are published, sessions will appear here for reference.
              </div>
            ) : (
              sessions
                .filter((period) => period.resultsPublished || (!isActive(period) && !isUpcoming(period) && !awaitingPublish(period)))
                .map((period) => (
                  <button
                    key={period.id}
                    type="button"
                    onClick={() => viewPast(period)}
                    className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${selPast?.id === period.id ? "border-indigo-300 bg-indigo-50" : "border-slate-100 bg-white"}`}
                  >
                    <div className="text-sm font-semibold text-slate-900">{period.title || `Session #${period.id}`}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(period.startTime).toLocaleString()} — {new Date(period.endTime).toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-500">
                      Scope: {period.scope}
                      {period.scope !== "national" && period.scopeState ? ` • ${period.scopeState}` : ""}
                      {period.scope === "local" && period.scopeLGA ? ` • ${period.scopeLGA}` : ""}
                    </div>
                  </button>
                ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Session details</h2>
          {!selPast ? (
            <p className="mt-3 text-sm text-slate-500">Select a session to view candidate totals and audit insights.</p>
          ) : (
            <div className="mt-3 space-y-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">{selPast.title || `Session #${selPast.id}`}</div>
                <div className="text-xs text-slate-500">
                  {new Date(selPast.startTime).toLocaleString()} — {new Date(selPast.endTime).toLocaleString()}
                </div>
                <div className="text-xs text-slate-500">
                  Scope: {selPast.scope}
                  {selPast.scope !== "national" && selPast.scopeState ? ` • ${selPast.scopeState}` : ""}
                  {selPast.scope === "local" && selPast.scopeLGA ? ` • ${selPast.scopeLGA}` : ""}
                </div>
              </div>

              {audit && (
                <div className="rounded-2xl border border-slate-100 bg-white p-4 text-xs text-slate-500">
                  <div className="text-sm font-semibold text-slate-900">Audit summary</div>
                  <p>Total candidates: {audit.candidateCount}</p>
                  <p>Total vote rows: {audit.voteRows}</p>
                  <p>Total candidate votes: {audit.candidateVotes}</p>
                  <p>
                    Consistent: <span className={audit.consistent ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>{audit.consistent ? "Yes" : "Mismatch"}</span>
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {pastCands.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">No candidate data for this session yet.</div>
                ) : (
                  pastCands.map((candidate) => (
                    <div key={candidate.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={absUrl(candidate.photoUrl || "/placeholder.png")}
                          alt={candidate.name}
                          className="h-10 w-10 rounded-full object-cover ring-1 ring-slate-200/70"
                        />
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{candidate.name}</div>
                          <div className="text-xs text-slate-500">{candidate.state} • {candidate.lga}</div>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-slate-900">{candidate.votes} votes</span>
                    </div>
                  ))
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {!selPast.resultsPublished && (
                  <button type="button" className="btn-primary" onClick={() => setPendingAction({ type: "publish", period: selPast })}>
                    Publish results
                  </button>
                )}
                <button type="button" className="btn-secondary" onClick={() => setPendingAction({ type: "delete", period: selPast })}>
                  Delete session
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
      )}


      {tab === "logs" && <LogsPanel />}

      <ConfirmDialog
        open={!!pendingAction}
        title={confirmCopy.title}
        message={confirmCopy.message}
        confirmLabel={pendingAction?.type === "delete" ? "Delete" : pendingAction?.type === "end" ? "End session" : "Publish"}
        cancelLabel="Cancel"
        tone={confirmCopy.tone === "danger" ? "danger" : "indigo"}
        onConfirm={handleConfirmAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}

function OverviewList({ title, sessions, emptyText, badge }) {
  const items = (sessions || []).slice(0, 3);
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">{badge}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500">{emptyText}</p>
      ) : (
        <ul className="space-y-2 text-xs text-slate-600">
          {items.map((session) => (
            <li key={session.id} className="flex flex-col">
              <span className="font-semibold text-slate-900">{session.title || `Session #${session.id}`}</span>
              <span>{new Date(session.startTime).toLocaleString()} — {new Date(session.endTime).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


function StatPill({ label, value, tone }) {
  const toneMap = {
    emerald: "bg-emerald-50 text-emerald-600",
    sky: "bg-sky-50 text-sky-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className={`rounded-2xl px-4 py-3 shadow-sm ${toneMap[tone] || "bg-slate-50 text-slate-600"}`}>
      <div className="text-xs uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function LivePanel({ live, refresh }) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Live participation</h2>
          <p className="text-sm text-slate-500">Active sessions refresh every few seconds. Manually refresh for an instant snapshot.</p>
        </div>
        <button type="button" onClick={refresh} className="btn-secondary px-4 py-2 text-xs">
          Refresh now
        </button>
      </div>
      <div className="mt-4 space-y-4">
        {live.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
            No votes coming in right now. Active sessions will appear here automatically.
          </div>
        ) : (
          live.map(({ period, candidates }) => (
            <div key={period.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{period.title || `Session #${period.id}`}</div>
                  <div className="text-xs text-slate-500">Ends {new Date(period.endTime).toLocaleString()}</div>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase text-emerald-600">Live</span>
              </div>
              <div className="mt-3 space-y-2">
                {candidates.map((candidate) => (
                  <div key={candidate.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3">
                    <span className="text-sm font-medium text-slate-900">{candidate.name}</span>
                    <span className="text-sm font-semibold text-slate-900">{candidate.votes} votes</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function LogsPanel() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      const data = await apiGet("/api/admin/logs");
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
    }
  }

  async function exportCsv() {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_BASE}/api/admin/logs/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text?.slice(0, 200) || "Export failed");
      const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "request_logs.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      notifySuccess("Logs exported");
    } catch (err) {
      notifyError(err.message || "Failed to export logs");
    }
  }

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Request logs</h2>
          <p className="text-sm text-slate-500">Inspect the 500 most recent API hits to monitor usage.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="btn-secondary px-4 py-2 text-xs">Reload</button>
          <button type="button" onClick={exportCsv} className="btn-primary px-4 py-2 text-xs">Export CSV</button>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100">
        {!rows ? (
          <div className="p-6 text-sm text-slate-500 animate-pulse">Loading logs…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No requests captured yet.</div>
        ) : (
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Time</th>
                <th className="px-3 py-2 text-left font-medium">Method</th>
                <th className="px-3 py-2 text-left font-medium">Path</th>
                <th className="px-3 py-2 text-left font-medium">User</th>
                <th className="px-3 py-2 text-left font-medium">IP</th>
                <th className="px-3 py-2 text-left font-medium">Country</th>
                <th className="px-3 py-2 text-left font-medium">City</th>
                <th className="px-3 py-2 text-left font-medium">Agent</th>
                <th className="px-3 py-2 text-left font-medium">Referrer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="bg-white">
                  <td className="px-3 py-2">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{row.method}</td>
                  <td className="px-3 py-2">{row.path}</td>
                  <td className="px-3 py-2">{row.userId ?? "-"}</td>
                  <td className="px-3 py-2">{row.ip}</td>
                  <td className="px-3 py-2">{row.country || "-"}</td>
                  <td className="px-3 py-2">{row.city || "-"}</td>
                  <td className="px-3 py-2 max-w-[220px] truncate" title={row.userAgent}>
                    {row.userAgent}
                  </td>
                  <td className="px-3 py-2 max-w-[220px] truncate" title={row.referer}>
                    {row.referer}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
