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

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

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
  const sessionsPollRef = useRef(null);

  const [pendingAction, setPendingAction] = useState(null); // { type, period }
  const [tab, setTab] = useState("overview");
  const [viewerRole, setViewerRole] = useState("user");
  const [resettingUser, setResettingUser] = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [updatingRoleId, setUpdatingRoleId] = useState(null);
  const sessionSteps = useMemo(() => [
    { id: 1, label: "Scope" },
    { id: 2, label: "Details" },
    { id: 3, label: "Schedule" },
  ], []);
  const [sessionStep, setSessionStep] = useState(1);
  const [newUserForm, setNewUserForm] = useState({
    fullName: "",
    username: "",
    email: "",
    phone: "",
    state: "",
    residenceLGA: "",
    password: "",
    role: "user",
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const scopeOptions = useMemo(() => [
    { value: "national", label: "National", detail: "All verified voters can participate." },
    { value: "state", label: "State", detail: "Limited to a single state." },
    { value: "local", label: "Local", detail: "Target a specific LGA." },
  ], []);

  const tabs = useMemo(() => [
    { id: "overview", label: "Overview" },
    { id: "sessions", label: "Sessions" },
    { id: "live", label: "Live" },
    { id: "archive", label: "Archive" },
    { id: "users", label: "Users" },
    { id: "logs", label: "Request Logs" },
  ], []);

  const roleSummaries = useMemo(() => [
    {
      id: "super-admin",
      title: "Super Admin",
      accent: "bg-purple-50 text-purple-600",
      summary: "Full platform control including admin management.",
      capabilities: [
        "Everything admins can do",
        "Promote or manage privileged accounts",
        "Reset any user's password"
      ],
    },
    {
      id: "admin",
      title: "Admin",
      accent: "bg-indigo-50 text-indigo-600",
      summary: "Runs elections day-to-day and supports voters.",
      capabilities: [
        "Create and publish voting sessions",
        "Manage candidates and eligibility",
        "Reset voter passwords when required"
      ],
    },
    {
      id: "user",
      title: "User",
      accent: "bg-slate-100 text-slate-600",
      summary: "Registers, updates their profile, and casts ballots.",
      capabilities: [
        "Vote in eligible sessions",
        "View published results",
        "Maintain their own profile"
      ],
    },
  ], []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("token");
    const role = (localStorage.getItem("role") || "user").toLowerCase();
    const privileged = role === "admin" || role === "super-admin";
    setViewerRole(role);
    if (!token || !privileged) router.replace("/login");
  }, [router]);

  useEffect(() => {
    loadUnpublished();
    loadSessions();
    loadUsers();

    const socket = getSocket();
    socketRef.current = socket;
    const handleCreated = () => {
      loadSessions({ silent: true, suppressErrors: true });
      loadUnpublished({ silent: true, suppressErrors: true });
    };
    const handlePublished = () => {
      loadSessions({ silent: true, suppressErrors: true });
      loadUnpublished({ silent: true, suppressErrors: true });
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
    if (typeof window === "undefined") return undefined;
    const syncRole = () => setViewerRole((localStorage.getItem("role") || "user").toLowerCase());
    syncRole();
    window.addEventListener("storage", syncRole);
    return () => window.removeEventListener("storage", syncRole);
  }, []);

  useEffect(() => {
    if (tab !== "sessions") {
      setSessionStep(1);
    }
  }, [tab]);

  useEffect(() => {
    if (sessionStep === 3) {
      loadUnpublished({ silent: true, suppressErrors: true });
    }
  }, [sessionStep]);

  useEffect(() => {
    if (sessionStep !== 3) return;
    if (scope === "state") {
      setCState(scopeState || "");
      setCLga("");
    }
    if (scope === "local") {
      setCState(scopeState || "");
      setCLga(scopeLGA || "");
    }
    if (scope === "national") {
      setCState((prev) => prev || "");
    }
  }, [sessionStep, scope, scopeState, scopeLGA]);

  useEffect(() => {
    clearInterval(liveTimer.current);
    liveTimer.current = setInterval(refreshLive, 6000);
    refreshLive();
    return () => clearInterval(liveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);

  useEffect(() => {
    if (sessionsPollRef.current) clearInterval(sessionsPollRef.current);
    sessionsPollRef.current = setInterval(() => {
      loadSessions({ silent: true, suppressErrors: true });
      loadUnpublished({ silent: true, suppressErrors: true });
    }, 8000);
    return () => {
      if (sessionsPollRef.current) clearInterval(sessionsPollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  async function loadUnpublished(options = {}) {
    const { silent = false, suppressErrors = false } = options;
    if (!silent) setUnpubLoading(true);
    try {
      const data = await apiGet("/api/admin/unpublished");
      setUnpublished(Array.isArray(data) ? data : []);
    } catch (e) {
      setUnpublished([]);
      if (!suppressErrors) {
        notifyError(e.message || "Failed to load unpublished candidates");
      }
    } finally {
      if (!silent) setUnpubLoading(false);
    }
  }

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const data = await apiGet("/api/admin/users");
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      setUsers([]);
      notifyError(e.message || "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadSessions(options = {}) {
    const { silent = false, suppressErrors = false } = options;
    if (!silent) setLoadingSessions(true);
    try {
      const data = await apiGet("/api/admin/periods");
      const list = Array.isArray(data) ? data : [];
      sessionsRef.current = list;
      setSessions(list);
    } catch (e) {
      setSessions([]);
      if (!suppressErrors) {
        notifyError(e.message || "Failed to load sessions");
      }
    } finally {
      if (!silent) setLoadingSessions(false);
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
    const trimmedName = cName.trim();
    const candidateState = scope === "national" ? cState : scopeState;
    const candidateLga = scope === "local" ? scopeLGA : cLga;
    if (!trimmedName) {
      notifyError("Provide the candidate's full name");
      return;
    }
    if (!candidateState) {
      notifyError("Select the candidate's state");
      return;
    }
    if (scope !== "state" && scope !== "local" && !cLga) {
      notifyError("Select the candidate's LGA");
      return;
    }
    if (scope === "state" && !cLga) {
      notifyError("Choose the candidate's LGA for this state election");
      return;
    }
    if (scope === "local" && !candidateLga) {
      notifyError("LGA is required for a local election");
      return;
    }
    try {
      const payload = {
        name: trimmedName,
        state: candidateState,
        lga: candidateLga,
        photoUrl: cPhotoUrl || null,
      };
      const resp = await apiPost("/api/admin/candidate", payload);
      if (!resp?.success) throw new Error(resp?.message || "Unable to add candidate");
      setCName("");
      if (scope === "national") {
        setCState("");
        setCLga("");
      } else if (scope === "state") {
        setCLga("");
      }
      setCPhotoUrl("");
      await loadUnpublished();
      notifySuccess("Candidate added");
    } catch (err) {
      notifyError(err.message);
    }
  }

  async function removeCandidate(candidate) {
    if (!candidate?.id) return;
    try {
      await apiDelete(`/api/admin/candidate/${candidate.id}`);
      await loadUnpublished({ silent: true, suppressErrors: true });
      notifySuccess(`${candidate.name || "Candidate"} removed`);
    } catch (err) {
      notifyError(err.message || "Failed to remove candidate");
    }
  }

  async function startVoting() {
    if (!title.trim() || !start || !end) {
      notifyError("Please provide title, start, and end times");
      return;
    }
    if (!hasEligibleCandidates) {
      notifyError("Add at least one candidate that matches this scope");
      return;
    }
    if (mismatchedCandidates.length) {
      notifyError("Remove or update candidates outside the selected scope");
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
      setSessionStep(1);
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

  async function disableUser(user) {
    try {
      await apiPost(`/api/admin/users/${user.id}/disable`, {});
      await loadUsers();
      notifySuccess(`${user.fullName || user.username} disabled`);
    } catch (err) {
      notifyError(err.message || "Failed to disable user");
    }
  }

  async function enableUser(user) {
    try {
      await apiPost(`/api/admin/users/${user.id}/enable`, {});
      await loadUsers();
      notifySuccess(`${user.fullName || user.username} re-enabled`);
    } catch (err) {
      notifyError(err.message || "Failed to enable user");
    }
  }

  async function deleteUser(user) {
    try {
      await apiDelete(`/api/admin/users/${user.id}`);
      await loadUsers();
      notifySuccess(`${user.fullName || user.username} deleted`);
    } catch (err) {
      notifyError(err.message || "Failed to delete user");
    }
  }

  async function submitPasswordReset() {
    if (!resettingUser) return;
    if (!resetPassword || resetPassword.trim().length < 8) {
      notifyError("Password must be at least 8 characters");
      return;
    }
    setResetLoading(true);
    try {
      await apiPost(`/api/admin/users/${resettingUser.id}/reset-password`, { password: resetPassword.trim() });
      notifySuccess(`Password reset for ${resettingUser.fullName || resettingUser.username}`);
      await loadUsers({ silent: true, suppressErrors: true });
      setResettingUser(null);
      setResetPassword("");
    } catch (err) {
      notifyError(err.message || "Failed to reset password");
    } finally {
      setResetLoading(false);
    }
  }

  async function updateUserRole(user, role) {
    if (!user || !role) return;
    setUpdatingRoleId(user.id);
    try {
      await apiPost(`/api/admin/users/${user.id}/role`, { role });
      await loadUsers({ silent: true, suppressErrors: true });
      notifySuccess(`${user.fullName || user.username} is now ${role}`);
    } catch (err) {
      notifyError(err.message || "Failed to update role");
    } finally {
      setUpdatingRoleId(null);
    }
  }

  const updateNewUserField = (field, value) => {
    setNewUserForm((prev) => ({ ...prev, [field]: value }));
  };

  async function createNewUser(e) {
    e?.preventDefault?.();
    const { fullName, username, email, password, phone, state: userState, residenceLGA, role } = newUserForm;
    if (!fullName.trim() || !username.trim() || !email.trim() || !password.trim()) {
      notifyError("Full name, username, email, and password are required");
      return;
    }
    if (password.trim().length < 8) {
      notifyError("Password must be at least 8 characters");
      return;
    }
    setCreatingUser(true);
    try {
      await apiPost("/api/admin/users", {
        fullName: fullName.trim(),
        username: username.trim(),
        email: email.trim(),
        password: password.trim(),
        phone: phone?.trim() || null,
        state: userState?.trim() || null,
        residenceLGA: residenceLGA?.trim() || null,
        role,
      });
      notifySuccess("New user created");
      setNewUserForm({ fullName: "", username: "", email: "", phone: "", state: "", residenceLGA: "", password: "", role: "user" });
      await loadUsers();
    } catch (err) {
      notifyError(err.message || "Failed to create user");
    } finally {
      setCreatingUser(false);
    }
  }

  async function exportUsersCsv() {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_BASE}/api/admin/users/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text?.slice(0, 200) || "Export failed");
      const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "users.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      notifySuccess("Users exported");
    } catch (err) {
      notifyError(err.message || "Failed to export users");
    }
  }

  const handleLaunchSession = () => {
    if (!validateScopeStep() || !validateDetailsStep() || !validateScheduleStep()) return;
    if (!hasEligibleCandidates) {
      notifyError("Add at least one candidate that matches this scope");
      return;
    }
    if (mismatchedCandidates.length) {
      notifyError("Remove or update candidates that are outside the current scope");
      return;
    }
    startVoting();
  };

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
    if (pendingAction.type === "user-disable") {
      return {
        title: "Disable user",
        message: `Temporarily disable ${pendingAction.user.fullName || pendingAction.user.username}?`,
        tone: "indigo",
      };
    }
    if (pendingAction.type === "user-enable") {
      return {
        title: "Enable user",
        message: `Re-enable ${pendingAction.user.fullName || pendingAction.user.username}?`,
        tone: "indigo",
      };
    }
    if (pendingAction.type === "user-delete") {
      return {
        title: "Delete user",
        message: `This will permanently delete ${pendingAction.user.fullName || pendingAction.user.username} and free the user ID. Continue?`,
        tone: "danger",
      };
    }
    return { title: "Confirm", message: "" };
  }, [pendingAction]);

  const confirmButtonLabel = useMemo(() => {
    if (!pendingAction) return "Confirm";
    switch (pendingAction.type) {
      case "delete":
        return "Delete";
      case "end":
        return "End session";
      case "publish":
        return "Publish";
      case "user-disable":
        return "Disable";
      case "user-enable":
        return "Enable";
      case "user-delete":
        return "Delete";
      default:
        return "Confirm";
    }
  }, [pendingAction]);

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    try {
      if (pendingAction.type === "publish") await publishResults(pendingAction.period);
      if (pendingAction.type === "end") await endVotingEarly(pendingAction.period);
      if (pendingAction.type === "delete") await deleteSession(pendingAction.period.id);
      if (pendingAction.type === "user-disable") await disableUser(pendingAction.user);
      if (pendingAction.type === "user-enable") await enableUser(pendingAction.user);
      if (pendingAction.type === "user-delete") await deleteUser(pendingAction.user);
    } finally {
      setPendingAction(null);
    }
  };

  const candidateState = states.find((s) => s.label === cState);
  const candidateLgas = candidateState?.lgas || [];
  const availableLgas = scope === "national"
    ? candidateLgas
    : (states.find((state) => state.label === scopeState)?.lgas || []);
  const formatDateValue = (value, withTime = false) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return withTime ? date.toLocaleString() : date.toLocaleDateString();
  };
  const isUserDisabled = (user) => String(user?.eligibilityStatus ?? "").trim().toLowerCase() === "disabled";
  const statusBadgeTone = (status) => {
    const value = String(status || "").trim().toLowerCase();
    if (value === "disabled") return "bg-rose-50 text-rose-600";
    if (value === "active") return "bg-emerald-50 text-emerald-600";
    return "bg-amber-50 text-amber-600";
  };
  const roleBadgeTone = (role) => {
    const value = String(role || "").trim().toLowerCase();
    if (value === "super-admin") return "bg-purple-50 text-purple-600";
    if (value === "admin") return "bg-indigo-50 text-indigo-600";
    return "bg-slate-100 text-slate-600";
  };
  const normalizedScopeState = (scopeState || "").trim().toLowerCase();
  const normalizedScopeLGA = (scopeLGA || "").trim().toLowerCase();
  const candidatePartition = useMemo(() => {
    if (!Array.isArray(unpublished) || unpublished.length === 0) {
      return { valid: [], mismatched: [] };
    }
    if (scope === "national") {
      return { valid: unpublished, mismatched: [] };
    }
    const normalize = (value) => (value || "").trim().toLowerCase();
    const result = { valid: [], mismatched: [] };
    unpublished.forEach((cand) => {
      const candState = normalize(cand.state);
      const candLga = normalize(cand.lga);
      const matchesState = candState && candState === normalizedScopeState;
      const matchesLga = scope !== "local" ? true : !!candLga && candLga === normalizedScopeLGA;
      if (matchesState && matchesLga) {
        result.valid.push(cand);
      } else {
        result.mismatched.push(cand);
      }
    });
    return result;
  }, [unpublished, scope, normalizedScopeState, normalizedScopeLGA]);
  const validCandidates = candidatePartition.valid;
  const mismatchedCandidates = candidatePartition.mismatched;
  const hasEligibleCandidates = validCandidates.length > 0;
  const validateScopeStep = () => {
    if (scope === "state" && !scopeState) {
      notifyError("Select a state for this scope");
      return false;
    }
    if (scope === "local" && (!scopeState || !scopeLGA)) {
      notifyError("Select both state and LGA for a local scope");
      return false;
    }
    if (Number(minAge) < 18) {
      notifyError("Minimum age cannot be below 18");
      setMinAge("18");
      return false;
    }
    return true;
  };
  const validateDetailsStep = () => {
    if (!title.trim()) {
      notifyError("Add a session title");
      return false;
    }
    return true;
  };
  const validateScheduleStep = () => {
    if (!start || !end) {
      notifyError("Provide both start and end time");
      return false;
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      notifyError("Enter valid start and end times");
      return false;
    }
    if (startDate >= endDate) {
      notifyError("End time must be after start time");
      return false;
    }
    return true;
  };
  const goToNextSessionStep = () => {
    if (sessionStep === 1 && !validateScopeStep()) return;
    if (sessionStep === 2 && !validateDetailsStep()) return;
    setSessionStep((step) => Math.min(sessionSteps.length, step + 1));
  };
  const goToPreviousSessionStep = () => {
    setSessionStep((step) => Math.max(1, step - 1));
  };


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

      <nav className="sticky top-20 z-30 mb-6 flex flex-wrap gap-2 overflow-x-auto rounded-full border border-slate-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur-md">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
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
        <div className="space-y-5">
          <CollapsibleSection
            title="Snapshot"
            description="A quick look at what’s happening right now."
            defaultOpen
          >
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <ul className="space-y-3 text-sm text-slate-600">
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
          </CollapsibleSection>

          <CollapsibleSection
            title="Access control"
            description="Know who can do what across the workspace."
            defaultOpen={false}
          >
            <div className="grid gap-4 md:grid-cols-3">
              {roleSummaries.map((item) => {
                const isMe = viewerRole === item.id;
                return (
                  <div
                    key={item.id}
                    className={`flex h-full flex-col rounded-2xl border p-4 shadow-sm transition ${
                      isMe ? "border-indigo-200 bg-indigo-50/60" : "border-slate-200 bg-white"
                    }`}
                  >
                    <span className={`inline-flex w-max items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${item.accent}`}>
                      {item.title}
                    </span>
                    <p className="mt-3 text-sm text-slate-600">{item.summary}</p>
                    <ul className="mt-3 space-y-2 text-xs text-slate-500">
                      {item.capabilities.map((cap) => (
                        <li key={cap} className="flex items-start gap-2">
                          <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-indigo-300" />
                          <span>{cap}</span>
                        </li>
                      ))}
                    </ul>
                    {isMe && (
                      <span className="mt-4 inline-flex w-max rounded-full bg-indigo-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                        Your role
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
        </div>
      )}

      {tab === "sessions" && (
        <div className="space-y-5">
          <CollapsibleSection
            title="Launch a voting session"
            description="Follow the guided steps to configure scope, content, and scheduling."
            defaultOpen
          >
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                {sessionSteps.map((step, index) => {
                  const isActive = sessionStep === step.id;
                  const isComplete = sessionStep > step.id;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => {
                        if (step.id < sessionStep) setSessionStep(step.id);
                      }}
                      disabled={step.id > sessionStep}
                      className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                        isActive ? "border-indigo-300 bg-indigo-50 text-indigo-700" : isComplete ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-slate-200 bg-white text-slate-600"
                      } ${step.id > sessionStep ? "opacity-60" : ""}`}
                    >
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        isComplete ? "bg-emerald-500 text-white" : isActive ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"
                      }`}>{index + 1}</span>
                      <span>{step.label}</span>
                    </button>
                  );
                })}
              </div>

              {sessionStep === 1 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Who should see this ballot?</h3>
                    <p className="text-sm text-slate-500">Choose the right scope before you set any other details.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {scopeOptions.map((option) => {
                      const active = scope === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setScope(option.value);
                            if (option.value === "national") {
                              setScopeState("");
                              setScopeLGA("");
                            }
                          }}
                          className={`flex h-full flex-col rounded-2xl border p-4 text-left transition ${
                            active ? "border-indigo-300 bg-indigo-50 shadow" : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50"
                          }`}
                        >
                          <span className="text-sm font-semibold text-slate-900">{option.label}</span>
                          <span className="mt-1 text-xs text-slate-500">{option.detail}</span>
                        </button>
                      );
                    })}
                  </div>
                  {scope !== "national" && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="form-label" htmlFor="session-scope-state">Select state</label>
                        <select
                          id="session-scope-state"
                          className="form-control"
                          value={scopeState}
                          onChange={(e) => {
                            setScopeState(e.target.value);
                            setScopeLGA("");
                          }}
                        >
                          <option value="">Choose state…</option>
                          {states.map((state) => (
                            <option key={state.label} value={state.label}>
                              {state.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {scope === "local" && (
                        <div>
                          <label className="form-label" htmlFor="session-scope-lga">Select LGA</label>
                          <select
                            id="session-scope-lga"
                            className="form-control"
                            value={scopeLGA}
                            onChange={(e) => setScopeLGA(e.target.value)}
                          >
                            <option value="">Choose LGA…</option>
                            {states.find((state) => state.label === scopeState)?.lgas?.map((lga) => (
                              <option key={lga} value={lga}>
                                {lga}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="max-w-xs">
                    <label className="form-label" htmlFor="session-age">Minimum age</label>
                    <input id="session-age" type="number" min={18} className="form-control" value={minAge} onChange={(e) => setMinAge(e.target.value)} />
                  </div>
                  <div className="flex justify-end">
                    <button type="button" className="btn-primary" onClick={goToNextSessionStep}>
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {sessionStep === 2 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Share the story</h3>
                    <p className="text-sm text-slate-500">Give voters context with a clear title and optional description.</p>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="form-label" htmlFor="session-title">Title</label>
                      <input id="session-title" className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Eg. Mayoral Primaries" />
                    </div>
                    <div>
                      <label className="form-label" htmlFor="session-description">Description</label>
                      <textarea
                        id="session-description"
                        className="form-control min-h-[100px]"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Optional agenda, eligibility notes, or reminders"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <button type="button" className="btn-secondary" onClick={goToPreviousSessionStep}>
                      Back
                    </button>
                    <button type="button" className="btn-primary" onClick={goToNextSessionStep}>
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {sessionStep === 3 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Schedule & review</h3>
                    <p className="text-sm text-slate-500">Choose when voting opens and closes, then confirm details.</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="form-label" htmlFor="session-start">Start time</label>
                      <input id="session-start" type="datetime-local" className="form-control" value={start} onChange={(e) => setStart(e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label" htmlFor="session-end">End time</label>
                      <input id="session-end" type="datetime-local" className="form-control" value={end} onChange={(e) => setEnd(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h4 className="text-sm font-semibold text-slate-900">Summary</h4>
                      <dl className="mt-3 space-y-2 text-xs text-slate-500">
                        <div className="flex justify-between gap-4">
                          <dt>Scope</dt>
                          <dd className="font-medium text-slate-900 uppercase">{scope}</dd>
                        </div>
                        {scope !== "national" && (
                          <div className="flex justify-between gap-4">
                            <dt>State</dt>
                            <dd className="font-medium text-slate-900">{scopeState || "—"}</dd>
                          </div>
                        )}
                        {scope === "local" && (
                          <div className="flex justify-between gap-4">
                            <dt>LGA</dt>
                            <dd className="font-medium text-slate-900">{scopeLGA || "—"}</dd>
                          </div>
                        )}
                        <div className="flex justify-between gap-4">
                          <dt>Minimum age</dt>
                          <dd className="font-medium text-slate-900">{minAge}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt>Starts</dt>
                          <dd className="font-medium text-slate-900">{formatDateValue(start, true)}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt>Ends</dt>
                          <dd className="font-medium text-slate-900">{formatDateValue(end, true)}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt>Candidates ready</dt>
                          <dd className={`font-medium ${hasEligibleCandidates ? "text-emerald-600" : "text-rose-600"}`}>
                            {hasEligibleCandidates ? `${validCandidates.length}` : "0"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h4 className="text-sm font-semibold text-slate-900">Stage candidates</h4>
                      <form onSubmit={addCandidate} className="mt-3 space-y-3">
                        <div>
                          <label className="form-label" htmlFor="candidate-name">Full name</label>
                          <input
                            id="candidate-name"
                            className="form-control"
                            value={cName}
                            onChange={(e) => setCName(e.target.value)}
                            placeholder="Candidate name"
                          />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="form-label" htmlFor="candidate-state">State</label>
                            <select
                              id="candidate-state"
                              className="form-control"
                              value={scope === "national" ? cState : scopeState}
                              onChange={(e) => setCState(e.target.value)}
                              disabled={scope !== "national"}
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
                          {scope === "local" ? (
                            <input id="candidate-lga" className="form-control" value={scopeLGA || ""} disabled />
                          ) : (
                            <select
                              id="candidate-lga"
                              className="form-control"
                              value={scope === "local" ? scopeLGA : cLga}
                              onChange={(e) => setCLga(e.target.value)}
                              disabled={scope !== "national" && scope !== "state"}
                            >
                              <option value="">{scope === "national" ? (cState ? "Select LGA…" : "Pick a state first") : "Select LGA…"}</option>
                              {availableLgas.map((lga) => (
                                <option key={lga} value={lga}>
                                  {lga}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        </div>
                        <div>
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
                        <div className="flex justify-end">
                          <button type="submit" className="btn-primary">Add candidate</button>
                        </div>
                      </form>

                      <div className="mt-4 space-y-3">
                        {unpubLoading ? (
                          <div className="text-sm text-slate-500 animate-pulse">Loading staged candidates…</div>
                        ) : validCandidates.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                            Add candidates that match this scope to launch the session.
                          </div>
                        ) : (
                          validCandidates.map((candidate) => (
                            <div key={candidate.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                              <div className="flex items-center gap-3">
                                <img
                                  src={absUrl(candidate.photoUrl || "/placeholder.png")}
                                  alt={candidate.name}
                                  className="h-10 w-10 rounded-full object-cover ring-1 ring-slate-200/70"
                                />
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">{candidate.name}</div>
                                  <div className="text-xs text-slate-500">{candidate.state || "—"}{candidate.lga ? ` • ${candidate.lga}` : ""}</div>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                                onClick={() => removeCandidate(candidate)}
                              >
                                Remove
                              </button>
                            </div>
                          ))
                        )}
                        {mismatchedCandidates.length > 0 && (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-700">
                            <div className="mb-2 text-sm font-semibold text-amber-800">Outside current scope</div>
                            <p className="mb-3">Update the scope or remove these candidates before launching.</p>
                            <div className="space-y-2">
                              {mismatchedCandidates.map((candidate) => (
                                <div key={candidate.id} className="flex items-center justify-between rounded-xl border border-amber-200/70 bg-white/80 p-3">
                                  <div>
                                    <div className="text-sm font-semibold text-slate-900">{candidate.name}</div>
                                    <div className="text-xs text-slate-500">{candidate.state || "—"}{candidate.lga ? ` • ${candidate.lga}` : ""}</div>
                                  </div>
                                  <button
                                    type="button"
                                    className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                                    onClick={() => removeCandidate(candidate)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-secondary" onClick={goToPreviousSessionStep}>
                      Back
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleLaunchSession}
                      disabled={!hasEligibleCandidates}
                    >
                      {!hasEligibleCandidates ? "Add scope-ready candidates" : "Launch session"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Upcoming & awaiting"
            description="Monitor sessions launching soon or ready for final actions."
            action={
              <button type="button" onClick={loadSessions} className="btn-secondary px-3 py-1 text-xs">
                Refresh
              </button>
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
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
          </CollapsibleSection>
        </div>
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


      {tab === "users" && (
        <div className="space-y-5">
          <CollapsibleSection
            title="Registered users"
            description={`Review sign-ups, manage eligibility, or remove accounts. Signed in as ${viewerRole === "super-admin" ? "Super Admin" : viewerRole === "admin" ? "Admin" : "User"}.`}
            action={
              <div className="flex gap-2">
                <button type="button" onClick={loadUsers} className="btn-secondary px-4 py-2 text-xs">
                  Refresh
                </button>
                <button type="button" onClick={exportUsersCsv} className="btn-primary px-4 py-2 text-xs">
                  Export CSV
                </button>
              </div>
            }
            defaultOpen
          >
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              {usersLoading ? (
                <div className="p-6 text-sm text-slate-500 animate-pulse">Loading users…</div>
              ) : users.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">No registered users yet.</div>
              ) : (
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3 text-left">Name</th>
                      <th className="px-3 py-3 text-left">Contact</th>
                      <th className="px-3 py-3 text-left">Location</th>
                      <th className="px-3 py-3 text-left">Birth date</th>
                      <th className="px-3 py-3 text-left">Role</th>
                      <th className="px-3 py-3 text-left">Status</th>
                      <th className="px-3 py-3 text-left">Registered</th>
                      <th className="px-3 py-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {users.map((user) => {
                      const targetRole = String(user.role || "user").toLowerCase();
                      const rawStatus = String(user?.eligibilityStatus ?? "").trim();
                      const statusKey = rawStatus ? rawStatus.toLowerCase() : "pending";
                      const statusLabel = rawStatus
                        ? `${rawStatus.charAt(0).toUpperCase()}${rawStatus.slice(1).toLowerCase()}`
                        : "Pending";
                      const disabled = statusKey === "disabled";
                      const roleLabel = (() => {
                        if (targetRole === "super-admin") return "Super Admin";
                        if (targetRole === "admin") return "Admin";
                        return "User";
                      })();
                      const canReset = ["admin", "super-admin"].includes(viewerRole);
                      const canModifyTarget = targetRole !== "super-admin" || viewerRole === "super-admin";
                      const roleBusy = updatingRoleId === user.id;
                      return (
                        <tr key={user.id} className="align-top">
                          <td className="px-3 py-4">
                            <div className="text-sm font-semibold text-slate-900">{user.fullName || user.username || "—"}</div>
                            <div className="text-xs text-slate-500">ID #{user.id}{user.username ? ` • ${user.username}` : ""}</div>
                          </td>
                          <td className="px-3 py-4 text-xs text-slate-600">
                            <div className="font-medium text-slate-700">{user.email || "—"}</div>
                            {user.phone && <div className="text-slate-500">{user.phone}</div>}
                          </td>
                          <td className="px-3 py-4 text-xs text-slate-600">
                            <div>{user.state || "—"}</div>
                            <div className="text-slate-500">{user.residenceLGA || "—"}</div>
                            {user.nationality && <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">{user.nationality}</div>}
                          </td>
                          <td className="px-3 py-4 text-xs text-slate-600">{formatDateValue(user.dateOfBirth)}</td>
                          <td className="px-3 py-4">
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${roleBadgeTone(targetRole)}`}>
                              {roleLabel}
                            </span>
                          </td>
                          <td className="px-3 py-4">
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeTone(statusKey)}`}>
                              {statusLabel}
                            </span>
                          </td>
                          <td className="px-3 py-4 text-xs text-slate-600">{formatDateValue(user.createdAt, true)}</td>
                          <td className="px-3 py-4">
                            <div className="flex flex-wrap gap-2">
                              {viewerRole === "super-admin" && (
                                <div className="flex flex-wrap gap-2 rounded-full bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">
                                  <span>Role:</span>
                                  <button
                                    type="button"
                                    disabled={!canModifyTarget || roleBusy || targetRole === "admin"}
                                    onClick={() => updateUserRole(user, "admin")}
                                    className={`rounded-full px-3 py-1 transition ${
                                      targetRole === "admin"
                                        ? "bg-indigo-600 text-white shadow"
                                        : "border border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                                    }`}
                                  >
                                    Admin
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!canModifyTarget || roleBusy || targetRole === "user"}
                                    onClick={() => updateUserRole(user, "user")}
                                    className={`rounded-full px-3 py-1 transition ${
                                      targetRole === "user"
                                        ? "bg-slate-600 text-white shadow"
                                        : "border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                                    }`}
                                  >
                                    User
                                  </button>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => setPendingAction({ type: disabled ? "user-enable" : "user-disable", user })}
                                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                  disabled
                                    ? "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                                    : "border-amber-200 text-amber-600 hover:bg-amber-50"
                                } ${!canModifyTarget ? "opacity-50" : ""}`}
                                disabled={!canModifyTarget || roleBusy}
                              >
                                {disabled ? "Enable" : "Disable"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingAction({ type: "user-delete", user })}
                                className="inline-flex items-center rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                                disabled={!canModifyTarget || roleBusy}
                              >
                                Delete
                              </button>
                              {canReset && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!canModifyTarget) return;
                                    setResettingUser(user);
                                    setResetPassword("");
                                  }}
                                  disabled={!canModifyTarget || roleBusy}
                                  className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
                                >
                                  Reset password
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </CollapsibleSection>

          {viewerRole === "super-admin" && (
            <CollapsibleSection
              title="Create a user"
              description="Super admins can onboard staff or voters instantly and assign roles."
              defaultOpen={false}
            >
              <form className="space-y-4" onSubmit={createNewUser}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="form-label" htmlFor="new-fullname">Full name</label>
                    <input
                      id="new-fullname"
                      className="form-control"
                      value={newUserForm.fullName}
                      onChange={(e) => updateNewUserField("fullName", e.target.value)}
                      placeholder="Jane Doe"
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="new-username">Username</label>
                    <input
                      id="new-username"
                      className="form-control"
                      value={newUserForm.username}
                      onChange={(e) => updateNewUserField("username", e.target.value)}
                      placeholder="janedoe"
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="new-email">Email</label>
                    <input
                      id="new-email"
                      type="email"
                      className="form-control"
                      value={newUserForm.email}
                      onChange={(e) => updateNewUserField("email", e.target.value)}
                      placeholder="jane@mail.com"
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="new-phone">Phone (optional)</label>
                    <input
                      id="new-phone"
                      className="form-control"
                      value={newUserForm.phone}
                      onChange={(e) => updateNewUserField("phone", e.target.value)}
                      placeholder="0803..."
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="new-state">State (optional)</label>
                    <input
                      id="new-state"
                      className="form-control"
                      value={newUserForm.state}
                      onChange={(e) => updateNewUserField("state", e.target.value)}
                      placeholder="Lagos"
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="new-lga">Residence LGA (optional)</label>
                    <input
                      id="new-lga"
                      className="form-control"
                      value={newUserForm.residenceLGA}
                      onChange={(e) => updateNewUserField("residenceLGA", e.target.value)}
                      placeholder="Ikeja"
                    />
                  </div>
                </div>
                <div>
                  <label className="form-label" htmlFor="new-password">Temporary password</label>
                  <input
                    id="new-password"
                    type="password"
                    className="form-control"
                    value={newUserForm.password}
                    onChange={(e) => updateNewUserField("password", e.target.value)}
                    placeholder="Minimum 8 characters"
                  />
                </div>
                <div>
                  <span className="form-label">Role</span>
                  <div className="mt-2 flex gap-2">
                    {[
                      { value: "user", label: "User" },
                      { value: "admin", label: "Admin" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateNewUserField("role", option.value)}
                        className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                          newUserForm.role === option.value
                            ? "bg-indigo-600 text-white shadow"
                            : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="btn-primary" disabled={creatingUser}>
                    {creatingUser ? "Creating…" : "Create user"}
                  </button>
                </div>
              </form>
            </CollapsibleSection>
          )}
        </div>
      )}

      {tab === "logs" && <LogsPanel />}

      <ConfirmDialog
        open={!!pendingAction}
        title={confirmCopy.title}
        message={confirmCopy.message}
        confirmLabel={confirmButtonLabel}
        cancelLabel="Cancel"
        tone={confirmCopy.tone === "danger" ? "danger" : "indigo"}
        onConfirm={handleConfirmAction}
        onCancel={() => setPendingAction(null)}
      />
      <ResetPasswordDialog
        open={!!resettingUser}
        user={resettingUser}
        password={resetPassword}
        loading={resetLoading}
        onPasswordChange={setResetPassword}
        onClose={() => {
          if (resetLoading) return;
          setResettingUser(null);
          setResetPassword("");
        }}
        onSubmit={submitPasswordReset}
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

function ResetPasswordDialog({ open, user, password, loading, onPasswordChange, onClose, onSubmit }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/40 bg-white/95 p-6 shadow-xl">
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">Reset password</h3>
          <p className="text-sm text-slate-500">{user ? `Set a new password for ${user.fullName || user.username}.` : "Provide a replacement password."}</p>
          <input
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="New password"
            className="form-control"
            minLength={8}
            autoFocus
          />
          <p className="text-xs text-slate-400">Minimum 8 characters. Share securely with the user after saving.</p>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary px-5" disabled={loading}>Cancel</button>
          <button type="button" onClick={onSubmit} className="btn-primary px-5" disabled={loading}>
            {loading ? "Saving…" : "Save password"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CollapsibleSection({ title, description, action, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-[0_20px_70px_-50px_rgba(15,23,42,0.45)] backdrop-blur-sm md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            {open ? "Hide" : "Show"}
          </button>
        </div>
      </header>
      {open && <div className="mt-5 space-y-4">{children}</div>}
    </section>
  );
}

function LogsPanel() {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await apiGet("/api/admin/logs");
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
    } finally {
      setLoading(false);
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

  const formatRelativeTime = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const diff = Date.now() - date.getTime();
    const ranges = [
      { limit: 60000, text: `${Math.max(1, Math.round(diff / 1000))}s ago` },
      { limit: 3600000, text: `${Math.max(1, Math.round(diff / 60000))}m ago` },
      { limit: 86400000, text: `${Math.max(1, Math.round(diff / 3600000))}h ago` },
    ];
    const match = ranges.find((r) => diff < r.limit);
    if (match) return match.text;
    return date.toLocaleString();
  };

  return (
    <CollapsibleSection
      title="Request logs"
      description="Inspect the 500 most recent API hits to monitor usage."
      action={
        <div className="flex gap-2">
          <button type="button" onClick={load} className="btn-secondary px-4 py-2 text-xs">Reload</button>
          <button type="button" onClick={exportCsv} className="btn-primary px-4 py-2 text-xs">Export CSV</button>
        </div>
      }
      defaultOpen
    >
      {loading || !rows ? (
        <div className="p-6 text-sm text-slate-500 animate-pulse">Loading logs…</div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-sm text-slate-500">No requests captured yet.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <article key={row.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase text-white ${
                    row.method === "GET"
                      ? "bg-emerald-500"
                      : row.method === "POST"
                        ? "bg-indigo-500"
                        : row.method === "DELETE"
                          ? "bg-rose-500"
                          : "bg-slate-500"
                  }`}>{row.method}</span>
                  <span className="text-sm font-semibold text-slate-900">{row.path}</span>
                </div>
                <span className="text-xs text-slate-400">{formatRelativeTime(row.createdAt)}</span>
              </div>
              <div className="mt-3 grid gap-2 text-[11px] uppercase tracking-wide text-slate-400 sm:grid-cols-4">
                <div>
                  <span className="font-semibold text-slate-500">User</span>
                  <p className="mt-1 text-slate-700">{row.userId ?? "Guest"}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">IP</span>
                  <p className="mt-1 text-slate-700">{row.ip}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Location</span>
                  <p className="mt-1 text-slate-700">{row.city || "?"}{row.country ? `, ${row.country}` : ""}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Referrer</span>
                  <p className="mt-1 truncate text-slate-700" title={row.referer}>{row.referer || "—"}</p>
                </div>
              </div>
              {row.userAgent && (
                <p className="mt-2 line-clamp-2 text-xs text-slate-500" title={row.userAgent}>{row.userAgent}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
