const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createRemoteJWKSet, jwtVerify } = require("jose");
const crypto = require("node:crypto");
const { q } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { recordAuditEvent } = require("../utils/audit");
const { restoreAccount } = require("../utils/retention");
const emailService = require("../services/emailService");
const {
  NAME_PART_PATTERN,
  FULL_NAME_PATTERN,
  PHONE_PATTERN,
  NATIONAL_ID_PATTERN,
  PVC_PATTERN,
  ALLOWED_GENDERS,
  sanitizeSpacing,
  normalizeLocale,
  normalizePhone,
  normalizeAddress,
  validateDob,
  requiresProfileCompletion,
  deriveNameParts,
} = require("../utils/identity");

const router = express.Router();
const sign = (u) => jwt.sign(
  { id: u.id, username: u.username, email: u.email, role: u.role },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || "1h" }
);

const normalizeRole = (user) => {
  const envUsernames = new Set((process.env.ADMIN_USERNAMES || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  const envEmails = new Set((process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  const username = (user.username || "").toLowerCase();
  const email = (user.email || "").toLowerCase();

  let role = (user.role || "").toLowerCase();
  if (!role) role = user.isAdmin ? "admin" : "user";
  if (role !== "super-admin" && user.isAdmin && role !== "admin") role = "admin";
  if (envUsernames.has(username) || envEmails.has(email)) role = "super-admin";
  if (!["super-admin", "admin", "user"].includes(role)) role = "user";
  return role;
};

function decodeGoogleToken(idToken) {
  if (typeof idToken !== "string" || !idToken.includes(".")) {
    throw new Error("Invalid Google credential");
  }
  const parts = idToken.split(".");
  if (parts.length < 2) throw new Error("Invalid Google credential");
  const decode = (segment) => {
    const padded = segment.padEnd(segment.length + (4 - (segment.length % 4)) % 4, "=");
    const buffer = Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    return JSON.parse(buffer.toString("utf8"));
  };
  const header = decode(parts[0]);
  const payload = decode(parts[1]);
  if (!payload || !payload.email) throw new Error("Google credential missing profile details");
  return { header, payload };
}

const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,40}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AZURE_TENANT_ID = (process.env.AZURE_AD_TENANT_ID || "").trim();
const AZURE_CLIENT_ID = (process.env.AZURE_AD_CLIENT_ID || "").trim();
const parseList = (value = "") =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
const toLowerSet = (list = []) => new Set(list.map((value) => value.toLowerCase()));
const DEFAULT_SUPER_ROLE_IDS = ["62e90394-69f5-4237-9190-012177145e10"];
const azureSuperRoleIds = toLowerSet([...DEFAULT_SUPER_ROLE_IDS, ...parseList(process.env.AZURE_AD_SUPER_ADMIN_IDS || process.env.AZURE_AD_SUPER_ADMIN_ROLE_IDS || "")]);
const azureAdminRoleIds = toLowerSet(parseList(process.env.AZURE_AD_ADMIN_IDS || process.env.AZURE_AD_ADMIN_ROLE_IDS || ""));
const azureSuperRoleNames = toLowerSet(["company administrator", "global administrator", ...parseList(process.env.AZURE_AD_SUPER_ADMIN_ROLE_NAMES || "")]);
const azureAdminRoleNames = toLowerSet(parseList(process.env.AZURE_AD_ADMIN_ROLE_NAMES || ""));
const azureSuperEmails = toLowerSet(parseList(process.env.AZURE_AD_SUPER_ADMIN_EMAILS || ""));
const azureAdminEmails = toLowerSet(parseList(process.env.AZURE_AD_ADMIN_EMAILS || ""));

let azureJwks = null;
const getAzureJwks = () => {
  if (!azureJwks) {
    if (!AZURE_TENANT_ID) throw new Error("AZURE_AD_TENANT_ID not configured");
    azureJwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${AZURE_TENANT_ID}/discovery/v2.0/keys`));
  }
  return azureJwks;
};

const flattenLower = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((item) => flattenLower(item));
  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => flattenLower(item));
  }
  return [String(value).toLowerCase()];
};

const ROLE_PRIORITY = { user: 1, admin: 2, "super-admin": 3 };

const AUTH_STATUS = (process.env.AUTH_STATUS || "on").trim().toLowerCase();
const EMAIL_VERIFICATION_ENABLED = AUTH_STATUS !== "off";

async function verifyMicrosoftIdToken(idToken) {
  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID) {
    throw new Error("MICROSOFT_NOT_CONFIGURED");
  }
  const { payload } = await jwtVerify(idToken, getAzureJwks(), {
    issuer: `https://login.microsoftonline.com/${AZURE_TENANT_ID}/v2.0`,
    audience: AZURE_CLIENT_ID,
  });
  const tenant = (payload.tid || payload.tenantId || "").toLowerCase();
  if (tenant && AZURE_TENANT_ID && tenant !== AZURE_TENANT_ID.toLowerCase()) {
    throw new Error("TOKEN_TENANT_MISMATCH");
  }
  return payload;
}

function deriveAzureRole(payload = {}, emailLower = "") {
  const widValues = flattenLower(payload.wids);
  if (widValues.some((id) => azureSuperRoleIds.has(id))) return "super-admin";
  if (widValues.length && (azureAdminRoleIds.size === 0 || widValues.some((id) => azureAdminRoleIds.has(id)))) return "admin";

  const rawRoleClaims = [
    payload.roles,
    payload.role,
    payload["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"],
    payload["http://schemas.microsoft.com/ws/2008/06/identity/claims/roles"],
  ];
  const roleNames = flattenLower(rawRoleClaims);
  const normalizedRoleTokens = new Set(roleNames.map((name) => name.replace(/[^a-z]/g, "")));

  if (normalizedRoleTokens.has("companyadministrator") || normalizedRoleTokens.has("globaladministrator")) {
    return "super-admin";
  }

  if (roleNames.some((name) => azureSuperRoleNames.has(name))) return "super-admin";
  if (roleNames.some((name) => azureAdminRoleNames.has(name))) return "admin";
  if (roleNames.some((name) => name.includes("global administrator") || name.includes("company administrator"))) {
    return "super-admin";
  }
  if (roleNames.some((name) => name.includes("admin"))) return "admin";

  if (emailLower) {
    if (azureSuperEmails.has(emailLower)) return "super-admin";
    if (azureAdminEmails.has(emailLower)) return "admin";
  }

  return widValues.length ? "admin" : "user";
}

// Register
router.post("/register", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      fullName,
      username,
      email,
      password,
      state,
      residenceLGA,
      phone,
      nationality,
      dateOfBirth,
      gender,
      nationalId,
      voterCardNumber,
      residenceAddress,
    } = req.body || {};

    if (!firstName || !lastName || !username || !email || !password || !dateOfBirth || !gender || !nationalId || !voterCardNumber || !residenceAddress) {
      return res.status(400).json({ error: "MISSING_FIELDS", message: "All required fields must be provided." });
    }
    const rawFirst = sanitizeSpacing(firstName);
    const rawLast = sanitizeSpacing(lastName);
    if (!NAME_PART_PATTERN.test(rawFirst)) {
      return res.status(400).json({ error: "INVALID_NAME", message: "First name contains invalid characters." });
    }
    if (!NAME_PART_PATTERN.test(rawLast)) {
      return res.status(400).json({ error: "INVALID_NAME", message: "Last name contains invalid characters." });
    }

    const safeFullName = sanitizeSpacing(fullName || `${rawFirst} ${rawLast}`);
    if (!FULL_NAME_PATTERN.test(safeFullName)) {
      return res.status(400).json({ error: "INVALID_NAME", message: "Full name contains invalid characters." });
    }

    const safeUsername = String(username).trim();
    if (!USERNAME_PATTERN.test(safeUsername)) {
      return res.status(400).json({ error: "INVALID_USERNAME", message: "Username must be 3-40 characters using letters, numbers, or _ . -" });
    }

    const safeEmail = String(email).trim().toLowerCase();
    if (!EMAIL_PATTERN.test(safeEmail)) {
      return res.status(400).json({ error: "INVALID_EMAIL", message: "Provide a valid email address." });
    }

    const dobCheck = validateDob(dateOfBirth);
    if (!dobCheck.ok) {
      return res.status(400).json({ error: "INVALID_DOB", message: dobCheck.message });
    }
    const normalizedGender = String(gender).toLowerCase();
    if (!ALLOWED_GENDERS.has(normalizedGender)) {
      return res.status(400).json({ error: "INVALID_GENDER", message: "Select a valid gender option." });
    }

    const sanitizedNationalId = String(nationalId).replace(/\s+/g, "");
    if (!NATIONAL_ID_PATTERN.test(sanitizedNationalId)) {
      return res.status(400).json({ error: "INVALID_NIN", message: "National Identification Number must be 5 digits." });
    }

    const sanitizedVoterCard = String(voterCardNumber).replace(/\s+/g, "").toUpperCase();
    if (!PVC_PATTERN.test(sanitizedVoterCard)) {
      return res.status(400).json({ error: "INVALID_PVC", message: "Permanent Voter Card number must start with one letter followed by two digits." });
    }

    const safeAddress = normalizeAddress(residenceAddress);
    if (!safeAddress || safeAddress.length < 10) {
      return res.status(400).json({ error: "INVALID_ADDRESS", message: "Residential address must be at least 10 characters long." });
    }

    const safePhone = normalizePhone(phone);
    if (phone && (!safePhone || !PHONE_PATTERN.test(safePhone))) {
      return res.status(400).json({ error: "INVALID_PHONE", message: "Phone number contains invalid characters." });
    }

    const safeState = normalizeLocale(state);
    const safeLga = normalizeLocale(residenceLGA);
    const safeNationality = normalizeLocale(nationality) || "Nigerian";

    const hash = await bcrypt.hash(String(password), 10);
    const activationToken = EMAIL_VERIFICATION_ENABLED ? crypto.randomUUID() : null;
    const activationExpires = EMAIL_VERIFICATION_ENABLED ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
    const [result] = await q(
      `INSERT INTO Users (fullName, firstName, lastName, username, email, password, state, residenceLGA, phone, nationality, dateOfBirth, gender, nationalId, voterCardNumber, residenceAddress, role, eligibilityStatus, hasVoted, activationToken, activationExpires, emailVerifiedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'user','pending',0,?,?,?)`,
      [
        safeFullName,
        rawFirst,
        rawLast,
        safeUsername,
        safeEmail,
        hash,
        safeState,
        safeLga,
        safePhone,
        safeNationality,
        dobCheck.value,
        normalizedGender,
        sanitizedNationalId,
        sanitizedVoterCard,
        safeAddress,
        activationToken,
        activationExpires,
        EMAIL_VERIFICATION_ENABLED ? null : new Date(),
      ]
    );
    if (!result?.insertId) {
      throw new Error("REGISTER_FAILED");
    }

    const userId = result.insertId;
    const [[rawUser]] = await q(`SELECT * FROM Users WHERE id=?`, [userId]);
    if (!rawUser) {
      throw new Error("REGISTER_LOOKUP_FAILED");
    }

    const role = normalizeRole(rawUser);
    const privileged = role === "admin" || role === "super-admin";
    const setParts = [];
    const setParams = [];
    if (rawUser.role !== role) {
      setParts.push("role=?");
      setParams.push(role);
    }
    const isAdminFlag = privileged ? 1 : 0;
    if (rawUser.isAdmin !== isAdminFlag) {
      setParts.push("isAdmin=?");
      setParams.push(isAdminFlag);
    }
    if (!EMAIL_VERIFICATION_ENABLED || privileged) {
      if (rawUser.activationToken) setParts.push("activationToken=NULL");
      if (rawUser.activationExpires) setParts.push("activationExpires=NULL");
      if (!rawUser.emailVerifiedAt) setParts.push("emailVerifiedAt=UTC_TIMESTAMP()");
      const status = (rawUser.eligibilityStatus || "").toLowerCase();
      if (status !== "active") setParts.push("eligibilityStatus='active'");
    }
    if (setParts.length) {
      await q(`UPDATE Users SET ${setParts.join(", ")} WHERE id=?`, [...setParams, userId]);
    }

    const [[createdUser]] = await q(
      `SELECT id, username, email, fullName, firstName, lastName, role, isAdmin, eligibilityStatus, verificationStatus, profilePhoto, emailVerifiedAt, activationToken
         FROM Users
        WHERE id=?`,
      [userId]
    );

    const shouldSendActivation = EMAIL_VERIFICATION_ENABLED && !privileged && createdUser?.email;
    if (shouldSendActivation) {
      emailService.sendActivationEmail(createdUser, activationToken).catch((err) => {
        console.error("auth/register sendActivationEmail", err);
      });
    } else if (createdUser?.email) {
      emailService.sendWelcomeEmail(createdUser).catch((err) => {
        console.error("auth/register welcomeEmail", err);
      });
    }

    await recordAuditEvent({
      actorId: null,
      actorRole: "public",
      action: "auth.register",
      entityType: "user",
      entityId: String(userId),
      after: { username: createdUser?.username, email: createdUser?.email },
      ip: req.ip || null,
    });

    const userForToken = { ...createdUser, role };
    const token = sign(userForToken);
    const isAdmin = privileged;
    const emailVerified = Boolean(createdUser?.emailVerifiedAt) || !EMAIL_VERIFICATION_ENABLED;
    const requiresEmailVerification = EMAIL_VERIFICATION_ENABLED && !privileged && !emailVerified;
    const verificationStatus = (createdUser?.verificationStatus || "none").toLowerCase();
    const requiresVerification = !privileged && verificationStatus !== "verified";
    const completionRequired = requiresProfileCompletion(userForToken);
    const requiresPasswordReset = Boolean(userForToken.mustResetPassword);

    res.json({
      success: true,
      token,
      userId: createdUser.id,
      username: createdUser.username,
      fullName: createdUser.fullName || createdUser.username,
      firstName: createdUser.firstName || null,
      lastName: createdUser.lastName || null,
      email: createdUser.email,
      role,
      isAdmin,
      profilePhoto: createdUser.profilePhoto || null,
      eligibilityStatus: createdUser.eligibilityStatus || null,
      verificationStatus,
      requiresProfileCompletion: completionRequired,
      emailVerified,
      requiresEmailVerification,
      activationPending: requiresEmailVerification,
      requiresPasswordReset,
      requiresVerification,
    });
  } catch (e) {
    if (e?.code === "ER_DUP_ENTRY") {
      const sql = e?.sqlMessage || "";
      if (sql.includes("uq_users_nationalId")) {
        return res.status(409).json({ error: "DUPLICATE_NIN", message: "This National Identification Number is already registered." });
      }
      if (sql.includes("uq_users_voterCard")) {
        return res.status(409).json({ error: "DUPLICATE_PVC", message: "This Permanent Voter Card number is already registered." });
      }
    }
    if (e?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "DUPLICATE", message: "Username or email already exists." });
    }
    console.error("auth/register:", e);
    res.status(500).json({ error: "SERVER", message: "Server error" });
  }
});

