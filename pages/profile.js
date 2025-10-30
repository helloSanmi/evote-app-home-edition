import { useEffect, useMemo, useRef, useState } from "react";
import NG from "../public/ng-states-lgas.json";
import { api, jget, jpost, jput, safeJson } from "../lib/apiBase";
import { mediaUrl } from "../lib/mediaUrl";
import { notifyError, notifySuccess } from "../components/Toast";

export default function Profile() {
  const genderOptions = [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "non-binary", label: "Non-binary" },
    { value: "prefer-not-to-say", label: "Prefer not to say" },
  ];
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    state: "",
    residenceLGA: "",
    phone: "",
    dateOfBirth: "",
    gender: "",
    residenceAddress: "",
  });
  const [protectedForm, setProtectedForm] = useState({
    email: "",
    username: "",
    nationalId: "",
    voterCardNumber: "",
  });
  const [changeRequests, setChangeRequests] = useState([]);
  const [changeRequestsLoading, setChangeRequestsLoading] = useState(false);
  const [changeSubmitting, setChangeSubmitting] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const pendingDeletion = Boolean(user?.deletedAt);
  const purgeDate = user?.purgeAt ? new Date(user.purgeAt) : null;

  const formatStatus = (value) => {
    if (!value) return "-";
    const label = String(value).replace(/[_-]+/g, " ").toLowerCase();
    return label.replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const formatGender = (value) => {
    if (!value) return "-";
    const match = genderOptions.find((option) => option.value === String(value).toLowerCase());
    return match ? match.label : formatStatus(value);
  };

  const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toISOString().slice(0, 10);
  };

  // Your JSON might be {states:[{state, lgas}]} or { "Abia": [...] }. Normalize:
  const norm = useMemo(() => {
    if (Array.isArray(NG?.states)) return NG.states;
    if (!Array.isArray(NG)) {
      return Object.entries(NG || {}).map(([state, lgas]) => ({ state, lgas }));
    }
    return NG;
  }, []);
  const allStates = norm.map(x => x.state || x.name);
  const lgasForState = (form.state
    ? (norm.find(x => (x.state || x.name) === form.state)?.lgas || [])
    : []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const me = await jget("/api/profile/me"); // backend/profile.js -> GET /me (uses Users) :contentReference[oaicite:2]{index=2}
        if (!isMounted) return;
        setUser(me);
        if (typeof window !== "undefined") {
          localStorage.setItem("fullName", me.fullName || me.username || "");
          localStorage.setItem("state", me.state || "");
          localStorage.setItem("residenceLGA", me.residenceLGA || "");
          if (me.needsProfileCompletion) {
            localStorage.setItem("needsProfileCompletion", "true");
          } else {
            localStorage.removeItem("needsProfileCompletion");
          }
          if (me.firstName) {
            localStorage.setItem("firstName", me.firstName);
          }
          if (me.lastName) {
            localStorage.setItem("lastName", me.lastName);
          }
        }
        setForm({
          state: me.state || "",
          residenceLGA: me.residenceLGA || "",
          phone: me.phone || "",
          dateOfBirth: (me.dateOfBirth || "").slice(0, 10),
          gender: (me.gender || "").toLowerCase(),
          residenceAddress: me.residenceAddress || "",
        });
        loadChangeRequests({ silent: true });
      } catch (e) {
        notifyError(e.message || "Failed to load profile");
      }
    })();
    return () => (isMounted = false);
  }, []);

  const hasPendingProtectedRequest = useMemo(() => changeRequests.some((req) => req.status === "pending"), [changeRequests]);

  async function loadChangeRequests(options = {}) {
    const { silent = false } = options;
    if (!silent) setChangeRequestsLoading(true);
    try {
      const data = await jget("/api/profile/change-requests");
      setChangeRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      if (!silent) notifyError(err.message || "Unable to load change history");
      setChangeRequests([]);
    } finally {
      if (!silent) setChangeRequestsLoading(false);
    }
  }

  function updateProtectedField(key, value) {
    setProtectedForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submitProtectedChanges(e) {
    e?.preventDefault?.();
    if (changeSubmitting) return;
    const payload = {};
    const email = protectedForm.email.trim();
    const username = protectedForm.username.trim();
    const nationalId = protectedForm.nationalId.trim();
    const pvc = protectedForm.voterCardNumber.trim();
    if (email) payload.email = email;
    if (username) payload.username = username;
    if (nationalId) payload.nationalId = nationalId;
    if (pvc) payload.voterCardNumber = pvc;
    if (!Object.keys(payload).length) {
      notifyError("Enter at least one new value to request a change.");
      return;
    }
    setChangeSubmitting(true);
    try {
      await jpost("/api/profile/change-request", payload);
      notifySuccess("Change request submitted for review");
      setProtectedForm({ email: "", username: "", nationalId: "", voterCardNumber: "" });
      await loadChangeRequests({ silent: true });
    } catch (err) {
      notifyError(err.message || "Unable to submit request");
    } finally {
      setChangeSubmitting(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      await jput("/api/profile", {
        state: form.state || null,
        residenceLGA: form.residenceLGA || null,
        phone: form.phone ? form.phone.trim() : null,
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender || null,
        residenceAddress: form.residenceAddress ? form.residenceAddress.trim() : null,
      });
      notifySuccess("Profile updated");
      setEditing(false);
      const me = await jget("/api/profile/me");
      setUser(me);
      if (typeof window !== "undefined") {
        localStorage.setItem("fullName", me.fullName || me.username || "");
        localStorage.setItem("profilePhoto", me.profilePhoto || "/placeholder.png");
        localStorage.setItem("state", me.state || "");
        localStorage.setItem("residenceLGA", me.residenceLGA || "");
        window.dispatchEvent(new Event("storage"));
      }
    } catch (e) {
      notifyError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function scheduleDeletion(e) {
    e?.preventDefault?.();
    if (!deletePassword.trim()) {
      notifyError("Enter your password to continue.");
      return;
    }
    setDeleteBusy(true);
    try {
      await jpost("/api/profile/delete", { password: deletePassword.trim() });
      notifySuccess("Account scheduled for deletion");
      setDeletePassword("");
      const me = await jget("/api/profile/me");
      setUser(me);
    } catch (err) {
      notifyError(err.message || "Unable to schedule deletion");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function onPickAvatar(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/image\/(png|jpe?g)/i.test(f.type)) return notifyError("Only PNG/JPG allowed");
    const fd = new FormData();
    fd.append("file", f);
    try {
      const token = localStorage.getItem("token");
      const r = await fetch(`${api}/api/profile/photo`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      }); // backend/profile.js POST /photo -> saves /uploads/profile/... & Users.profilePhoto :contentReference[oaicite:4]{index=4}
      const j = await safeJson(r);
      if (!r.ok || !j?.url) throw new Error(j?.message || "Upload failed");
      notifySuccess("Photo updated");
      if (typeof window !== "undefined") {
        localStorage.setItem("profilePhoto", j.url || "/placeholder.png");
        window.dispatchEvent(new Event("storage"));
      }
      setUser(u => ({ ...u, profilePhoto: j.url }));
    } catch (e) {
      notifyError(e.message || "Upload failed");
    }
  }

  if (!user) return <div className="max-w-3xl mx-auto px-4 py-8">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="bg-white rounded-2xl shadow p-6 flex flex-col gap-5 sm:flex-row sm:items-center">
        <label className="relative cursor-pointer group">
          <img
            src={mediaUrl(user.profilePhoto)}
            className="w-24 h-24 rounded-full object-cover border border-white ring-2 ring-slate-200/70"
            alt={user.fullName}
            title="Click to change"
          />
          <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={onPickAvatar} />
          <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-full transition" />
        </label>
        <div className="text-center sm:text-left">
          <div className="text-2xl font-bold">{user.fullName}</div>
          <div className="text-gray-600">{user.username} • {user.email}</div>
          <div className="text-gray-500 text-sm">Joined {new Date(user.createdAt).toLocaleDateString()}</div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row">
          {!editing ? (
            <button onClick={() => setEditing(true)} className="btn-secondary w-full sm:w-auto">Edit</button>
          ) : (
            <>
              <button disabled={busy} onClick={save} className="btn-primary w-full disabled:opacity-60 sm:w-auto">Save</button>
              <button disabled={busy} onClick={() => { setEditing(false); }} className="btn-secondary w-full sm:w-auto">Cancel</button>
            </>
          )}
        </div>
      </div>

      {user.needsProfileCompletion && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="font-semibold text-amber-900">Profile information incomplete</div>
          <p className="mt-1">
            Provide your civic details to unlock every feature of the platform.
            <Link href="/complete-profile" className="ml-1 font-semibold text-amber-900 underline">Complete profile now</Link>
          </p>
        </div>
      )}

      {/* Only these fields are editable */}
      <div className="bg-white rounded-2xl shadow p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="First name" value={user.firstName || "-"} />
        <Field label="Last name" value={user.lastName || "-"} />
        <Field label="Username" value={user.username} />
        <Field label="Email" value={user.email} />
        <Field label="Eligibility status" value={formatStatus(user.eligibilityStatus)} />

        <Field label="Gender">
          {editing ? (
            <select
              className="form-control"
              value={form.gender}
              onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
            >
              <option value="">Select gender…</option>
              {genderOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : <span>{formatGender(user.gender)}</span>}
        </Field>

        <Field label="Date of birth">
          {editing ? (
            <input
              type="date"
              className="form-control"
              value={form.dateOfBirth}
              onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
            />
          ) : <span>{formatDate(user.dateOfBirth)}</span>}
        </Field>

        <Field label="Phone">
          {editing ? (
            <input
              className="form-control"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/[^0-9+()\s-]/g, "") }))}
              placeholder="+234 800 000 0000"
            />
          ) : <span>{user.phone || "-"}</span>}
        </Field>

        <Field label="State">
          {editing ? (
            <select className="form-control" value={form.state} onChange={e=>setForm(f=>({ ...f, state: e.target.value, residenceLGA: "" }))}>
              <option value="">Select state…</option>
              {allStates.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : <span>{user.state || "-"}</span>}
        </Field>

        <Field label="LGA">
          {editing ? (
            <select className="form-control" value={form.residenceLGA} onChange={e=>setForm(f=>({ ...f, residenceLGA: e.target.value }))} disabled={!form.state}>
              <option value="">{form.state ? "Select LGA…" : "Pick state first"}</option>
              {lgasForState.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          ) : <span>{user.residenceLGA || "-"}</span>}
        </Field>

        <Field label="Residential address" className="md:col-span-2">
          {editing ? (
            <textarea
              className="form-control"
              rows={2}
              value={form.residenceAddress}
              onChange={(e) => setForm((f) => ({ ...f, residenceAddress: e.target.value.replace(/[^A-Za-z0-9\s,.'/-]/g, "") }))}
              placeholder="House number, street, town"
            />
          ) : <span>{user.residenceAddress || "-"}</span>}
        </Field>

        <Field label="Nationality" value={user.nationality || "Nigerian"} />
        <Field label="National ID (NIN)" value={user.nationalId || "-"} />
        <Field label="PVC number" value={user.voterCardNumber || "-"} />
      </div>

      <div className="bg-white rounded-2xl shadow p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Request protected changes</h2>
          <p className="mt-1 text-sm text-slate-500">
            Email, username, National ID, and PVC updates require a super admin to approve them. Submit the details you want to change and we’ll notify you once they’re reviewed.
          </p>
        </div>
        {hasPendingProtectedRequest && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            You already have a request awaiting review. You can send a new one after it is approved or rejected.
          </div>
        )}
        <form className="grid gap-3 md:grid-cols-2" onSubmit={submitProtectedChanges}>
          <div>
            <label className="form-label" htmlFor="protected-email">New email</label>
            <input
              id="protected-email"
              type="email"
              className="form-control"
              placeholder={user.email || "Current email"}
              value={protectedForm.email}
              onChange={(e) => updateProtectedField("email", e.target.value)}
              disabled={hasPendingProtectedRequest || changeSubmitting}
            />
          </div>
          <div>
            <label className="form-label" htmlFor="protected-username">New username</label>
            <input
              id="protected-username"
              className="form-control"
              placeholder={user.username || "Current username"}
              value={protectedForm.username}
              onChange={(e) => updateProtectedField("username", e.target.value)}
              disabled={hasPendingProtectedRequest || changeSubmitting}
            />
          </div>
          <div>
            <label className="form-label" htmlFor="protected-nin">New National ID (5 digits)</label>
            <input
              id="protected-nin"
              className="form-control"
              placeholder={user.nationalId || "Current NIN"}
              value={protectedForm.nationalId}
              onChange={(e) => updateProtectedField("nationalId", e.target.value.replace(/[^0-9]/g, ""))}
              maxLength={5}
              disabled={hasPendingProtectedRequest || changeSubmitting}
            />
          </div>
          <div>
            <label className="form-label" htmlFor="protected-pvc">New PVC (1 letter + 2 digits)</label>
            <input
              id="protected-pvc"
              className="form-control"
              placeholder={user.voterCardNumber || "Current PVC"}
              value={protectedForm.voterCardNumber}
              onChange={(e) => updateProtectedField("voterCardNumber", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              maxLength={3}
              disabled={hasPendingProtectedRequest || changeSubmitting}
            />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button type="submit" className="btn-primary px-4 py-2 text-sm disabled:opacity-50" disabled={hasPendingProtectedRequest || changeSubmitting}>
              {changeSubmitting ? "Sending…" : "Submit request"}
            </button>
          </div>
        </form>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Recent requests</h3>
          {changeRequestsLoading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">Loading history…</div>
          ) : changeRequests.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">No recorded requests yet.</div>
          ) : (
            <ul className="space-y-2 text-xs text-slate-600">
              {changeRequests.map((request) => {
                const status = String(request.status || "pending").toLowerCase();
                const tone = status === "approved" ? "text-emerald-600" : status === "rejected" ? "text-rose-600" : "text-amber-600";
                return (
                  <li key={request.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`text-[11px] font-semibold uppercase tracking-wide ${tone}`}>{status}</span>
                      <span className="text-[11px] text-slate-400">{new Date(request.createdAt).toLocaleString()}</span>
                    </div>
                    <ul className="mt-2 grid gap-1 text-slate-700 md:grid-cols-2">
                      {Object.entries(request.fields || {}).map(([key, value]) => (
                        <li key={key} className="break-words">
                          <span className="font-semibold text-slate-500">{key}:</span> {value || "(cleared)"}
                        </li>
                      ))}
                    </ul>
                    {request.notes && (
                      <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                        Note: {request.notes}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Change password card (link to /reset-password flow you described) */}
      <div className="bg-white rounded-2xl shadow p-6">
        <div className="font-semibold mb-2">Security</div>
        <a className="text-blue-600 hover:underline" href="/reset-password">Change / Reset password</a>
      </div>

      <div className="bg-white rounded-2xl shadow p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Delete account</h2>
          <p className="mt-1 text-sm text-slate-500">Schedule permanent removal of your profile. We keep the data for 30 days so you can change your mind.</p>
        </div>
        {pendingDeletion ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-700">
            <p>Your account will be purged on {purgeDate ? purgeDate.toLocaleString() : "the next removal run"}.</p>
            <p className="mt-1">Use the restore form on the sign-in page with your username, date of birth, and password to reactivate it before that date.</p>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={scheduleDeletion}>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-600" htmlFor="delete-password">Confirm with password</label>
              <input
                id="delete-password"
                type="password"
                className="form-control"
                placeholder="Current password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
              />
            </div>
            <p className="text-xs text-slate-500">After confirmation the account enters a 30 day pending state. You can restore it using your username, date of birth, and password.</p>
            <button type="submit" disabled={deleteBusy} className="btn-primary w-full disabled:opacity-60 sm:w-auto">
              {deleteBusy ? "Scheduling…" : "Schedule deletion"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, children, className = "" }) {
  return (
    <div className={className}>
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
      {children ? children : <div className="mt-1 text-sm font-medium text-slate-900">{value ?? "-"}</div>}
    </div>
  );
}
