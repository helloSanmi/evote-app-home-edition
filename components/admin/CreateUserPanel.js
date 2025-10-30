import { useMemo, useState } from "react";

export default function CreateUserPanel({
  newUserForm,
  onFieldChange,
  onSubmit,
  creatingUser,
  stateOptions = [],
  viewerRole = "super-admin",
  viewerState = "",
}) {
  const [showPassword, setShowPassword] = useState(false);
  const states = useMemo(() => (Array.isArray(stateOptions) ? stateOptions : []), [stateOptions]);
  const selectedState = newUserForm.state || (viewerRole === "admin" ? viewerState || "" : newUserForm.state);
  const lgaOptions = useMemo(() => {
    if (!selectedState) return [];
    const match = states.find((entry) => (entry.label || "").toLowerCase() === selectedState.toLowerCase());
    return Array.isArray(match?.lgas) ? match.lgas : [];
  }, [states, selectedState]);

  const handleStateChange = (value) => {
    onFieldChange("state", value);
    onFieldChange("residenceLGA", "");
  };

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="form-label" htmlFor="new-fullname">Full name</label>
          <input
            id="new-fullname"
            className="form-control"
            value={newUserForm.fullName}
            onChange={(e) => onFieldChange("fullName", e.target.value)}
            placeholder="Jane Doe"
          />
        </div>
        <div>
          <label className="form-label" htmlFor="new-username">Username</label>
          <input
            id="new-username"
            className="form-control"
            value={newUserForm.username}
            onChange={(e) => onFieldChange("username", e.target.value)}
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
            onChange={(e) => onFieldChange("email", e.target.value)}
            placeholder="jane@mail.com"
          />
        </div>
        <div>
          <label className="form-label" htmlFor="new-phone">Phone (optional)</label>
          <input
            id="new-phone"
            className="form-control"
            value={newUserForm.phone}
            onChange={(e) => onFieldChange("phone", e.target.value)}
            placeholder="0803..."
          />
        </div>
        <div>
          <label className="form-label" htmlFor="new-state">State</label>
          <select
            id="new-state"
            className="form-control"
            value={selectedState}
            onChange={(e) => handleStateChange(e.target.value)}
            disabled={viewerRole !== "super-admin"}
          >
            <option value="">Select state…</option>
            {states.map((state) => (
              <option key={state.label} value={state.label}>{state.label}</option>
            ))}
          </select>
          {viewerRole === "admin" && viewerState && (
            <p className="mt-1 text-xs text-slate-500">Assigned to {viewerState}. Contact a super admin to change.</p>
          )}
        </div>
        <div>
          <label className="form-label" htmlFor="new-lga">Residence LGA</label>
          <select
            id="new-lga"
            className="form-control"
            value={newUserForm.residenceLGA}
            onChange={(e) => onFieldChange("residenceLGA", e.target.value)}
            disabled={!selectedState}
          >
            <option value="">Select LGA…</option>
            {lgaOptions.map((lga) => (
              <option key={lga} value={lga}>{lga}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="form-label" htmlFor="new-password">Temporary password</label>
        <div className="relative flex">
          <input
            id="new-password"
            type={showPassword ? "text" : "password"}
            className="form-control pr-24"
            value={newUserForm.password}
            onChange={(e) => onFieldChange("password", e.target.value)}
            placeholder="Minimum 8 characters"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute inset-y-0 right-0 flex items-center rounded-r-lg bg-transparent px-3 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      <div>
        <span className="form-label">Role</span>
        <div className="mt-2 flex gap-2">
          {[{ value: "user", label: "User" }, { value: "admin", label: "Admin" }].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onFieldChange("role", option.value)}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
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
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button type="submit" className="btn-primary w-full sm:w-auto" disabled={creatingUser}>
          {creatingUser ? "Creating…" : "Create user"}
        </button>
      </div>
    </form>
  );
}