router.post("/activation/resend", async (req, res) => {
  try {
    if (!EMAIL_VERIFICATION_ENABLED) {
      return res.json({ success: true, disabled: true });
    }
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "MISSING_EMAIL", message: "Email address is required." });
    }
    const [[user]] = await q(`SELECT id, email, fullName, username, emailVerifiedAt FROM Users WHERE email=? LIMIT 1`, [email]);
    if (!user) {
      return res.json({ success: true });
    }
    if (user.emailVerifiedAt) {
      return res.json({ success: true, already: true });
    }
    const { token } = await emailService.generateActivationToken(user.id);
    await emailService.sendActivationEmail(user, token).catch((err) => console.error("auth/resend-activation", err));
    res.json({ success: true });
  } catch (err) {
    console.error("auth/resend-activation", err);
    res.status(500).json({ error: "SERVER", message: "Unable to resend activation email" });
  }
});

router.post("/activate", async (req, res) => {
  try {
    if (!EMAIL_VERIFICATION_ENABLED) {
      return res.json({ success: true, disabled: true });
    }
    const token = String(req.body?.token || "").trim();
    if (!token) {
      return res.status(400).json({ error: "MISSING_TOKEN", message: "Activation token is required." });
    }
    const [[user]] = await q(
      `SELECT id, email, fullName, username, activationExpires, emailVerifiedAt
         FROM Users
        WHERE activationToken=?
        LIMIT 1`,
      [token]
    );
    if (!user) {
      return res.status(404).json({ error: "TOKEN_INVALID", message: "Activation link is invalid or already used." });
    }
    if (user.emailVerifiedAt) {
      await q(`UPDATE Users SET activationToken=NULL, activationExpires=NULL WHERE id=?`, [user.id]);
      return res.json({ success: true, already: true });
    }
    if (user.activationExpires && new Date(user.activationExpires).getTime() < Date.now()) {
      return res.status(410).json({ error: "TOKEN_EXPIRED", message: "Activation link has expired. Request a new one." });
    }
    await q(`UPDATE Users SET activationToken=NULL, activationExpires=NULL, emailVerifiedAt=UTC_TIMESTAMP(), eligibilityStatus='active' WHERE id=?`, [user.id]);
    await recordAuditEvent({
      actorId: user.id,
      actorRole: "public",
      action: "auth.activate",
      entityType: "user",
      entityId: String(user.id),
      notes: "Email verified via activation link",
    });
    await emailService.sendWelcomeEmail(user).catch((err) => console.error("auth/activate welcome", err));
    res.json({ success: true });
  } catch (err) {
    console.error("auth/activate", err);
    res.status(500).json({ error: "SERVER", message: "Unable to activate account" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body; // username OR email
    if (!identifier || !password) {
      return res.status(400).json({ error: "MISSING_FIELDS", message: "Please provide your username or email and password." });
    }
    const [[u]] = await q(`SELECT * FROM Users WHERE username=? OR email=? LIMIT 1`, [identifier, identifier]);
    if (!u) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Incorrect username or password." });
    }
    if (u.deletedAt) {
      return res.status(403).json({
        error: "ACCOUNT_PENDING_DELETION",
        message: "This account is scheduled for deletion. Restore it within 30 days to continue.",
        purgeAt: u.purgeAt,
      });
    }
    const ok = await bcrypt.compare(password, u.password || "");
    if (!ok) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Incorrect username or password." });
    }

    let status = (u.eligibilityStatus || "").toLowerCase();
    if (status === "disabled") {
      return res.status(423).json({
        error: "ACCOUNT_DISABLED",
        message: "This account is currently disabled. Reactivate it to continue.",
        reactivate: true,
      });
    }

    const role = normalizeRole(u);
    if (u.role !== role) {
      try {
        await q(`UPDATE Users SET role=? WHERE id=?`, [role, u.id]);
        u.role = role;
      } catch {}
    }

    const privileged = role === "admin" || role === "super-admin";
    let emailVerified = Boolean(u.emailVerifiedAt) || !u.activationToken;
    if (!EMAIL_VERIFICATION_ENABLED && (!u.emailVerifiedAt || u.activationToken)) {
      try {
        await q(
          `UPDATE Users
              SET emailVerifiedAt = COALESCE(emailVerifiedAt, UTC_TIMESTAMP()),
                  activationToken = NULL,
                  activationExpires = NULL,
                  eligibilityStatus = IF(eligibilityStatus='disabled', eligibilityStatus, 'active')
            WHERE id=?`,
          [u.id]
        );
        u.emailVerifiedAt = u.emailVerifiedAt || new Date();
        u.activationToken = null;
        if (status !== "disabled") {
          status = "active";
          u.eligibilityStatus = "active";
        }
      } catch (err) {
        console.error("auth/login auto-verify disabled flag:", err);
      }
      emailVerified = true;
    } else if (privileged && !emailVerified) {
      try {
        await q(
          `UPDATE Users
              SET emailVerifiedAt = COALESCE(emailVerifiedAt, UTC_TIMESTAMP()),
                  activationToken = NULL,
                  activationExpires = NULL,
                  eligibilityStatus = IF(eligibilityStatus='disabled', eligibilityStatus, 'active')
            WHERE id=?`,
          [u.id]
        );
        emailVerified = true;
        u.emailVerifiedAt = u.emailVerifiedAt || new Date();
        if (status !== "disabled") {
          status = "active";
          u.eligibilityStatus = "active";
        }
      } catch (err) {
        console.error("auth/login auto-verify admin:", err);
      }
    }

    const requiresEmailVerification = EMAIL_VERIFICATION_ENABLED && !privileged && !emailVerified;

    if (status !== "active" && status !== "disabled" && !requiresEmailVerification) {
      try {
        await q(`UPDATE Users SET eligibilityStatus='active' WHERE id=?`, [u.id]);
        status = "active";
        u.eligibilityStatus = "active";
      } catch {}
    }

    const userForToken = { ...u, role };
    const token = sign(userForToken);
    const isAdmin = role === "admin" || role === "super-admin";
    await q(`UPDATE Users SET lastLoginAt=UTC_TIMESTAMP() WHERE id=?`, [u.id]);
    await recordAuditEvent({
      actorId: u.id,
      actorRole: role,
      action: "auth.login",
      entityType: "user",
      entityId: String(u.id),
      ip: req.ip || null,
    });
    const completionRequired = requiresProfileCompletion(userForToken);
    const requiresPasswordReset = Boolean(u.mustResetPassword);
    const verificationStatus = (u.verificationStatus || "none").toLowerCase();
    const requiresVerification = !isAdmin && verificationStatus !== "verified";
    res.json({
      token,
      userId: u.id,
      username: u.username,
      fullName: u.fullName || u.username,
      firstName: u.firstName || null,
      lastName: u.lastName || null,
      email: u.email,
      role,
      isAdmin,
      profilePhoto: u.profilePhoto || null,
      eligibilityStatus: u.eligibilityStatus || null,
      verificationStatus,
      requiresProfileCompletion: completionRequired,
      emailVerified,
      requiresEmailVerification,
      requiresPasswordReset,
      requiresVerification,
    });
  } catch (err) {
    console.error("auth/login:", err);
    res.status(500).json({ error: "SERVER" });
  }
});

