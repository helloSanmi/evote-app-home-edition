const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const { q } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { recordAuditEvent } = require("../utils/audit");
const { restoreAccount } = require("../utils/retention");

const router = express.Router();
const sign = (u) => jwt.sign({ id: u.id, username: u.username, email: u.email, role: u.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

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

// Register
router.post("/register", async (req, res) => {
  try {
    const { fullName, username, email, password, state, residenceLGA, phone, nationality, dateOfBirth } = req.body;
    if (!fullName || !username || !email || !password) return res.status(400).json({ error: "MISSING_FIELDS" });
    const hash = await bcrypt.hash(password, 10);
    const [result] = await q(
      `INSERT INTO Users (fullName, username, email, password, state, residenceLGA, phone, nationality, dateOfBirth, role, eligibilityStatus, hasVoted)
       VALUES (?,?,?,?,?,?,?,?,?,'user','pending',0)`,
      [fullName, username, email, hash, state || null, residenceLGA || null, phone || null, nationality || null, dateOfBirth || null]
    );
    if (result?.insertId) {
      await recordAuditEvent({
        actorId: null,
        actorRole: "public",
        action: "auth.register",
        entityType: "user",
        entityId: String(result.insertId),
        after: { username, email },
        ip: req.ip || null,
      });
    }
    res.json({ success: true });
  } catch (e) {
    const dup = e?.code === "ER_DUP_ENTRY";
    res.status(dup ? 409 : 500).json({ error: dup ? "DUPLICATE" : "SERVER", message: dup ? "Username/email already exists" : "Server error" });
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
    const role = normalizeRole(u);
    if (u.role !== role) {
      try {
        await q(`UPDATE Users SET role=? WHERE id=?`, [role, u.id]);
      } catch {}
    }
    if ((u.eligibilityStatus || "").toLowerCase() !== "active") {
      try {
        await q(`UPDATE Users SET eligibilityStatus='active' WHERE id=?`, [u.id]);
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
    res.json({
      token,
      userId: u.id,
      username: u.username,
      fullName: u.fullName || u.username,
      role,
      isAdmin,
      profilePhoto: u.profilePhoto || null,
    });
  } catch {
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
    const fullName = payload.name || email || "Google User";
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
        `INSERT INTO Users (fullName, username, email, password, eligibilityStatus, hasVoted, isAdmin, role, profilePhoto, googleId)
         VALUES (?,?,?,?, 'active',0,0,'user',?,?)`,
        [fullName, preferred, email, hash, picture, googleId]
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
      if ((user.eligibilityStatus || "").toLowerCase() !== "active") {
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
    const token = sign({ ...user, role });
    const isAdmin = role === "admin" || role === "super-admin";
    await q(`UPDATE Users SET lastLoginAt=UTC_TIMESTAMP() WHERE id=?`, [user.id]);
    await recordAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "auth.login.google",
      entityType: "user",
      entityId: String(user.id),
      ip: req.ip || null,
    });
    res.json({
      token,
      userId: user.id,
      username: user.username,
      fullName: user.fullName || user.username,
      role,
      isAdmin,
      profilePhoto: user.profilePhoto || null,
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
    const token = sign({ ...u, role });
    const isAdmin = role === "admin" || role === "super-admin";
    res.json({
      token,
      role,
      isAdmin,
      userId: u.id,
      username: u.username,
      fullName: u.fullName || u.username,
      profilePhoto: u.profilePhoto || null,
    });
  } catch (err) {
    console.error("auth/refresh-role:", err);
    res.status(500).json({ error: "SERVER", message: "Could not refresh role" });
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
    await q(`UPDATE Users SET password=? WHERE id=?`, [hash, u.id]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "SERVER" });
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
