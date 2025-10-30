import { mediaUrl } from "../../lib/mediaUrl";

export default function UsersListPanel({
  viewerRole,
  viewerState,
  users,
  usersLoading,
  userSearch,
  userTotal,
  onSearchChange,
  onRefresh,
  onExport,
  onSetPendingAction,
  statusBadgeTone,
  roleBadgeTone,
  formatDateValue,
  formatCountdown,
  onUpdateRole,
  updatingRoleId,
  onResetPassword,
  stateOptions = [],
  stateFilter = "",
  onStateFilterChange,
  lgaFilter = "",
  onLgaFilterChange,
}) {
  const normalizedStates = Array.isArray(stateOptions) ? stateOptions : [];
  const activeStateLabel = stateFilter || (viewerRole === "admin" ? viewerState || "" : "");
  const activeState = normalizedStates.find((entry) => (entry.label || "").toLowerCase() === (activeStateLabel || "").toLowerCase());
  const lgaOptions = Array.isArray(activeState?.lgas) ? activeState.lgas : [];
  const handleStateChange = (value) => {
    if (onStateFilterChange) onStateFilterChange(value);
    if (onLgaFilterChange) onLgaFilterChange("");
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <input
              type="search"
              className="form-control pr-12 text-sm"
              placeholder="Search name, email, or username"
              value={userSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search users"
            />
            {userSearch && (
              <button
                type="button"
                className="absolute inset-y-0 right-3 flex items-center text-[11px] font-semibold text-slate-400 hover:text-slate-600"
                onClick={() => onSearchChange("")}
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <select
                className="form-control w-44 text-xs"
                value={activeStateLabel}
                onChange={(e) => handleStateChange(e.target.value)}
                disabled={viewerRole !== "super-admin"}
              >
                <option value="">All states</option>
                {normalizedStates.map((state) => (
                  <option key={state.label} value={state.label}>{state.label}</option>
                ))}
              </select>
              <select
                className="form-control w-44 text-xs"
                value={lgaFilter}
                onChange={(e) => onLgaFilterChange?.(e.target.value)}
                disabled={!activeStateLabel}
              >
                <option value="">All LGAs</option>
                {lgaOptions.map((lga) => (
                  <option key={lga} value={lga}>{lga}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onRefresh} className="btn-secondary px-4 py-2 text-xs">
                Refresh
              </button>
              <button type="button" onClick={onExport} className="btn-primary px-4 py-2 text-xs">
                Export CSV
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>Showing {users.length} of {userTotal} users</span>
          {viewerRole === "admin" && viewerState && (
            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              State scope: {viewerState}
            </span>
          )}
        </div>
      </div>

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
            const avatar = mediaUrl(user.profilePhoto || "/placeholder.png");
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
                        e.currentTarget.src = "/placeholder.png";
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-slate-900">{user.fullName || user.username || "Unknown user"}</h3>
                        <span className={`inline-flex items-center rounded-md px-3 py-1 text-[11px] font-semibold ${roleBadgeTone(targetRole)}`}>
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
                    <span className={`inline-flex items-center rounded-md px-3 py-1 ${statusBadgeTone(statusKey)}`}>
                      {statusLabel}
                    </span>
                    {user.state && (
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-3 py-1 text-slate-600">
                        {user.state}{user.residenceLGA ? ` • ${user.residenceLGA}` : ""}
                      </span>
                    )}
                    {user.dateOfBirth && (
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-3 py-1 text-slate-600">
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
                      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500">
                        <span>Role</span>
                        <button
                          type="button"
                          disabled={roleBusy || targetRole === "admin"}
                          onClick={() => onUpdateRole(user, "admin")}
                          className={`rounded-lg px-3 py-1 transition ${
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
                          onClick={() => onUpdateRole(user, "user")}
                          className={`rounded-lg px-3 py-1 transition ${
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
                          onClick={() => onSetPendingAction({ type: disabled ? "user-enable" : "user-disable", user })}
                          className={`inline-flex items-center rounded-lg border px-3 py-1 text-xs font-semibold transition ${
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
                          onClick={() => onSetPendingAction({ type: "user-delete", user })}
                          className="inline-flex items-center rounded-lg border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                          disabled={roleBusy}
                        >
                          Delete
                        </button>
                      </>
                    ) : (
                      <span className="rounded-lg bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500">
                        Protected account
                      </span>
                    )}
                    {canReset && (
                      <button
                        type="button"
                        onClick={() => onResetPassword(user)}
                        disabled={roleBusy}
                        className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
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
  );
}