router.post("/google", async (req, res) => {
  try {
    const credential = req.body?.credential;
    if (typeof credential !== "string" || !credential.trim()) {
      return res.status(400).json({ error: "MISSING_TOKEN", message: "Missing Google credential" });
    }
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: "SERVER", message: "Google sign-in not configured" });
    }

    const { payload } = decodeGoogleToken(credential.trim());
    if (!payload || payload.aud !== process.env.GOOGLE_CLIENT_ID) {
      return res.status(403).json({ error: "INVALID_TOKEN", message: "Credential not issued for this application" });
    }

    const nowSeconds = Date.now() / 1000;
    if (payload.exp && nowSeconds > Number(payload.exp)) {
      return res.status(401).json({ error: "TOKEN_EXPIRED", message: "Google credential has expired. Please try again." });
    }
    if (payload.iss && !["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) {
      return res.status(403).json({ error: "INVALID_ISSUER", message: "Unexpected Google issuer" });
    }

    const email = (payload.email || "").toLowerCase();
    const googleId = payload.sub;
    const rawName = payload.name || email || "Google User";
    const { first: derivedFirst, last: derivedLast, full: derivedFull } = deriveNameParts(rawName);
    const fullName = derivedFull || rawName;
    const picture = payload.picture || null;
    if (!email || !googleId) {
      return res.status(400).json({ error: "INVALID_PROFILE", message: "Google profile missing required details" });
    }

    let [[user]] = await q(`SELECT * FROM Users WHERE email=?`, [email]);
    if (!user) {
      const randomPassword = crypto.randomBytes(18).toString("hex");
      const hash = await bcrypt.hash(randomPassword, 10);
      const baseUsername = email.split("@")[0].replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 40) || "user";
      let preferred = baseUsername.slice(0, 60);
      let suffix = 1;
      // ensure username uniqueness
      while (true) {
        const [[existingUsername]] = await q(`SELECT id FROM Users WHERE username=?`, [preferred]);
        if (!existingUsername) break;
        preferred = `${baseUsername}${suffix}`.slice(0, 60);
        suffix += 1;
      }
      const [result] = await q(
        `INSERT INTO Users (fullName, firstName, lastName, username, email, password, eligibilityStatus, hasVoted, isAdmin, role, profilePhoto, googleId, activationToken, activationExpires, emailVerifiedAt)
         VALUES (?,?,?,?,?, ?, 'active',0,0,'user',?, ?, NULL, NULL, UTC_TIMESTAMP())`,
        [
          fullName,
          derivedFirst || null,
          derivedLast || null,
          preferred,
          email,
          hash,
          picture,
          googleId,
        ]
      );
      const insertedId = result.insertId;
      [[user]] = await q(`SELECT * FROM Users WHERE id=?`, [insertedId]);
    } else {
      const updates = [];
      const params = [];
      if (!user.googleId) {
        updates.push("googleId=?");
        params.push(googleId);
      }
      if (picture && user.profilePhoto !== picture) {
        updates.push("profilePhoto=?");
        params.push(picture);
      }
      if (fullName && user.fullName !== fullName) {
        updates.push("fullName=?");
        params.push(fullName);
      }
      if (derivedFirst && !user.firstName) {
        updates.push("firstName=?");
        params.push(derivedFirst);
      }
      if (derivedLast && !user.lastName) {
        updates.push("lastName=?");
        params.push(derivedLast);
      }
      if (!user.emailVerifiedAt) {
        updates.push("emailVerifiedAt=UTC_TIMESTAMP()");
      }
      const status = (user.eligibilityStatus || "").toLowerCase();
      if (status !== "active" && status !== "disabled") {
        updates.push("eligibilityStatus='active'");
      }
      if (updates.length) {
        const setClause = updates.join(", ");
        await q(`UPDATE Users SET ${setClause} WHERE id=?`, [...params, user.id]);
        [[user]] = await q(`SELECT * FROM Users WHERE id=?`, [user.id]);
      }
    }

    const role = normalizeRole(user);
    if (user.role !== role) {
      try {
        await q(`UPDATE Users SET role=?, isAdmin=? WHERE id=?`, [role, role === "admin" || role === "super-admin" ? 1 : 0, user.id]);
        user.role = role;
        user.isAdmin = role === "admin" || role === "super-admin" ? 1 : 0;
      } catch {}
    }

    if (user.deletedAt) {
      return res.status(403).json({
        error: "ACCOUNT_PENDING_DELETION",
        message: "This account is scheduled for deletion. Restore it within 30 days to continue.",
        purgeAt: user.purgeAt,
      });
    }
    const status = (user.eligibilityStatus || "").toLowerCase();
    if (status === "disabled") {
      return res.status(423).json({
        error: "ACCOUNT_DISABLED",
        message: "This account is currently disabled. Reactivate it to continue.",
        reactivate: true,
      });
    }
    if (status !== "active" && status !== "disabled") {
      await q(`UPDATE Users SET eligibilityStatus='active' WHERE id=?`, [user.id]);
      user.eligibilityStatus = "active";
    }
    user.role = role;
    const isAdmin = role === "admin" || role === "super-admin";
    user.isAdmin = isAdmin ? 1 : 0;
    const token = sign({ ...user, role });
    await q(`UPDATE Users SET lastLoginAt=UTC_TIMESTAMP() WHERE id=?`, [user.id]);
    await recordAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "auth.login.google",
      entityType: "user",
      entityId: String(user.id),
      ip: req.ip || null,
    });
    const completionRequired = requiresProfileCompletion(user);
    const requiresPasswordReset = Boolean(user.mustResetPassword);
    const verificationStatus = (user.verificationStatus || "none").toLowerCase();
    const requiresVerification = !isAdmin && verificationStatus !== "verified";
    res.json({
      token,
      userId: user.id,
      username: user.username,
      fullName: user.fullName || user.username,
      firstName: user.firstName || null,
      lastName: user.lastName || null,
      email: user.email,
      role,
      isAdmin,
      profilePhoto: user.profilePhoto || null,
      eligibilityStatus: user.eligibilityStatus || null,
      verificationStatus,
      requiresProfileCompletion: completionRequired,
      emailVerified: Boolean(user.emailVerifiedAt) || !EMAIL_VERIFICATION_ENABLED,
      requiresEmailVerification: false,
      requiresPasswordReset,
      requiresVerification,
    });
  } catch (err) {
    console.error("auth/google:", err);
    const rawMessage = err?.message || "Google sign-in failed";
    const friendly = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED/i.test(rawMessage)
      ? "Unable to reach Google to verify the credential. Check your network connection or client ID configuration."
      : rawMessage;
    res.status(500).json({ error: "SERVER", message: friendly });
  }
});

