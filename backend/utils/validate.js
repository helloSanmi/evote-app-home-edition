// backend/utils/validate.js
function isHttpUrl(s) {
    try { const u = new URL(s); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; }
  }
  function err(code, message, http = 400) {
    const e = new Error(message);
    e.http = http; e.payload = { error: { code, message } };
    return e;
  }
  function asString(x, field) {
    if (typeof x !== "string" || !x.trim()) throw err("MISSING_FIELD", `Field '${field}' is required`);
    return x.trim();
  }
  function asArray(x, field) {
    if (!Array.isArray(x)) throw err("INVALID_TYPE", `Field '${field}' must be an array`);
    return x;
  }
  function buildUserProfile({ userId, name, profilePicture, state, localGovernment, role, registeredElections }) {
    userId = asString(userId, "userId");
    name = asString(name, "name");
    profilePicture = asString(profilePicture, "profilePicture");
    if (!isHttpUrl(profilePicture)) throw err("URL_VALIDATION_FAILED", "Field 'profilePicture' must be a valid, publicly accessible URL.");
    state = asString(state, "state");
    localGovernment = asString(localGovernment, "localGovernment");
    role = asString(role, "role").toLowerCase();
    if (role !== "admin" && role !== "user") throw err("INVALID_ROLE", "Field 'role' must be 'admin' or 'user'.");
    registeredElections = asArray(registeredElections ?? [], "registeredElections");
    return { userId, name, profilePicture, state, localGovernment, role, registeredElections };
  }
  function buildElection({ electionId, scope, state, localGovernment, eligibleVoterIds, status }) {
    electionId = asString(electionId, "electionId");
    scope = asString(scope, "scope");
    if (!["national", "state", "localGovernment"].includes(scope)) {
      throw err("INVALID_TYPE", "Field 'scope' must be 'national' | 'state' | 'localGovernment'");
    }
    if (scope === "state") state = asString(state, "state");
    if (scope === "localGovernment") localGovernment = asString(localGovernment, "localGovernment");
    eligibleVoterIds = asArray(eligibleVoterIds ?? [], "eligibleVoterIds");
    status = asString(status, "status");
    if (!["open", "closed", "upcoming"].includes(status)) throw err("INVALID_TYPE", "Field 'status' must be 'open'|'closed'|'upcoming'");
    return { electionId, scope, ...(scope==="state"&&{state}), ...(scope==="localGovernment"&&{localGovernment}), eligibleVoterIds, status };
  }
  module.exports = { isHttpUrl, err, buildUserProfile, buildElection };
  