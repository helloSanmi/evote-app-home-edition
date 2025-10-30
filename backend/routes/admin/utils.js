const { q, getConn } = require("../../db");
const { notify } = require("../../utils/notifications");
const { NATIONAL_ID_PATTERN, PVC_PATTERN } = require("../../utils/identity");

const AUTH_STATUS = (process.env.AUTH_STATUS || "on").trim().toLowerCase();
const EMAIL_VERIFICATION_ENABLED = AUTH_STATUS !== "off";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,40}$/;

const toKey = (value) => (value || "").trim().toLowerCase();

const actorLabel = (user) => {
  if (!user) return "An admin";
  if (user.username) return user.username;
  if (user.email) return user.email;
  if (user.id) return `Admin #${user.id}`;
  return "An admin";
};

function safeJsonParse(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function makeHttpError(status, code, message) {
  const err = new Error(message || code || "Request failed");
  err.status = status;
  err.code = code;
  return err;
}

function periodMatchesScope(scope, period) {
  if (!period || typeof period !== "object") return false;
  if (scope.isSuper) return true;
  const adminKey = toKey(scope.state);
  if (!adminKey) return false;
  const periodScope = (period.scope || "national").toLowerCase();
  if (periodScope === "national") return false;
  const periodState = toKey(period.scopeState);
  if (!periodState || periodState !== adminKey) return false;
  return true;
}

function userMatchesScope(scope, user) {
  if (!user || typeof user !== "object") return false;
  if (scope.isSuper) return true;
  return toKey(user.state) === toKey(scope.state);
}

function candidateMatchesScope(scope, candidate) {
  if (!candidate || typeof candidate !== "object") return false;
  if (scope.isSuper) return true;
  return toKey(candidate.state) === toKey(scope.state);
}

async function resolveAdminScope(req) {
  if (req._adminScope) return req._adminScope;
  const role = (req.user?.role || "").toLowerCase();
  if (role === "super-admin") {
    req._adminScope = { isSuper: true, state: null };
    return req._adminScope;
  }
  const [[row]] = await q(`SELECT state FROM Users WHERE id=? LIMIT 1`, [req.user.id]);
  const state = (row?.state || "").trim();
  if (!state) {
    const err = new Error("ADMIN_SCOPE_REQUIRED");
    err.status = 403;
    err.code = "ADMIN_SCOPE_REQUIRED";
    err.message = "Admin account is missing an assigned state.";
    throw err;
  }
  req._adminScope = { isSuper: false, state };
  return req._adminScope;
}

async function validateProfileChangeFields(userId, fields, conn = null) {
  const exec = async (sql, params = []) => (conn ? conn.execute(sql, params) : q(sql, params));

  const [[user]] = await exec(
    `SELECT id, email, username, nationalId, voterCardNumber FROM Users WHERE id=?`,
    [userId]
  );
  if (!user) {
    throw makeHttpError(404, "NOT_FOUND", "User not found");
  }

  const updates = {};

  if (Object.prototype.hasOwnProperty.call(fields, "email")) {
    const trimmed = String(fields.email || "").trim();
    if (!trimmed || !EMAIL_PATTERN.test(trimmed)) {
      throw makeHttpError(400, "INVALID_EMAIL", "Provide a valid email address.");
    }
    if (trimmed.toLowerCase() !== String(user.email || "").toLowerCase()) {
      const [[dup]] = await exec(`SELECT id FROM Users WHERE email=? AND id<>? LIMIT 1`, [trimmed, userId]);
      if (dup) {
        throw makeHttpError(409, "EMAIL_TAKEN", "Another account already uses this email.");
      }
      updates.email = trimmed;
      updates.emailVerifiedAt = new Date();
      updates.activationToken = null;
      updates.activationExpires = null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(fields, "username")) {
    const trimmed = String(fields.username || "").trim();
    if (!USERNAME_PATTERN.test(trimmed)) {
      throw makeHttpError(400, "INVALID_USERNAME", "Username must be 3-40 characters using letters, numbers, or _.-");
    }
    if (trimmed.toLowerCase() !== String(user.username || "").toLowerCase()) {
      const [[dup]] = await exec(`SELECT id FROM Users WHERE username=? AND id<>? LIMIT 1`, [trimmed, userId]);
      if (dup) {
        throw makeHttpError(409, "USERNAME_TAKEN", "This username is already taken.");
      }
      updates.username = trimmed;
    }
  }

  if (Object.prototype.hasOwnProperty.call(fields, "nationalId")) {
    const trimmed = String(fields.nationalId || "").replace(/\s+/g, "");
    if (!trimmed || !NATIONAL_ID_PATTERN.test(trimmed)) {
      throw makeHttpError(400, "INVALID_NIN", "National Identification Number must be 5 digits.");
    }
    if (trimmed !== String(user.nationalId || "")) {
      const [[dup]] = await exec(`SELECT id FROM Users WHERE nationalId=? AND id<>? LIMIT 1`, [trimmed, userId]);
      if (dup) {
        throw makeHttpError(409, "NIN_TAKEN", "This National ID is already registered.");
      }
      updates.nationalId = trimmed;
    }
  }

  if (Object.prototype.hasOwnProperty.call(fields, "voterCardNumber")) {
    const trimmed = String(fields.voterCardNumber || "").replace(/\s+/g, "").toUpperCase();
    if (!trimmed || !PVC_PATTERN.test(trimmed)) {
      throw makeHttpError(400, "INVALID_PVC", "PVC must start with one letter followed by two digits.");
    }
    if (trimmed !== String(user.voterCardNumber || "")) {
      const [[dup]] = await exec(`SELECT id FROM Users WHERE voterCardNumber=? AND id<>? LIMIT 1`, [trimmed, userId]);
      if (dup) {
        throw makeHttpError(409, "PVC_TAKEN", "This PVC number is already registered.");
      }
      updates.voterCardNumber = trimmed;
    }
  }

  if (!Object.keys(updates).length) {
    throw makeHttpError(400, "NO_CHANGES", "No new changes to apply.");
  }

  return { updates };
}

async function notifyAdminAction(io, req, event) {
  if (!io || !event) return;
  try {
    await notify(io, {
      audience: "admin",
      ...event,
      metadata: {
        ...(event.metadata || {}),
        actorId: req.user?.id || null,
        actorUsername: req.user?.username || null,
        actorEmail: req.user?.email || null,
      },
    });
  } catch (err) {
    console.error("admin notify action:", err);
  }
}

module.exports = {
  q,
  getConn,
  AUTH_STATUS,
  EMAIL_VERIFICATION_ENABLED,
  EMAIL_PATTERN,
  USERNAME_PATTERN,
  actorLabel,
  safeJsonParse,
  toKey,
  periodMatchesScope,
  userMatchesScope,
  candidateMatchesScope,
  resolveAdminScope,
  validateProfileChangeFields,
  notifyAdminAction,
};