router.post("/microsoft", async (req, res) => {
  try {
    const idToken = req.body?.idToken;
    if (typeof idToken !== "string" || !idToken.trim()) {
      return res.status(400).json({ error: "MISSING_TOKEN", message: "Missing Microsoft credential" });
    }
    if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID) {
      return res.status(500).json({ error: "SERVER", message: "Microsoft sign-in not configured" });
    }
    const payload = await verifyMicrosoftIdToken(idToken.trim());
    const email = (payload.preferred_username || payload.email || payload.upn || "").toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "INVALID_PROFILE", message: "Microsoft profile missing an email address" });
    }
    const microsoftId = (payload.oid || payload.sub || "").toLowerCase() || null;
    const displayName = payload.name || payload.displayName || email;
    const { first: derivedFirst, last: derivedLast, full: derivedFull } = deriveNameParts(displayName);
    const fullName = derivedFull || displayName;
    const azureRole = deriveAzureRole(payload, email);

    let user = null;
    if (microsoftId) {
      [[user]] = await q(`SELECT * FROM Users WHERE microsoftId=? LIMIT 1`, [microsoftId]);
    }
    if (!user) {
      [[user]] = await q(`SELECT * FROM Users WHERE email=? LIMIT 1`, [email]);
    }

    if (!user) {
      const randomPassword = crypto.randomBytes(18).toString("hex");
      const hash = await bcrypt.hash(randomPassword, 10);
      const baseUsername = email.split("@")[0].replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 40) || "user";
      let preferred = baseUsername.slice(0, 60);
      let suffix = 1;
      while (true) {
        const [[existingUsername]] = await q(`SELECT id FROM Users WHERE username=?`, [preferred]);
        if (!existingUsername) break;
        preferred = `${baseUsername}${suffix}`.slice(0, 60);
        suffix += 1;
      }
      const roleForInsert = azureRole || "user";
      const isAdminFlag = roleForInsert === "admin" || roleForInsert === "super-admin" ? 1 : 0;
      const [result] = await q(
        `INSERT INTO Users (fullName, firstName, lastName, username, email, password, eligibilityStatus, hasVoted, isAdmin, role, profilePhoto, googleId, microsoftId, activationToken, activationExpires, emailVerifiedAt)
         VALUES (?,?,?,?,?, ?, 'active',0,?, ?, ?, NULL, ?, NULL, NULL, UTC_TIMESTAMP())`,
        [
          fullName,
          derivedFirst || null,
          derivedLast || null,
          preferred,
          email,
          hash,
          isAdminFlag,
          roleForInsert,
          null,
          microsoftId,
        ]
      );
      const insertedId = result.insertId;
      [[user]] = await q(`SELECT * FROM Users WHERE id=?`, [insertedId]);
    } else {
      const updates = [];
      const params = [];
      if (microsoftId && user.microsoftId !== microsoftId) {
        updates.push("microsoftId=?");
        params.push(microsoftId);
      }
      if (fullName && user.fullName !== fullName) {
        updates.push("fullName=?");
        params.push(fullName);
      }
      if (derivedFirst && !user.firstName) {
        updates.push("firstName=?");
        params.push(derivedFirst);
      }
      if (derivedLast && !user.lastName) {
        updates.push("lastName=?");
        params.push(derivedLast);
      }
      if (!user.email && email) {
        updates.push("email=?");
        params.push(email);
      }
      if (!user.emailVerifiedAt) {
        updates.push("emailVerifiedAt=UTC_TIMESTAMP()");
      }
      const status = (user.eligibilityStatus || "").toLowerCase();
      if (status !== "active" && status !== "disabled") {
        updates.push("eligibilityStatus='active'");
      }
      if (updates.length) {
        const setClause = updates.join(", ");
        await q(`UPDATE Users SET ${setClause} WHERE id=?`, [...params, user.id]);
        [[user]] = await q(`SELECT * FROM Users WHERE id=?`, [user.id]);
      }
    }

    let targetRole = (user.role || "user").toLowerCase();
    if (ROLE_PRIORITY[azureRole] > (ROLE_PRIORITY[targetRole] || 0)) {
      targetRole = azureRole;
    }
    if (targetRole !== (user.role || "").toLowerCase()) {
      await q(`UPDATE Users SET role=?, isAdmin=? WHERE id=?`, [targetRole, targetRole === "admin" || targetRole === "super-admin" ? 1 : 0, user.id]);
      [[user]] = await q(`SELECT * FROM Users WHERE id=?`, [user.id]);
    }

    const normalizedRole = normalizeRole(user);
    if (user.role !== normalizedRole) {
      await q(`UPDATE Users SET role=?, isAdmin=? WHERE id=?`, [normalizedRole, normalizedRole === "admin" || normalizedRole === "super-admin" ? 1 : 0, user.id]);
      [[user]] = await q(`SELECT * FROM Users WHERE id=?`, [user.id]);
    }

    if (user.deletedAt) {
      return res.status(403).json({
        error: "ACCOUNT_PENDING_DELETION",
        message: "This account is scheduled for deletion. Restore it within 30 days to continue.",
        purgeAt: user.purgeAt,
      });
    }
    const status = (user.eligibilityStatus || "").toLowerCase();
    if (status === "disabled") {
      return res.status(423).json({
        error: "ACCOUNT_DISABLED",
        message: "This account is currently disabled. Reactivate it to continue.",
        reactivate: true,
      });
    }
    if (status !== "active" && status !== "disabled") {
      await q(`UPDATE Users SET eligibilityStatus='active' WHERE id=?`, [user.id]);
      user.eligibilityStatus = "active";
    }
    const role = normalizeRole(user);
    const isAdmin = role === "admin" || role === "super-admin";
    user.role = role;
    user.isAdmin = isAdmin ? 1 : 0;
    const token = sign({ ...user, role });
    await q(`UPDATE Users SET lastLoginAt=UTC_TIMESTAMP() WHERE id=?`, [user.id]);
    await recordAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "auth.login.microsoft",
      entityType: "user",
      entityId: String(user.id),
      ip: req.ip || null,
    });
    const completionRequired = requiresProfileCompletion(user);
    const requiresPasswordReset = Boolean(user.mustResetPassword);
    const verificationStatus = (user.verificationStatus || "none").toLowerCase();
    const requiresVerification = !isAdmin && verificationStatus !== "verified";
    res.json({
      token,
      userId: user.id,
      username: user.username,
      fullName: user.fullName || user.username,
      firstName: user.firstName || null,
      lastName: user.lastName || null,
      email: user.email,
      role,
      isAdmin,
      profilePhoto: user.profilePhoto || null,
      eligibilityStatus: user.eligibilityStatus || null,
      requiresProfileCompletion: completionRequired,
      emailVerified: Boolean(user.emailVerifiedAt) || !EMAIL_VERIFICATION_ENABLED,
      requiresEmailVerification: false,
      requiresPasswordReset,
      verificationStatus,
      requiresVerification,
    });
  } catch (err) {
    if (err?.message === "MICROSOFT_NOT_CONFIGURED") {
      return res.status(500).json({ error: "SERVER", message: "Microsoft sign-in not configured" });
    }
    if (err?.message === "TOKEN_TENANT_MISMATCH") {
      return res.status(403).json({ error: "INVALID_TOKEN", message: "Credential issued for a different tenant" });
    }
    if (err?.code === "ERR_JWT_EXPIRED") {
      return res.status(401).json({ error: "TOKEN_EXPIRED", message: "Microsoft credential has expired. Please try again." });
    }
    console.error("auth/microsoft:", err);
    const friendly = err?.message && typeof err.message === "string" && err.message.startsWith("Invalid")
      ? err.message
      : "Microsoft sign-in failed";
    res.status(500).json({ error: "SERVER", message: friendly });
  }
});

