import { useEffect, useMemo, useRef, useState } from "react";
import NG from "../public/ng-states-lgas.json";
import { api, jget, jpost, jput, safeJson } from "../lib/apiBase";
import { mediaUrl } from "../lib/mediaUrl";
import { notifyError, notifySuccess } from "../components/Toast";

export default function Profile() {
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ state: "", residenceLGA: "", phone: "", dateOfBirth: "" });
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const pendingDeletion = Boolean(user?.deletedAt);
  const purgeDate = user?.purgeAt ? new Date(user.purgeAt) : null;

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
        }
        setForm({
          state: me.state || "",
          residenceLGA: me.residenceLGA || "",
          phone: me.phone || "",
          dateOfBirth: (me.dateOfBirth || "").slice(0, 10),
        });
      } catch (e) {
        notifyError(e.message || "Failed to load profile");
      }
    })();
    return () => (isMounted = false);
  }, []);

  async function save() {
    setBusy(true);
    try {
      await jput("/api/profile", {
        fullName: user.fullName, // unchanged
        state: form.state || null,
        residenceLGA: form.residenceLGA || null,
        phone: form.phone || null,
        dateOfBirth: form.dateOfBirth || null,
      }); // backend/profile.js PUT / (updates Users) :contentReference[oaicite:3]{index=3}
      notifySuccess("Profile updated");
      setEditing(false);
      const me = await jget("/api/profile/me");
      setUser(me);
      if (typeof window !== "undefined") {
        localStorage.setItem("fullName", me.fullName || me.username || "");
        localStorage.setItem("profilePhoto", me.profilePhoto || "/avatar.png");
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
        localStorage.setItem("profilePhoto", j.url || "/avatar.png");
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
      <div className="bg-white rounded-2xl shadow p-6 flex items-center gap-5">
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
        <div>
          <div className="text-2xl font-bold">{user.fullName}</div>
          <div className="text-gray-600">{user.username} • {user.email}</div>
          <div className="text-gray-500 text-sm">Joined {new Date(user.createdAt).toLocaleDateString()}</div>
        </div>
        <div className="ml-auto">
          {!editing ? (
            <button onClick={() => setEditing(true)} className="btn-secondary">Edit</button>
          ) : (
            <div className="flex gap-2">
              <button disabled={busy} onClick={save} className="btn-primary disabled:opacity-60">Save</button>
              <button disabled={busy} onClick={() => { setEditing(false); }} className="btn-secondary">Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* Only these fields are editable */}
      <div className="bg-white rounded-2xl shadow p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Full name" value={user.fullName} />
        <Field label="Username" value={user.username} />
        <Field label="Email" value={user.email} />

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

        <Field label="Phone">
          {editing ? (
            <input className="form-control" value={form.phone} onChange={e=>setForm(f=>({ ...f, phone: e.target.value }))}/>
          ) : <span>{user.phone || "-"}</span>}
        </Field>

        <Field label="Date of birth">
          {editing ? (
            <input type="date" className="form-control" value={form.dateOfBirth} onChange={e=>setForm(f=>({ ...f, dateOfBirth: e.target.value }))}/>
          ) : <span>{(user.dateOfBirth || "").slice(0,10) || "-"}</span>}
        </Field>
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
            <button type="submit" disabled={deleteBusy} className="btn-primary disabled:opacity-60">
              {deleteBusy ? "Scheduling…" : "Schedule deletion"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, children }) {
  return (
    <div>
      <div className="text-xs text-gray-600">{label}</div>
      {children ? children : <div className="font-medium">{value ?? "-"}</div>}
    </div>
  );
}
