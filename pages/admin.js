// frontend/pages/admin.js
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  safeJson,
  absUrl,
  API_BASE,
} from "../lib/apiBase";
import { notifyError, notifySuccess } from "../components/Toast";
import NG from "../public/ng-states-lgas.json";
import { getSocket } from "../lib/socket";
import ConfirmDialog from "../components/ConfirmDialog";
import { mediaUrl } from "../lib/mediaUrl";
import DateTimePicker from "../components/DateTimePicker";
import { resolveSessionTiming, formatCountdown } from "../lib/time";

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
  const [currentTime, setCurrentTime] = useState(Date.now());
  const createFilterState = () => ({ scope: "all", state: "", lga: "" });
  const [archiveFilters, setArchiveFilters] = useState(() => createFilterState());
  const [upcomingFilters, setUpcomingFilters] = useState(() => createFilterState());

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
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [candidateSaving, setCandidateSaving] = useState(false);

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
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleStart, setRescheduleStart] = useState("");
  const [rescheduleEnd, setRescheduleEnd] = useState("");
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(null);
  const defaultEditSessionForm = () => ({
    title: "",
    description: "",
    scope: "national",
    scopeState: "",
    scopeLGA: "",
    minAge: "18",
    startTime: "",
    endTime: "",
  });
  const [editSessionTarget, setEditSessionTarget] = useState(null);
  const [editSessionSaving, setEditSessionSaving] = useState(false);
  const [editSessionForm, setEditSessionForm] = useState(() => defaultEditSessionForm());

  const resetCandidateForm = () => {
    setCName("");
    setCPhotoUrl("");
    setEditingCandidate(null);
    if (scope === "national") {
      setCState("");
      setCLga("");
    } else if (scope === "state") {
      setCLga("");
    }
  };
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
    { id: "analytics", label: "Analytics" },
    { id: "users", label: "Users" },
    { id: "logs", label: "Request Logs" },
  ], []);
  const visibleTabs = useMemo(() => (
    viewerRole === "super-admin"
      ? tabs
      : tabs.filter((tabItem) => tabItem.id !== "logs")
  ), [tabs, viewerRole]);

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
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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
    socket?.on("periodUpdated", handleCreated);
    socket?.on("periodCancelled", handleCreated);
    socket?.on("periodEnded", handleCreated);
    socket?.on("resultsPublished", handlePublished);
    socket?.on("voteUpdate", handleVote);

    return () => {
      socket?.off("periodCreated", handleCreated);
      socket?.off("periodUpdated", handleCreated);
      socket?.off("periodCancelled", handleCreated);
      socket?.off("periodEnded", handleCreated);
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
    if (!visibleTabs.some((item) => item.id === tab)) {
      setTab(visibleTabs[0]?.id || "overview");
    }
  }, [visibleTabs, tab]);

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
    if (!period || period.forcedEnded || period.resultsPublished) return false;
    const start = new Date(period.startTime).getTime();
    const end = new Date(period.endTime).getTime();
    return currentTime >= start && currentTime < end;
  };
  const isUpcoming = (period) => {
    if (!period || period.forcedEnded || period.resultsPublished) return false;
    return currentTime < new Date(period.startTime).getTime();
  };
  const awaitingPublish = (period) => {
    if (!period || period.resultsPublished) return false;
    if (period.forcedEnded) return true;
    return currentTime >= new Date(period.endTime).getTime();
  };

  const sessionMatchesFilters = (period, filters) => {
    if (!period) return false;
    const normalizedScope = (period.scope || "national").toLowerCase();
    if (filters.scope !== "all" && normalizedScope !== filters.scope) return false;
    if ((filters.scope === "state" || filters.scope === "local") && filters.state) {
      const periodState = (period.scopeState || "").trim().toLowerCase();
      if (periodState !== filters.state.trim().toLowerCase()) return false;
    }
    if (filters.scope === "local" && filters.lga) {
      const periodLga = (period.scopeLGA || "").trim().toLowerCase();
      if (periodLga !== filters.lga.trim().toLowerCase()) return false;
    }
    return true;
  };

  const archiveBaseSessions = useMemo(() => (
    sessions.filter((period) => period.resultsPublished || (!isActive(period) && !isUpcoming(period) && !awaitingPublish(period)))
  ), [sessions, isActive, isUpcoming, awaitingPublish]);

  const filteredArchiveSessions = useMemo(() => (
    archiveBaseSessions.filter((period) => sessionMatchesFilters(period, archiveFilters))
  ), [archiveBaseSessions, archiveFilters]);

  const hasArchiveSessions = archiveBaseSessions.length > 0;
  const archiveHasMatches = filteredArchiveSessions.length > 0;

  const upcomingBaseSessions = useMemo(() => (
    sessions.filter((period) => awaitingPublish(period) || isUpcoming(period))
  ), [sessions, isUpcoming, awaitingPublish]);

  const filteredUpcomingSessions = useMemo(() => (
    upcomingBaseSessions.filter((period) => sessionMatchesFilters(period, upcomingFilters))
  ), [upcomingBaseSessions, upcomingFilters]);

  const hasUpcomingSessions = upcomingBaseSessions.length > 0;
  const upcomingHasMatches = filteredUpcomingSessions.length > 0;

  const archiveStateOptions = useMemo(() => {
    const set = new Set();
    archiveBaseSessions.forEach((period) => {
      const scopeValue = (period.scope || "").toLowerCase();
      if ((scopeValue === "state" || scopeValue === "local") && period.scopeState) {
        set.add(period.scopeState.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [archiveBaseSessions]);

  const upcomingStateOptions = useMemo(() => {
    const set = new Set();
    upcomingBaseSessions.forEach((period) => {
      const scopeValue = (period.scope || "").toLowerCase();
      if ((scopeValue === "state" || scopeValue === "local") && period.scopeState) {
        set.add(period.scopeState.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [upcomingBaseSessions]);

  const archiveLgaOptions = useMemo(() => {
    if (!archiveFilters.state) return [];
    const normalized = archiveFilters.state.trim().toLowerCase();
    const stateData = states.find((entry) => (entry.label || "").trim().toLowerCase() === normalized);
    if (stateData?.lgas?.length) return stateData.lgas;
    const set = new Set();
    archiveBaseSessions
      .filter((period) => (period.scope || "").toLowerCase() === "local" && (period.scopeState || "").trim().toLowerCase() === normalized)
      .forEach((period) => {
        if (period.scopeLGA) set.add(period.scopeLGA.trim());
      });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [archiveFilters.state, archiveBaseSessions, states]);

  const upcomingLgaOptions = useMemo(() => {
    if (!upcomingFilters.state) return [];
    const normalized = upcomingFilters.state.trim().toLowerCase();
    const stateData = states.find((entry) => (entry.label || "").trim().toLowerCase() === normalized);
    if (stateData?.lgas?.length) return stateData.lgas;
    const set = new Set();
    upcomingBaseSessions
      .filter((period) => (period.scope || "").toLowerCase() === "local" && (period.scopeState || "").trim().toLowerCase() === normalized)
      .forEach((period) => {
        if (period.scopeLGA) set.add(period.scopeLGA.trim());
      });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [upcomingFilters.state, upcomingBaseSessions, states]);

  const scopeFilterOptions = useMemo(() => [
    { value: "all", label: "All scopes" },
    { value: "national", label: "National / Presidential" },
    { value: "state", label: "State" },
    { value: "local", label: "Local Government" },
  ], []);

  const handleArchiveScopeChange = (value) => {
    setArchiveFilters((prev) => {
      const next = { ...prev, scope: value };
      if (value === "all" || value === "national") {
        next.state = "";
        next.lga = "";
      } else if (value === "state") {
        next.lga = "";
      }
      return next;
    });
  };

  const handleArchiveStateChange = (value) => {
    setArchiveFilters((prev) => ({ ...prev, state: value, lga: "" }));
  };

  const handleArchiveLgaChange = (value) => {
    setArchiveFilters((prev) => ({ ...prev, lga: value }));
  };

  const handleUpcomingScopeChange = (value) => {
    setUpcomingFilters((prev) => {
      const next = { ...prev, scope: value };
      if (value === "all" || value === "national") {
        next.state = "";
        next.lga = "";
      } else if (value === "state") {
        next.lga = "";
      }
      return next;
    });
  };

  const handleUpcomingStateChange = (value) => {
    setUpcomingFilters((prev) => ({ ...prev, state: value, lga: "" }));
  };

  const handleUpcomingLgaChange = (value) => {
    setUpcomingFilters((prev) => ({ ...prev, lga: value }));
  };

  const toInputDateTime = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const offset = date.getTimezoneOffset() * 60000;
    const local = new Date(date.getTime() - offset);
    return local.toISOString().slice(0, 16);
  };

  const openReschedule = (period) => {
    setRescheduleTarget(period);
    setRescheduleStart(toInputDateTime(period.startTime));
    setRescheduleEnd(toInputDateTime(period.endTime));
  };

  const handleEditSessionChange = (field, value) => {
    setEditSessionForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "scope") {
        if (value === "national") {
          next.scopeState = "";
          next.scopeLGA = "";
        } else if (value === "state") {
          next.scopeLGA = "";
        }
      }
      if (field === "minAge") {
        next.minAge = value.replace(/[^0-9]/g, "");
      }
      return next;
    });
  };

  const openEditSession = (period) => {
    const scopeValue = (period.scope || "national").toLowerCase();
    setEditSessionTarget(period);
    setEditSessionForm({
      title: period.title || "",
      description: period.description || "",
      scope: scopeValue,
      scopeState: scopeValue === "national" ? "" : (period.scopeState || ""),
      scopeLGA: scopeValue === "local" ? (period.scopeLGA || "") : "",
      minAge: String(period.minAge ?? 18),
      startTime: toInputDateTime(period.startTime),
      endTime: toInputDateTime(period.endTime),
    });
  };

  const closeEditSession = () => {
    if (editSessionSaving) return;
    setEditSessionTarget(null);
    setEditSessionForm(defaultEditSessionForm());
  };

  async function submitEditSession() {
    if (!editSessionTarget) return;
    const { title, description, scope, scopeState, scopeLGA, minAge, startTime, endTime } = editSessionForm;
    if (!startTime || !endTime) {
      notifyError("Provide both start and end times");
      return;
    }
    if (scope !== "national" && !scopeState.trim()) {
      notifyError("Select a state for this scope");
      return;
    }
    if (scope === "local" && !scopeLGA.trim()) {
      notifyError("Select an LGA for the local scope");
      return;
    }
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      notifyError("Use valid date and time values");
      return;
    }
    if (endDate.getTime() <= startDate.getTime()) {
      notifyError("End time must occur after the start time");
      return;
    }
    setEditSessionSaving(true);
    try {
      const cleanedTitle = title.trim();
      const cleanedDescription = description.trim();
      const cleanedState = scope === "national" ? null : scopeState.trim() || null;
      const cleanedLga = scope === "local" ? (scopeLGA.trim() || null) : null;
      const payload = {
        title: cleanedTitle,
        description: cleanedDescription,
        scope,
        scopeState: cleanedState,
        scopeLGA: cleanedLga,
        minAge: minAge ? Number(minAge) : undefined,
        startTime,
        endTime,
      };
      const resp = await apiPut(`/api/admin/voting-period/${editSessionTarget.id}`, payload);
      if (!resp?.success) throw new Error(resp?.message || "Failed to update session");
      notifySuccess("Session updated");
      closeEditSession();
      await loadSessions({ suppressErrors: true, silent: true });
    } catch (err) {
      notifyError(err.message || "Unable to update session");
    } finally {
      setEditSessionSaving(false);
    }
  }

  const stats = useMemo(() => ({
    active: sessions.filter(isActive).length,
    upcoming: sessions.filter(isUpcoming).length,
    awaiting: sessions.filter(awaitingPublish).length,
  }), [sessions, currentTime]);

  const activeSessions = useMemo(() => sessions.filter(isActive), [sessions, currentTime]);
  const awaitingSessions = useMemo(() => sessions.filter(awaitingPublish), [sessions, currentTime]);
  const upcomingSessions = useMemo(() => sessions.filter(isUpcoming), [sessions, currentTime]);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);


  useEffect(() => {
    if (!selPast) return;
    const match = filteredArchiveSessions.find((period) => period.id === selPast.id);
    if (!match) {
      setSelPast(null);
      setPastCands([]);
      setAudit(null);
    } else if (selPast !== match) {
      setSelPast(match);
    }
  }, [filteredArchiveSessions, selPast]);

  useEffect(() => {
    if (tab !== "analytics") return;
    if (analyticsLoading) return;
    if (analytics) return;
    loadAnalytics({ suppressErrors: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
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
    if (candidateSaving) {
      notifyError("Wait for the current candidate save to finish");
      return;
    }
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
    if (candidateSaving) return;
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
    const payload = {
      name: trimmedName,
      state: candidateState,
      lga: candidateLga,
      photoUrl: cPhotoUrl || null,
    };
    setCandidateSaving(true);
    try {
      if (editingCandidate) {
        const resp = await apiPut(`/api/admin/candidate/${editingCandidate.id}`, payload);
        if (!resp?.success) throw new Error(resp?.message || "Unable to update candidate");
        notifySuccess("Candidate updated");
      } else {
        const resp = await apiPost("/api/admin/candidate", payload);
        if (!resp?.success) throw new Error(resp?.message || "Unable to add candidate");
        notifySuccess("Candidate added");
      }
      resetCandidateForm();
      await loadUnpublished();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setCandidateSaving(false);
    }
  }

  async function removeCandidate(candidate) {
    if (!candidate?.id) return;
    if (candidateSaving) {
      notifyError("Please wait for the current candidate update to finish");
      return;
    }
    try {
      if (editingCandidate?.id === candidate.id) {
        resetCandidateForm();
      }
      await apiDelete(`/api/admin/candidate/${candidate.id}`);
      await loadUnpublished({ silent: true, suppressErrors: true });
      notifySuccess(`${candidate.name || "Candidate"} removed`);
    } catch (err) {
      notifyError(err.message || "Failed to remove candidate");
    }
  }

  function beginEditCandidate(candidate) {
    if (!candidate) return;
    setEditingCandidate(candidate);
    setCName(candidate.name || "");
    setCPhotoUrl(candidate.photoUrl || "");
    if (scope === "national") {
      setCState(candidate.state || "");
      setCLga(candidate.lga || "");
    } else if (scope === "state") {
      setCLga(candidate.lga || "");
    } else if (scope === "local") {
      // scopeLGA determines ballot, nothing extra required
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelCandidateEdit() {
    resetCandidateForm();
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
      await refreshLive();
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

  async function cancelSession(period) {
    if (!period) return;
    try {
      const resp = await apiPost("/api/admin/periods/cancel", { periodId: period.id });
      if (!resp?.success) throw new Error(resp?.message || "Failed to cancel session");
      await Promise.all([loadSessions({ suppressErrors: true, silent: true }), loadUnpublished({ suppressErrors: true, silent: true })]);
      resetCandidateForm();
      notifySuccess("Session cancelled");
    } catch (err) {
      notifyError(err.message || "Unable to cancel session");
    }
  }

  async function submitReschedule() {
    if (!rescheduleTarget) return;
    if (!rescheduleStart || !rescheduleEnd) {
      notifyError("Provide both new start and end times");
      return;
    }
    const startDate = new Date(rescheduleStart);
    const endDate = new Date(rescheduleEnd);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      notifyError("Use valid date and time values");
      return;
    }
    if (endDate.getTime() <= startDate.getTime()) {
      notifyError("End time must occur after the start time");
      return;
    }
    setRescheduleLoading(true);
    try {
      await apiPost(`/api/admin/periods/${rescheduleTarget.id}/reschedule`, {
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
      });
      notifySuccess("Session rescheduled");
      setRescheduleTarget(null);
      setRescheduleStart("");
      setRescheduleEnd("");
      await loadSessions({ silent: true });
    } catch (err) {
      notifyError(err.message || "Could not reschedule session");
    } finally {
      setRescheduleLoading(false);
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

  const loadAnalytics = async ({ suppressErrors = false } = {}) => {
    if (analyticsLoading) return;
    setAnalyticsLoading(true);
    if (!suppressErrors) setAnalyticsError(null);
    try {
      const data = await apiGet("/api/admin/analytics/summary");
      setAnalytics(data || null);
      setAnalyticsError(null);
    } catch (err) {
      const message = err.message || "Failed to load analytics";
      setAnalyticsError(message);
      if (!suppressErrors) notifyError(message);
    } finally {
      setAnalyticsLoading(false);
    }
  };

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
    if (pendingAction.type === "cancel") {
      return {
        title: "Cancel session",
        message: `Cancel ${pendingAction.period.title || `Session #${pendingAction.period.id}`} before it begins? Candidates will return to the staging area and voters will not see this ballot.`,
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
      case "cancel":
        return "Cancel session";
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
      if (pendingAction.type === "cancel") await cancelSession(pendingAction.period);
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
    if (!value) return "N/A";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return withTime ? date.toLocaleString() : date.toLocaleDateString();
  };
  const formatCountdown = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const diff = date.getTime() - Date.now();
    if (diff <= 0) return "pending removal";
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes || 1} minute${minutes === 1 ? "" : "s"} remaining`;
    const hours = Math.floor(diff / 3600000);
    if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} remaining`;
    const days = Math.ceil(diff / 86400000);
    return `${days} day${days === 1 ? "" : "s"} remaining`;
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
        {visibleTabs.map((item) => (
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
                      <span className="mt-4 inline-flex w-max rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-800">
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
                        isComplete ? "bg-emerald-500 text-white" : isActive ? "bg-indigo-300 text-indigo-900" : "bg-slate-200 text-slate-600"
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
                      <DateTimePicker
                        id="session-start"
                        value={start}
                        onChange={setStart}
                        placeholder="Select start time"
                        minDate={new Date()}
                      />
                    </div>
                    <div>
                      <label className="form-label" htmlFor="session-end">End time</label>
                      <DateTimePicker
                        id="session-end"
                        value={end}
                        onChange={setEnd}
                        placeholder="Select end time"
                        minDate={start ? new Date(start) : undefined}
                      />
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
                            <dd className="font-medium text-slate-900">{scopeState || "N/A"}</dd>
                          </div>
                        )}
                        {scope === "local" && (
                          <div className="flex justify-between gap-4">
                            <dt>LGA</dt>
                            <dd className="font-medium text-slate-900">{scopeLGA || "N/A"}</dd>
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
                      <div className="mt-4 flex items-center gap-3 rounded-xl bg-indigo-50/70 p-4 text-indigo-700">
                        {start ? (
                          <div className="flex h-14 w-14 flex-col items-center justify-center rounded-lg bg-white text-indigo-600 shadow-inner">
                            <span className="text-[10px] font-semibold uppercase">{new Date(start).toLocaleString("default", { month: "short" })}</span>
                            <span className="text-xl font-bold">{new Date(start).getDate()}</span>
                          </div>
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white text-indigo-400 shadow-inner">?</div>
                        )}
                        <div className="text-xs">
                          <p><span className="font-semibold text-indigo-900">Starts:</span> {start ? new Date(start).toLocaleString() : "Pick a start time"}</p>
                          <p><span className="font-semibold text-indigo-900">Ends:</span> {end ? new Date(end).toLocaleString() : "Select an end time"}</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold text-slate-900">Stage candidates</h4>
                        {editingCandidate && (
                          <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                            Editing {editingCandidate.name}
                          </span>
                        )}
                      </div>
                      <form onSubmit={addCandidate} className="mt-3 space-y-3">
                        <div>
                          <label className="form-label" htmlFor="candidate-name">Full name</label>
                          <input
                            id="candidate-name"
                            className="form-control"
                            value={cName}
                            onChange={(e) => setCName(e.target.value)}
                            placeholder="Candidate name"
                            disabled={candidateSaving}
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
                              disabled={scope !== "national" || candidateSaving}
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
                                disabled={candidateSaving || (scope !== "national" && scope !== "state")}
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
                              disabled={candidateSaving}
                            />
                            <label className={`btn-secondary cursor-pointer px-4 ${candidateSaving ? "opacity-60 pointer-events-none" : ""}`}>
                              Upload
                              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handlePickImage} disabled={candidateSaving} />
                            </label>
                          </div>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <button type="submit" className="btn-primary" disabled={candidateSaving}>
                            {candidateSaving
                              ? editingCandidate
                                ? "Saving…"
                                : "Adding…"
                              : editingCandidate
                                ? "Save changes"
                                : "Add candidate"}
                          </button>
                          {editingCandidate && (
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={cancelCandidateEdit}
                              disabled={candidateSaving}
                            >
                              Cancel edit
                            </button>
                          )}
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
                          validCandidates.map((candidate) => {
                            const isEditing = editingCandidate?.id === candidate.id;
                            return (
                              <div
                                key={candidate.id}
                                className={`flex items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm ${isEditing ? "border-indigo-300 ring-2 ring-indigo-200/60" : ""}`}
                              >
                                <div className="flex items-center gap-3">
                                  <img
                                    src={absUrl(candidate.photoUrl || "/placeholder.png")}
                                    alt={candidate.name}
                                    className="h-10 w-10 rounded-full object-cover ring-1 ring-slate-200/70"
                                  />
                                  <div>
                                    <div className="text-sm font-semibold text-slate-900">{candidate.name}</div>
                                    <div className="text-xs text-slate-500">{candidate.state || "N/A"}{candidate.lga ? ` • ${candidate.lga}` : ""}</div>
                                    {isEditing && <div className="text-[11px] font-semibold uppercase text-indigo-600">Editing</div>}
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                  <button
                                    type="button"
                                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                                    onClick={() => beginEditCandidate(candidate)}
                                    disabled={candidateSaving}
                                  >
                                    <span className="inline-flex items-center gap-1">
                                      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                                        <path d="M11.3 1.3a1 1 0 0 1 1.4 0l2 2a1 1 0 0 1 0 1.4l-7.8 7.8-3.2.8a.5.5 0 0 1-.6-.6l.8-3.2 7.8-7.8Zm-7 10.4-.4 1.5 1.5-.4L11 5.3 9.7 4 4.3 9.4Z" />
                                      </svg>
                                      Edit
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                                    onClick={() => removeCandidate(candidate)}
                                    disabled={candidateSaving}
                                  >
                                    <span className="inline-flex items-center gap-1">
                                      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                                        <path d="M5.5 5a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6a.5.5 0 0 1 .5-.5Zm5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6a.5.5 0 0 1 .5-.5ZM2 3.5A.5.5 0 0 1 2.5 3H5l.27-.54A1 1 0 0 1 6.12 2h3.76a1 1 0 0 1 .85.46L11 3h2.5a.5.5 0 0 1 0 1H13l-.86 9.17A1.5 1.5 0 0 1 10.66 14H5.34a1.5 1.5 0 0 1-1.48-1.33L3 4H2.5a.5.5 0 0 1-.5-.5Zm3.04-.5h5.92l-.17-.34a.1.1 0 0 0-.08-.05H6.29a.1.1 0 0 0-.08.05L5.54 3ZM4 4l.84 8.92a.5.5 0 0 0 .5.45h5.32a.5.5 0 0 0 .5-.45L12 4H4Z" />
                                      </svg>
                                      Remove
                                    </span>
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                        {mismatchedCandidates.length > 0 && (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-700">
                            <div className="mb-2 text-sm font-semibold text-amber-800">Outside current scope</div>
                            <p className="mb-3">Update the scope or remove these candidates before launching.</p>
                            <div className="space-y-2">
                              {mismatchedCandidates.map((candidate) => {
                                const isEditing = editingCandidate?.id === candidate.id;
                                return (
                                  <div
                                    key={candidate.id}
                                    className={`flex items-start justify-between gap-3 rounded-xl border border-amber-200/70 bg-white/80 p-3 ${isEditing ? "ring-2 ring-amber-300" : ""}`}
                                  >
                                    <div>
                                      <div className="text-sm font-semibold text-slate-900">{candidate.name}</div>
                                      <div className="text-xs text-slate-500">{candidate.state || "N/A"}{candidate.lga ? ` • ${candidate.lga}` : ""}</div>
                                      {isEditing && <div className="text-[11px] font-semibold uppercase text-amber-700">Editing</div>}
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                      <button
                                        type="button"
                                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                                        onClick={() => beginEditCandidate(candidate)}
                                        disabled={candidateSaving}
                                      >
                                        <span className="inline-flex items-center gap-1">
                                          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                                            <path d="M11.3 1.3a1 1 0 0 1 1.4 0l2 2a1 1 0 0 1 0 1.4l-7.8 7.8-3.2.8a.5.5 0 0 1-.6-.6l.8-3.2 7.8-7.8Zm-7 10.4-.4 1.5 1.5-.4L11 5.3 9.7 4 4.3 9.4Z" />
                                          </svg>
                                          Edit
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                                        onClick={() => removeCandidate(candidate)}
                                        disabled={candidateSaving}
                                      >
                                        <span className="inline-flex items-center gap-1">
                                          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                                            <path d="M5.5 5a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6a.5.5 0 0 1 .5-.5Zm5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6a.5.5 0 0 1 .5-.5ZM2 3.5A.5.5 0 0 1 2.5 3H5l.27-.54A1 1 0 0 1 6.12 2h3.76a1 1 0 0 1 .85.46L11 3h2.5a.5.5 0 0 1 0 1H13l-.86 9.17A1.5 1.5 0 0 1 10.66 14H5.34a1.5 1.5 0 0 1-1.48-1.33L3 4H2.5a.5.5 0 0 1-.5-.5Zm3.04-.5h5.92l-.17-.34a.1.1 0 0 0-.08-.05H6.29a.1.1 0 0 0-.08.05L5.54 3ZM4 4l.84 8.92a.5.5 0 0 0 .5.45h5.32a.5.5 0 0 0 .5-.45L12 4H4Z" />
                                          </svg>
                                          Remove
                                        </span>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
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
            <div className="mt-4 flex flex-wrap gap-2">
              <select
                value={upcomingFilters.scope}
                onChange={(e) => handleUpcomingScopeChange(e.target.value)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200/40"
              >
                {scopeFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {upcomingFilters.scope !== "all" && upcomingFilters.scope !== "national" && (
                <select
                  value={upcomingFilters.state}
                  onChange={(e) => handleUpcomingStateChange(e.target.value)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200/40"
                >
                  <option value="">All states</option>
                  {upcomingStateOptions.map((stateName) => (
                    <option key={stateName} value={stateName}>{stateName}</option>
                  ))}
                </select>
              )}
              {upcomingFilters.scope === "local" && upcomingFilters.state && (
                <select
                  value={upcomingFilters.lga}
                  onChange={(e) => handleUpcomingLgaChange(e.target.value)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200/40"
                >
                  <option value="">All LGAs</option>
                  {upcomingLgaOptions.map((lgaName) => (
                    <option key={lgaName} value={lgaName}>{lgaName}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {loadingSessions ? (
                <div className="col-span-full text-sm text-slate-500 animate-pulse">Loading sessions…</div>
              ) : !hasUpcomingSessions ? (
                <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                  No upcoming or unpublished sessions at the moment.
                </div>
              ) : !upcomingHasMatches ? (
                <div className="col-span-full rounded-2xl border border-dashed border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-700">
                  No sessions match the current filters.
                </div>
              ) : (
                filteredUpcomingSessions
                  .map((period) => {
                    const startDate = new Date(period.startTime);
                    const monthLabel = startDate.toLocaleString("default", { month: "short" });
                    const dayLabel = startDate.getDate();
                    const timing = resolveSessionTiming(period, currentTime);
                    const countdownLabel = (() => {
                      if (period.forcedEnded) return "Ended early";
                      if (awaitingPublish(period) && timing.countdownMs > 0) {
                        return `Ended ${formatCountdown(timing.countdownMs)} ago`;
                      }
                      if (timing.phase === "upcoming" && timing.countdownMs > 0) {
                        return `Starts in ${formatCountdown(timing.countdownMs)}`;
                      }
                      if (timing.phase === "live" && timing.countdownMs > 0) {
                        return `Ends in ${formatCountdown(timing.countdownMs)}`;
                      }
                      return null;
                    })();
                    const countdownClass = period.forcedEnded
                      ? "text-rose-600"
                      : awaitingPublish(period)
                        ? "text-amber-600"
                        : timing.phase === "upcoming"
                          ? "text-indigo-600"
                          : "text-emerald-600";
                    return (
                      <div key={period.id} className="flex h-full flex-col justify-between rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-base font-semibold text-slate-900">{period.title || `Session #${period.id}`}</h3>
                            <span className={
                              awaitingPublish(period)
                                ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase text-emerald-700"
                                : "rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase text-indigo-600"
                            }>
                              {awaitingPublish(period) ? "Awaiting publish" : "Upcoming"}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex h-14 w-14 flex-col items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 shadow-inner">
                              <span className="text-[10px] font-semibold uppercase">{monthLabel}</span>
                              <span className="text-xl font-bold">{dayLabel}</span>
                            </div>
                            <div className="text-xs text-slate-500">
                              <p className="font-medium text-slate-700">{startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Starts</p>
                              <p>{new Date(period.startTime).toLocaleString()} – {new Date(period.endTime).toLocaleString()}</p>
                              <p className="mt-1">
                                Scope: <span className="font-semibold uppercase text-slate-800">{period.scope}</span>
                                {period.scope !== "national" && period.scopeState ? ` • ${period.scopeState}` : ""}
                                {period.scope === "local" && period.scopeLGA ? ` • ${period.scopeLGA}` : ""}
                              </p>
                              {countdownLabel && (
                                <p className={`mt-1 text-[11px] font-semibold uppercase tracking-wide ${countdownClass}`}>
                                  {countdownLabel}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {isUpcoming(period) && viewerRole === "super-admin" && (
                            <button type="button" className="btn-secondary" onClick={() => openReschedule(period)}>
                              Reschedule
                            </button>
                          )}
                          {isUpcoming(period) && viewerRole === "super-admin" && (
                            <button type="button" className="btn-secondary" onClick={() => openEditSession(period)}>
                              Edit details
                            </button>
                          )}
                          {isUpcoming(period) && viewerRole === "super-admin" && (
                            <button
                              type="button"
                              className="btn-secondary text-rose-600 hover:text-rose-700"
                              onClick={() => setPendingAction({ type: "cancel", period })}
                            >
                              Cancel session
                            </button>
                          )}
                          {awaitingPublish(period) && (
                            <button type="button" className="btn-primary" onClick={() => setPendingAction({ type: "publish", period })}>
                              Publish results
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </CollapsibleSection>
        </div>
      )}

      {tab === "live" && (
        <LivePanel
          live={live}
          refresh={refreshLive}
          viewerRole={viewerRole}
          onEnd={(period) => setPendingAction({ type: "end", period })}
        />
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
          <div className="mt-4 flex flex-wrap gap-2">
            <select
              value={archiveFilters.scope}
              onChange={(e) => handleArchiveScopeChange(e.target.value)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200/40"
            >
              {scopeFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {archiveFilters.scope !== "all" && archiveFilters.scope !== "national" && (
              <select
                value={archiveFilters.state}
                onChange={(e) => handleArchiveStateChange(e.target.value)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200/40"
              >
                <option value="">All states</option>
                {archiveStateOptions.map((stateName) => (
                  <option key={stateName} value={stateName}>{stateName}</option>
                ))}
              </select>
            )}
            {archiveFilters.scope === "local" && archiveFilters.state && (
              <select
                value={archiveFilters.lga}
                onChange={(e) => handleArchiveLgaChange(e.target.value)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200/40"
              >
                <option value="">All LGAs</option>
                {archiveLgaOptions.map((lgaName) => (
                  <option key={lgaName} value={lgaName}>{lgaName}</option>
                ))}
              </select>
            )}
          </div>
          <div className="mt-4 space-y-2">
            {loadingSessions ? (
              <div className="text-sm text-slate-500 animate-pulse">Loading sessions…</div>
            ) : !hasArchiveSessions ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">Once results are published, sessions will appear here for reference.</div>
            ) : !archiveHasMatches ? (
              <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-700">No sessions match the current filters.</div>
            ) : (
              filteredArchiveSessions
                .map((period) => (
                  <button
                    key={period.id}
                    type="button"
                    onClick={() => viewPast(period)}
                    className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${selPast?.id === period.id ? "border-indigo-300 bg-indigo-50" : "border-slate-100 bg-white"}`}
                  >
                    <div className="text-sm font-semibold text-slate-900">{period.title || `Session #${period.id}`}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(period.startTime).toLocaleString()} to {new Date(period.endTime).toLocaleString()}
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
                  {new Date(selPast.startTime).toLocaleString()} to {new Date(selPast.endTime).toLocaleString()}
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


      {tab === "analytics" && (
        <AnalyticsDashboard
          data={analytics}
          loading={analyticsLoading}
          error={analyticsError}
          onRefresh={() => loadAnalytics({ suppressErrors: false })}
        />
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
            <div className="space-y-4">
              {usersLoading ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-5 text-sm text-slate-500 animate-pulse">Loading users…</div>
              ) : users.length === 0 ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-5 text-sm text-slate-500">No registered users yet.</div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
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
                    const isSuper = targetRole === "super-admin";
                    const canReset = ["admin", "super-admin"].includes(viewerRole) && !isSuper;
                    const canChangeRole = viewerRole === "super-admin" && !isSuper;
                    const canManageStatus = !isSuper;
                    const roleBusy = updatingRoleId === user.id;
                    const avatar = mediaUrl(user.profilePhoto || "/avatar.png");
                    const pendingDeletion = Boolean(user.deletedAt);
                    const purgeCountdown = formatCountdown(user.purgeAt);
                    const lastLogin = user.lastLoginAt ? formatDateValue(user.lastLoginAt, true) : "Never";
                    return (
                      <article key={user.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm shadow-indigo-500/5">
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-wrap items-start gap-3">
                            <img
                              src={avatar}
                              alt={user.fullName || user.username || `User #${user.id}`}
                              className="h-12 w-12 rounded-xl object-cover ring-1 ring-slate-200/70"
                              onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = "/avatar.png";
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="truncate text-base font-semibold text-slate-900">{user.fullName || user.username || "Unknown user"}</h3>
                                <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${roleBadgeTone(targetRole)}`}>
                                  {roleLabel}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">ID #{user.id}{user.username ? ` • ${user.username}` : ""}</p>
                              <div className="mt-1 space-y-1 text-xs text-slate-600">
                                <div className="font-medium text-slate-700">{user.email || "No email"}</div>
                                {user.phone && <div>{user.phone}</div>}
                                <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-wide text-slate-400">
                                  <span>Created {formatDateValue(user.createdAt, true)}</span>
                                  <span>Last login {lastLogin}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 text-xs font-semibold">
                            <span className={`inline-flex items-center rounded-full px-3 py-1 ${statusBadgeTone(statusKey)}`}>
                              {statusLabel}
                            </span>
                            {user.state && (
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                                {user.state}{user.residenceLGA ? ` • ${user.residenceLGA}` : ""}
                              </span>
                            )}
                            {user.dateOfBirth && (
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                                DOB {formatDateValue(user.dateOfBirth)}
                              </span>
                            )}
                          </div>

                          {pendingDeletion && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-700">
                              Scheduled for deletion {purgeCountdown || "imminently"}
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2">
                            {canChangeRole && (
                              <div className="flex flex-wrap items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500">
                                <span>Role</span>
                                <button
                                  type="button"
                                  disabled={roleBusy || targetRole === "admin"}
                                  onClick={() => updateUserRole(user, "admin")}
                                  className={`rounded-full px-3 py-1 transition ${
                                    targetRole === "admin"
                                      ? "border border-indigo-300 bg-indigo-100 text-indigo-800 shadow-sm"
                                      : "border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                                  }`}
                                >
                                  Admin
                                </button>
                                <button
                                  type="button"
                                  disabled={roleBusy || targetRole === "user"}
                                  onClick={() => updateUserRole(user, "user")}
                                  className={`rounded-full px-3 py-1 transition ${
                                    targetRole === "user"
                                      ? "border border-slate-300 bg-slate-100 text-slate-800 shadow-sm"
                                      : "border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                                  }`}
                                >
                                  User
                                </button>
                              </div>
                            )}
                            {canManageStatus ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setPendingAction({ type: disabled ? "user-enable" : "user-disable", user })}
                                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                    disabled
                                      ? "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                                      : "border-amber-200 text-amber-600 hover:bg-amber-50"
                                  } ${roleBusy ? "opacity-50" : ""}`}
                                  disabled={roleBusy}
                                >
                                  {disabled ? "Enable" : "Disable"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPendingAction({ type: "user-delete", user })}
                                  className="inline-flex items-center rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                                  disabled={roleBusy}
                                >
                                  Delete
                                </button>
                              </>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500">
                                Protected account
                              </span>
                            )}
                            {canReset && (
                              <button
                                type="button"
                                onClick={() => {
                                  setResettingUser(user);
                                  setResetPassword("");
                                }}
                                disabled={roleBusy}
                                className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
                              >
                                Reset password
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
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
                            ? "border border-indigo-300 bg-indigo-100 text-indigo-800 shadow-sm"
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

      {tab === "logs" && <LogsPanel viewerRole={viewerRole} />}

      <EditSessionDialog
        open={!!editSessionTarget}
        period={editSessionTarget}
        form={editSessionForm}
        states={states}
        loading={editSessionSaving}
        onChange={handleEditSessionChange}
        onClose={closeEditSession}
        onSubmit={submitEditSession}
      />

      <RescheduleDialog
        open={!!rescheduleTarget}
        period={rescheduleTarget}
        startValue={rescheduleStart}
        endValue={rescheduleEnd}
        loading={rescheduleLoading}
        onStartChange={setRescheduleStart}
        onEndChange={setRescheduleEnd}
        onClose={() => {
          if (rescheduleLoading) return;
          setRescheduleTarget(null);
          setRescheduleStart("");
          setRescheduleEnd("");
        }}
        onSubmit={submitReschedule}
      />

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

function EditSessionDialog({ open, period, form, states, loading, onChange, onClose, onSubmit }) {
  if (!open || !period) return null;
  const scopeOptions = [
    { value: "national", label: "National" },
    { value: "state", label: "State" },
    { value: "local", label: "Local" },
  ];
  const selectedState = states.find((state) => state.label === form.scopeState);
  const availableLgas = selectedState?.lgas || [];
  const startPreview = form.startTime ? new Date(form.startTime) : new Date(period.startTime);
  const endPreview = form.endTime ? new Date(form.endTime) : new Date(period.endTime);
  const formatPreview = (date) => (
    Number.isNaN(date.getTime())
      ? "—"
      : `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
  );
  const monthLabel = !Number.isNaN(startPreview.getTime()) ? startPreview.toLocaleString("default", { month: "short" }) : "";
  const dayLabel = !Number.isNaN(startPreview.getTime()) ? startPreview.getDate() : "";

  return (
    <div className="fixed inset-0 z-[225] flex items-center justify-center bg-slate-900/60 px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!loading) onSubmit();
        }}
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Edit session details</h2>
            <p className="text-sm text-slate-500">Update configuration before the ballot opens. Changes are broadcast instantly.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-white text-slate-500 shadow-sm transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
            aria-label="Close edit session dialog"
            disabled={loading}
          >
            ×
          </button>
        </div>
        <div className="grid gap-6 px-6 py-6 md:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div>
              <label className="form-label" htmlFor="edit-title">Title</label>
              <input
                id="edit-title"
                className="form-control"
                value={form.title}
                onChange={(e) => onChange("title", e.target.value)}
                placeholder="Election title"
                disabled={loading}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="edit-description">Description</label>
              <textarea
                id="edit-description"
                className="form-control"
                rows={3}
                value={form.description}
                onChange={(e) => onChange("description", e.target.value)}
                placeholder="Short summary"
                disabled={loading}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="form-label" htmlFor="edit-scope">Scope</label>
                <select
                  id="edit-scope"
                  className="form-control"
                  value={form.scope}
                  onChange={(e) => onChange("scope", e.target.value)}
                  disabled={loading}
                >
                  {scopeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="edit-age">Minimum age</label>
                <input
                  id="edit-age"
                  type="number"
                  min={18}
                  className="form-control"
                  value={form.minAge}
                  onChange={(e) => onChange("minAge", e.target.value)}
                  placeholder="18"
                  disabled={loading}
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="form-label" htmlFor="edit-state">State</label>
                <select
                  id="edit-state"
                  className="form-control"
                  value={form.scope === "national" ? "" : form.scopeState}
                  onChange={(e) => onChange("scopeState", e.target.value)}
                  disabled={form.scope === "national" || loading}
                >
                  <option value="">{form.scope === "national" ? "Not required" : "Select state"}</option>
                  {states.map((state) => (
                    <option key={state.label} value={state.label}>{state.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="edit-lga">LGA</label>
                {form.scope === "local" ? (
                  <select
                    id="edit-lga"
                    className="form-control"
                    value={form.scopeLGA}
                    onChange={(e) => onChange("scopeLGA", e.target.value)}
                    disabled={loading}
                  >
                    <option value="">Select LGA</option>
                    {availableLgas.map((lga) => (
                      <option key={lga} value={lga}>{lga}</option>
                    ))}
                  </select>
                ) : (
                  <input id="edit-lga" className="form-control" value={form.scope === "local" ? form.scopeLGA : ""} disabled placeholder="Not required" />
                )}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="form-label" htmlFor="edit-start">Start time</label>
                <DateTimePicker
                  id="edit-start"
                  value={form.startTime}
                  onChange={(val) => onChange("startTime", val)}
                  placeholder="Select start time"
                  disabled={loading}
                  minDate={new Date()}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="edit-end">End time</label>
                <DateTimePicker
                  id="edit-end"
                  value={form.endTime}
                  onChange={(val) => onChange("endTime", val)}
                  placeholder="Select end time"
                  disabled={loading}
                  minDate={form.startTime ? new Date(form.startTime) : undefined}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 text-indigo-700">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 flex-col items-center justify-center rounded-xl bg-white text-indigo-600 shadow-inner">
                  <span className="text-[10px] font-semibold uppercase">{monthLabel}</span>
                  <span className="text-2xl font-bold">{dayLabel}</span>
                </div>
                <div className="space-y-1 text-sm">
                  <p><span className="font-semibold">Starts:</span> {formatPreview(startPreview)}</p>
                  <p><span className="font-semibold">Ends:</span> {formatPreview(endPreview)}</p>
                  <p><span className="font-semibold">Scope:</span> {form.scope}</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
              <p className="font-semibold text-slate-700">Before you update</p>
              <ul className="mt-2 space-y-1">
                <li>• Ensure current candidates comply with the new scope.</li>
                <li>• Voters will see changes instantly in their dashboards.</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            disabled={loading}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function RescheduleDialog({ open, period, startValue, endValue, loading, onStartChange, onEndChange, onClose, onSubmit }) {
  if (!open || !period) return null;
  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Reschedule session</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
            aria-label="Close reschedule dialog"
            disabled={loading}
          >
            ×
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Updating schedule for <span className="font-medium text-slate-800">{period.title || `Session #${period.id}`}</span>.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="form-label" htmlFor="reschedule-start">New start time</label>
            <DateTimePicker
              id="reschedule-start"
              value={startValue}
              onChange={onStartChange}
              placeholder="Select new start time"
              disabled={loading}
              minDate={new Date()}
            />
          </div>
          <div>
            <label className="form-label" htmlFor="reschedule-end">New end time</label>
            <DateTimePicker
              id="reschedule-end"
              value={endValue}
              onChange={onEndChange}
              placeholder="Select new end time"
              disabled={loading}
              minDate={startValue ? new Date(startValue) : undefined}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={loading}>
            Cancel
          </button>
          <button type="button" onClick={onSubmit} className="btn-primary" disabled={loading}>
            {loading ? "Saving…" : "Save schedule"}
          </button>
        </div>
      </div>
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
              <span>{new Date(session.startTime).toLocaleString()} to {new Date(session.endTime).toLocaleString()}</span>
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

function LivePanel({ live, refresh, viewerRole, onEnd }) {
  const canControl = ["admin", "super-admin"].includes((viewerRole || "").toLowerCase());
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
                <div className="flex items-center gap-2">
                  {canControl && (
                    <button
                      type="button"
                      className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                      onClick={() => onEnd?.(period)}
                    >
                      End now
                    </button>
                  )}
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase text-emerald-600">Live</span>
                </div>
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

function AnalyticsDashboard({ data, loading, error, onRefresh }) {
  const totals = data?.totals || {};
  const scopeBreakdown = data?.scopeBreakdown || [];
  const topStates = data?.topStates || [];
  const recentSessions = data?.recentSessions || [];

  const maxScopeVotes = scopeBreakdown.reduce((max, row) => Math.max(max, Number(row.votes || 0)), 0);
  const maxStateShare = topStates.reduce((max, row) => Math.max(max, Number(row.share || 0)), 0) || 100;
  const maxTurnout = recentSessions.reduce((max, row) => Math.max(max, Number(row.turnout || 0)), 0) || 100;

  const scopeLabel = (value) => {
    const normalized = (value || "").toLowerCase();
    if (normalized === "national") return "National";
    if (normalized === "state") return "State";
    if (normalized === "local") return "Local";
    return value || "Unknown";
  };

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Analytics overview</h2>
          <p className="text-sm text-slate-500">Turnout, participation, and voter distribution insights.</p>
        </div>
        <button type="button" onClick={onRefresh} className="btn-secondary px-4 py-2 text-xs">
          Refresh analytics
        </button>
      </div>

      {loading ? (
        <div className="mt-6 text-sm text-slate-500 animate-pulse">Generating analytics…</div>
      ) : error ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">{error}</div>
      ) : !data ? (
        <div className="mt-6 text-sm text-slate-500">Analytics will appear once voters start participating.</div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <StatPill label="Registered users" value={totals.users || 0} tone="sky" />
            <StatPill label="Eligible voters" value={totals.voters || 0} tone="emerald" />
            <StatPill label="Admins" value={totals.admins || 0} tone="amber" />
            <StatPill label="Super admins" value={totals.superAdmins || 0} tone="emerald" />
            <StatPill label="Votes cast" value={totals.votesCast || 0} tone="sky" />
            <StatPill label="Live sessions" value={totals.activeSessions || 0} tone="emerald" />
            <StatPill label="Published sessions" value={totals.publishedSessions || 0} tone="amber" />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Participation by scope</h3>
              {scopeBreakdown.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No sessions recorded yet.</p>
              ) : (
                <ul className="mt-3 space-y-3 text-sm text-slate-600">
                  {scopeBreakdown.map((row) => {
                    const votePercent = maxScopeVotes > 0 ? Math.max(6, (Number(row.votes || 0) / maxScopeVotes) * 100) : 0;
                    return (
                      <li key={row.scope} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900">{scopeLabel(row.scope)}</span>
                          <span className="text-xs text-slate-500">
                            {row.sessions} session{row.sessions === 1 ? "" : "s"} • {row.votes} vote{row.votes === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: `${votePercent}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Top states by voters</h3>
              {topStates.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">State participation data will appear as voters register.</p>
              ) : (
                <ul className="mt-3 space-y-3 text-sm text-slate-600">
                  {topStates.map((row) => {
                    const sharePercent = maxStateShare > 0 ? Math.max(6, (Number(row.share || 0) / maxStateShare) * 100) : 0;
                    return (
                      <li key={row.state} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900">{row.state}</span>
                          <span className="text-xs text-slate-500">{row.voters} voters • {row.share}%</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${sharePercent}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-8">
            <h3 className="text-sm font-semibold text-slate-900">Recent session turnout</h3>
            {recentSessions.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No session results recorded yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {recentSessions.map((session) => {
                  const turnoutPercent = session.turnout === null ? null : Math.max(6, (session.turnout / maxTurnout) * 100);
                  return (
                    <div key={session.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{session.title || `Session #${session.id}`}</p>
                          <p className="text-xs text-slate-500">{scopeLabel(session.scope)}{session.scopeState ? ` • ${session.scopeState}` : ""}{session.scope === "local" && session.scopeLGA ? ` • ${session.scopeLGA}` : ""}</p>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <p>Votes: <span className="font-semibold text-slate-900">{session.votes}</span></p>
                          <p>Eligible: <span className="font-semibold text-slate-900">{session.eligible}</span></p>
                          <p>Turnout: <span className="font-semibold text-slate-900">{session.turnout === null ? "—" : `${session.turnout}%`}</span></p>
                        </div>
                      </div>
                      {session.turnout !== null && (
                        <div className="mt-3 h-2 rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-purple-500"
                            style={{ width: `${turnoutPercent}%` }}
                          />
                        </div>
                      )}
                      <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-400">
                        Ended {new Date(session.endTime).toLocaleString()} {session.forcedEnded ? "• Ended early" : session.resultsPublished ? "• Results published" : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
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
    <section className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-[0_18px_50px_-45px_rgba(15,23,42,0.35)] backdrop-blur-sm md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-2">
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
      {open && <div className="mt-4 space-y-3">{children}</div>}
    </section>
  );
}


function LogsPanel({ viewerRole }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const isSuper = viewerRole === "super-admin";
  const [auditRows, setAuditRows] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilters, setAuditFilters] = useState({ actorId: "", start: "", end: "" });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isSuper) {
      loadAudit({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuper]);

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

  async function loadAudit(options = {}) {
    if (!isSuper) return;
    const filters = options.filters || auditFilters;
    setAuditLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.actorId?.trim()) params.append("actorId", filters.actorId.trim());
      if (filters.start) params.append("start", filters.start);
      if (filters.end) params.append("end", filters.end);
      const query = params.toString();
      const data = await apiGet(`/api/admin/audit-logs${query ? `?${query}` : ""}`);
      setAuditRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setAuditRows([]);
      if (!options.silent) {
        notifyError(err.message || "Failed to load audit logs");
      }
    } finally {
      setAuditLoading(false);
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

  async function exportJson() {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`${API_BASE}/api/admin/logs/export-json`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text?.slice(0, 200) || "Export failed");
      const blob = new Blob([text], { type: "application/json;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "request_logs.json";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      notifySuccess("JSON export ready");
    } catch (err) {
      notifyError(err.message || "Failed to export logs as JSON");
    }
  }

  async function exportAuditCsv() {
    if (!isSuper) return;
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const params = new URLSearchParams();
      if (auditFilters.actorId?.trim()) params.append("actorId", auditFilters.actorId.trim());
      if (auditFilters.start) params.append("start", auditFilters.start);
      if (auditFilters.end) params.append("end", auditFilters.end);
      const query = params.toString();
      const res = await fetch(`${API_BASE}/api/admin/audit-logs/export${query ? `?${query}` : ""}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text?.slice(0, 200) || "Export failed");
      const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "audit_logs.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      notifySuccess("Audit trail exported");
    } catch (err) {
      notifyError(err.message || "Failed to export audit logs");
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

  const auditList = !isSuper ? null : auditRows;

  return (
    <>
      <CollapsibleSection
        title="Request logs"
        description="Inspect the 100 most recent significant API actions for troubleshooting."
        action={
          <div className="flex gap-2">
            <button type="button" onClick={load} className="btn-secondary px-4 py-2 text-xs">Reload</button>
            <button type="button" onClick={exportJson} className="btn-secondary px-4 py-2 text-xs">Export JSON</button>
            <button type="button" onClick={exportCsv} className="btn-primary px-4 py-2 text-xs">Export CSV</button>
          </div>
        }
        defaultOpen
      >
        {loading || !rows ? (
          <div className="p-5 text-sm text-slate-500 animate-pulse">Loading logs…</div>
        ) : rows.length === 0 ? (
          <div className="p-5 text-sm text-slate-500">No requests captured yet.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <article key={row.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase ${
                      row.method === "GET"
                        ? "bg-emerald-500 text-white"
                        : row.method === "POST"
                          ? "bg-indigo-200 text-indigo-900"
                          : row.method === "DELETE"
                            ? "bg-rose-500 text-white"
                            : "bg-slate-500 text-white"
                    }`}>{row.method}</span>
                    <span className="text-sm font-semibold text-slate-900">{row.path}</span>
                  </div>
                  <span className="text-xs text-slate-400">{formatRelativeTime(row.createdAt)}</span>
                </div>
                <div className="mt-3 grid gap-2 text-[11px] uppercase tracking-wide text-slate-400 sm:grid-cols-5">
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
                    <span className="font-semibold text-slate-500">Status</span>
                    <p className="mt-1 text-slate-700">{row.statusCode ?? "?"}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">Duration</span>
                    <p className="mt-1 text-slate-700">{row.durationMs != null ? `${row.durationMs} ms` : "?"}</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-[11px] uppercase tracking-wide text-slate-400 sm:grid-cols-2">
                  <div>
                    <span className="font-semibold text-slate-500">Referrer</span>
                    <p className="mt-1 truncate text-slate-700" title={row.referer}>{row.referer || "N/A"}</p>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">User agent</span>
                    <p className="mt-1 break-words text-slate-700" title={row.userAgent}>{row.userAgent || "N/A"}</p>
                  </div>
                </div>
                {(row.queryParams || row.bodyParams) && (
                  <div className="mt-3 space-y-2 text-[11px] text-slate-500">
                    {row.queryParams && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left">
                        <span className="font-semibold uppercase text-slate-500">Query params</span>
                        <pre className="mt-1 whitespace-pre-wrap break-words text-slate-700">{row.queryParams}</pre>
                      </div>
                    )}
                    {row.bodyParams && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left">
                        <span className="font-semibold uppercase text-slate-500">Body</span>
                        <pre className="mt-1 whitespace-pre-wrap break-words text-slate-700">{row.bodyParams}</pre>
                      </div>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {isSuper && (
        <CollapsibleSection
          title="Audit trail"
          description="Immutable activity feed covering admin actions and key security events."
          action={
            <div className="flex gap-2">
              <button type="button" onClick={() => loadAudit({ filters: auditFilters })} className="btn-secondary px-4 py-2 text-xs">Reload</button>
              <button type="button" onClick={exportAuditCsv} className="btn-primary px-4 py-2 text-xs">Export CSV</button>
            </div>
          }
          defaultOpen={false}
        >
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              loadAudit({ filters: auditFilters });
            }}
          >
            <input
              type="text"
              className="form-control"
              placeholder="Actor ID"
              value={auditFilters.actorId}
              onChange={(e) => setAuditFilters((prev) => ({ ...prev, actorId: e.target.value }))}
            />
            <input
              type="datetime-local"
              className="form-control"
              value={auditFilters.start}
              onChange={(e) => setAuditFilters((prev) => ({ ...prev, start: e.target.value }))}
            />
            <input
              type="datetime-local"
              className="form-control"
              value={auditFilters.end}
              onChange={(e) => setAuditFilters((prev) => ({ ...prev, end: e.target.value }))}
            />
            <div className="flex gap-2">
              <button type="submit" className="btn-secondary px-4 py-2 text-xs">Apply</button>
              <button
                type="button"
                onClick={() => {
                  setAuditFilters({ actorId: "", start: "", end: "" });
                  loadAudit({ filters: { actorId: "", start: "", end: "" } });
                }}
                className="btn-secondary px-4 py-2 text-xs"
              >
                Clear
              </button>
            </div>
          </form>

          {auditLoading || !auditList ? (
            <div className="p-5 text-sm text-slate-500 animate-pulse">Loading audit trail…</div>
          ) : auditList.length === 0 ? (
            <div className="p-5 text-sm text-slate-500">No audit events captured for this range.</div>
          ) : (
            <div className="space-y-3">
              {auditList.map((item) => (
                <article key={item.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.action}</p>
                      <p className="text-xs text-slate-500">{item.entityType}{item.entityId ? ` • ${item.entityId}` : ""}</p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <p>{formatRelativeTime(item.createdAt)}</p>
                      <p>{item.actorRole || "system"}{item.actorId ? ` • ${item.actorId}` : ""}</p>
                    </div>
                  </div>
                  {item.ip && (
                    <p className="mt-2 text-xs text-slate-500">IP: {item.ip}</p>
                  )}
                  {item.notes && (
                    <p className="mt-2 text-xs text-slate-500">{item.notes}</p>
                  )}
                  <div className="mt-3 grid gap-3 text-[11px] text-slate-600 sm:grid-cols-2">
                    {item.beforeState && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <span className="font-semibold uppercase text-slate-500">Before</span>
                        <pre className="mt-1 whitespace-pre-wrap break-words text-slate-700">{item.beforeState}</pre>
                      </div>
                    )}
                    {item.afterState && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <span className="font-semibold uppercase text-slate-500">After</span>
                        <pre className="mt-1 whitespace-pre-wrap break-words text-slate-700">{item.afterState}</pre>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}
    </>
  );
}