router.post("/refresh-role", requireAuth, async (req, res) => {
  try {
    const [[u]] = await q(`SELECT * FROM Users WHERE id=? LIMIT 1`, [req.user.id]);
    if (!u) return res.status(404).json({ error: "NOT_FOUND" });
    const role = normalizeRole(u);
    if (u.role !== role) {
      await q(`UPDATE Users SET role=?, isAdmin=? WHERE id=?`, [role, role === "admin" || role === "super-admin" ? 1 : 0, u.id]);
      u.role = role;
      u.isAdmin = role === "admin" || role === "super-admin" ? 1 : 0;
    }
    const privileged = role === "admin" || role === "super-admin";
    if ((privileged || !EMAIL_VERIFICATION_ENABLED) && !u.emailVerifiedAt) {
      await q(
        `UPDATE Users
            SET emailVerifiedAt = COALESCE(emailVerifiedAt, UTC_TIMESTAMP()),
                activationToken = NULL,
                activationExpires = NULL
          WHERE id=?`,
        [u.id]
      );
      u.emailVerifiedAt = u.emailVerifiedAt || new Date();
    }
    const normalizedUser = { ...u, role };
    const token = sign(normalizedUser);
    const isAdmin = role === "admin" || role === "super-admin";
    const completionRequired = requiresProfileCompletion(normalizedUser);
    const emailVerified = Boolean(u.emailVerifiedAt) || !EMAIL_VERIFICATION_ENABLED;
    const requiresEmailVerification = EMAIL_VERIFICATION_ENABLED && !isAdmin && !emailVerified && Boolean(u.activationToken);
    const requiresPasswordReset = Boolean(normalizedUser.mustResetPassword);
    const verificationStatus = (u.verificationStatus || "none").toLowerCase();
    const requiresVerification = !isAdmin && verificationStatus !== "verified";
    res.json({
      token,
      role,
      isAdmin,
      userId: u.id,
      username: u.username,
      fullName: u.fullName || u.username,
      email: u.email,
      profilePhoto: u.profilePhoto || null,
      requiresProfileCompletion: completionRequired,
      emailVerified,
      requiresEmailVerification,
      requiresPasswordReset,
      verificationStatus,
      requiresVerification,
    });
  } catch (err) {
    console.error("auth/refresh-role:", err);
    res.status(500).json({ error: "SERVER", message: "Could not refresh role" });
  }
});

router.post("/request-password-reset", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "MISSING_EMAIL", message: "Email address is required." });
    }
    const [[user]] = await q(`SELECT id, email, fullName, username FROM Users WHERE email=? LIMIT 1`, [email]);
    if (!user) {
      return res.json({ success: true });
    }
    await q(`DELETE FROM UserPasswordReset WHERE userId=?`, [user.id]);
    const { token } = await emailService.createPasswordResetToken(user.id);
    await emailService.sendPasswordResetEmail(user, token).catch((err) => console.error("auth/request-password-reset", err));
    await recordAuditEvent({
      actorId: user.id,
      actorRole: "public",
      action: "auth.password.reset.request",
      entityType: "user",
      entityId: String(user.id),
      notes: "Password reset email requested",
    });
    res.json({ success: true });
  } catch (err) {
    console.error("auth/request-password-reset", err);
    res.status(500).json({ error: "SERVER", message: "Unable to begin password reset" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ error: "MISSING_FIELDS", message: "Token and new password are required." });
    }
    const [[record]] = await q(
      `SELECT upr.id, upr.userId, upr.expiresAt, upr.usedAt, u.email, u.fullName, u.username
         FROM UserPasswordReset upr
         INNER JOIN Users u ON u.id = upr.userId
        WHERE upr.token=?
        LIMIT 1`,
      [token]
    );
    if (!record) {
      return res.status(404).json({ error: "TOKEN_INVALID", message: "Reset link is invalid or already used." });
    }
    if (record.usedAt) {
      return res.status(409).json({ error: "TOKEN_USED", message: "Reset link has already been used." });
    }
    if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
      return res.status(410).json({ error: "TOKEN_EXPIRED", message: "Reset link has expired. Request a new one." });
    }
    const hash = await bcrypt.hash(String(password), 10);
    await q(`UPDATE Users SET password=?, mustResetPassword=0 WHERE id=?`, [hash, record.userId]);
    await emailService.markPasswordResetUsed(token);
    await recordAuditEvent({
      actorId: record.userId,
      actorRole: "public",
      action: "auth.password.reset.complete",
      entityType: "user",
      entityId: String(record.userId),
      notes: "Password reset via email link",
    });
    res.json({ success: true });
  } catch (err) {
    console.error("auth/reset-password", err);
    res.status(500).json({ error: "SERVER", message: "Unable to reset password" });
  }
});

// Forgot password (username + DOB + phone)
router.post("/reset-simple", async (req, res) => {
  try {
    const { username, dateOfBirth, phone, newPassword } = req.body || {};
    if (!username || !dateOfBirth || !phone || !newPassword) return res.status(400).json({ error: "MISSING_FIELDS" });
    const [[u]] = await q(`SELECT id FROM Users WHERE username=? AND dateOfBirth=? AND phone=? LIMIT 1`, [username, dateOfBirth, phone]);
    if (!u) return res.status(404).json({ error: "NOT_FOUND", message: "No matching user" });
    const hash = await bcrypt.hash(newPassword, 10);
    await q(`UPDATE Users SET password=?, mustResetPassword=0 WHERE id=?`, [hash, u.id]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "SERVER" });
  }
});

router.post("/reactivate", async (req, res) => {
  try {
    const { username, dateOfBirth, phone, password } = req.body || {};
    if (!username || !dateOfBirth || !phone || !password) {
      return res.status(400).json({ error: "MISSING_FIELDS", message: "Username, date of birth, phone, and password are required." });
    }
    const [[user]] = await q(
      `SELECT id, password, eligibilityStatus, phone AS storedPhone, dateOfBirth AS storedDob, deletedAt, purgeAt
       FROM Users WHERE username=? LIMIT 1`,
      [username]
    );
    if (!user) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Account not found." });
    }
    if (user.deletedAt) {
      return res.status(409).json({ error: "PENDING_DELETION", message: "This account is pending deletion. Use the restore option instead." });
    }
    const status = (user.eligibilityStatus || "").toLowerCase();
    if (status !== "disabled") {
      return res.status(409).json({ error: "NOT_DISABLED", message: "This account is not disabled." });
    }
    const storedDob = user.storedDob ? new Date(user.storedDob) : null;
    const dobIso = storedDob && !Number.isNaN(storedDob.getTime()) ? storedDob.toISOString().slice(0, 10) : null;
    if (!dobIso || dobIso !== dateOfBirth) {
      return res.status(403).json({ error: "UNAUTHORISED", message: "Date of birth does not match our records." });
    }
    const storedPhone = normalizePhone(user.storedPhone);
    const providedPhone = normalizePhone(phone);
    if (!storedPhone || !providedPhone || storedPhone !== providedPhone) {
      return res.status(403).json({ error: "UNAUTHORISED", message: "Phone number does not match our records." });
    }
    const ok = await bcrypt.compare(password, user.password || "");
    if (!ok) {
      return res.status(403).json({ error: "UNAUTHORISED", message: "Incorrect password." });
    }
    await q(
      `UPDATE Users
       SET eligibilityStatus='active', deletedAt=NULL, purgeAt=NULL, restoreToken=NULL
       WHERE id=?`,
      [user.id]
    );
    await recordAuditEvent({
      actorId: user.id,
      actorRole: "user",
      action: "auth.reactivate",
      entityType: "user",
      entityId: String(user.id),
      notes: "Account manually reactivated after disablement",
    });
    res.json({ success: true });
  } catch (err) {
    console.error("auth/reactivate:", err);
    res.status(500).json({ error: "SERVER", message: "Unable to reactivate account" });
  }
});

router.post("/restore-account", async (req, res) => {
  try {
    const { username, dateOfBirth, password } = req.body || {};
    if (!username || !dateOfBirth || !password) {
      return res.status(400).json({ error: "MISSING_FIELDS", message: "Username, date of birth, and password are required." });
    }
    const restored = await restoreAccount({ username, dateOfBirth, password });
    await recordAuditEvent({
      actorId: restored.id,
      actorRole: "user",
      action: "auth.restore",
      entityType: "user",
      entityId: String(restored.id),
      notes: "User restored account within 30 day window",
    });
    res.json({ success: true });
  } catch (err) {
    const message = err?.message || "Unable to restore account";
    if (message === "USER_NOT_FOUND") {
      return res.status(404).json({ error: "NOT_FOUND", message: "No matching account." });
    }
    if (message === "DOB_MISMATCH" || message === "AUTH_FAILED") {
      return res.status(403).json({ error: "UNAUTHORISED", message: "Details do not match our records." });
    }
    if (message === "ALREADY_PURGED") {
      return res.status(410).json({ error: "ALREADY_PURGED", message: "This account has already been deleted." });
    }
    if (message === "NOT_PENDING_DELETE") {
      return res.status(409).json({ error: "NOT_PENDING_DELETE", message: "This account is not awaiting deletion." });
    }
    console.error("auth/restore-account:", err);
    res.status(500).json({ error: "SERVER", message: "Unable to restore account" });
  }
});

module.exports = router;
