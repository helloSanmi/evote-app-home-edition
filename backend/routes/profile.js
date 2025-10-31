const express = require("express");
const multer = require("multer");
const path = require("path");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { q } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { markAccountForDeletion } = require("../utils/retention");
const { recordAuditEvent } = require("../utils/audit");
const { ensureDirSync, buildPublicPath, toRelativePath, syncToObjectStorage, removeLocalFile } = require("../utils/uploads");
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
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,40}$/;

// storage: /uploads/profile
const disk = multer.diskStorage({
  destination: function (_req, _file, cb) {
    const dir = ensureDirSync("profile");
    cb(null, dir);
  },
  filename: function (_req, file, cb) {
    const ext = ((file.originalname || "").toLowerCase().split(".").pop() || "").replace(/[^a-z0-9]/g, "");
    const suffix = ext ? `.${ext}` : "";
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`;
    cb(null, safe);
  }
});
const upload = multer({
  storage: disk,
  fileFilter: (_req, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/jpg"].includes(file.mimetype);
    cb(ok ? null : new Error("Only PNG/JPG allowed"), ok);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// return own profile (minimal)
router.get("/me", requireAuth, async (req, res) => {
  try {
    const [[u]] = await q(
      `SELECT id, fullName, firstName, lastName, username, email, state, residenceLGA, dateOfBirth, phone, gender, nationality, residenceAddress, nationalId, voterCardNumber, eligibilityStatus, profilePhoto, role, createdAt, deletedAt, purgeAt
       FROM Users WHERE id=?`,
      [req.user.id]
    );
    if (!u) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
    const needsCompletion = requiresProfileCompletion(u);
    res.json({ ...u, needsProfileCompletion: needsCompletion });
  } catch (e) {
    console.error("profile/me:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.post("/password/change", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof newPassword !== "string" || newPassword.trim().length < 8) {
      return res.status(400).json({ error: "INVALID_PASSWORD", message: "New password must be at least 8 characters." });
    }
    if (typeof currentPassword !== "string" || !currentPassword.trim()) {
      return res.status(400).json({ error: "MISSING_CURRENT_PASSWORD", message: "Current password is required." });
    }
    const [[user]] = await q(`SELECT id, password, mustResetPassword FROM Users WHERE id=?`, [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
    }
    const matches = await bcrypt.compare(currentPassword.trim(), user.password || "");
    if (!matches) {
      return res.status(403).json({ error: "INVALID_CURRENT_PASSWORD", message: "Current password is incorrect." });
    }
    if (currentPassword.trim() === newPassword.trim()) {
      return res.status(400).json({ error: "PASSWORD_UNCHANGED", message: "Choose a different password." });
    }
    const hash = await bcrypt.hash(newPassword.trim(), 10);
    await q(`UPDATE Users SET password=?, mustResetPassword=0 WHERE id=?`, [hash, req.user.id]);
    await recordAuditEvent({
      actorId: req.user.id,
      actorRole: (req.user?.role || "user").toLowerCase(),
      action: "user.password.change",
      entityType: "user",
      entityId: String(req.user.id),
      notes: user.mustResetPassword ? "Password reset after admin invite" : "Password changed by user",
    });
    res.json({ success: true });
  } catch (err) {
    console.error("profile/password.change:", err);
    res.status(500).json({ error: "SERVER", message: "Unable to update password" });
  }
});

router.get("/change-requests", requireAuth, async (req, res) => {
  try {
    const [rows] = await q(
      `SELECT id, status, fields, notes, approverId, approvedAt, createdAt, updatedAt
         FROM UserProfileChangeRequest
        WHERE userId=?
        ORDER BY createdAt DESC
        LIMIT 20`,
      [req.user.id]
    );
    const mapped = (rows || []).map((row) => ({
      ...row,
      fields: safeJsonParse(row.fields),
    }));
    res.json(mapped);
  } catch (err) {
    console.error("profile/change-requests:list", err);
    res.status(500).json({ error: "SERVER", message: "Unable to load change requests" });
  }
});

router.post("/change-request", requireAuth, async (req, res) => {
  try {
    const { email, username, nationalId, voterCardNumber } = req.body || {};
    const [[user]] = await q(
      `SELECT id, email, username, nationalId, voterCardNumber FROM Users WHERE id=? LIMIT 1`,
      [req.user.id]
    );
    if (!user) {
      return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
    }

    const changes = {};

    if (email !== undefined) {
      const trimmed = String(email || "").trim();
      if (!trimmed || !EMAIL_PATTERN.test(trimmed)) {
        return res.status(400).json({ error: "INVALID_EMAIL", message: "Provide a valid email address." });
      }
      if (trimmed.toLowerCase() !== String(user.email || "").toLowerCase()) {
        const [[dup]] = await q(`SELECT id FROM Users WHERE email=? AND id<>? LIMIT 1`, [trimmed, req.user.id]);
        if (dup) {
          return res.status(409).json({ error: "EMAIL_TAKEN", message: "Another account already uses this email." });
        }
        changes.email = trimmed;
      }
    }

    if (username !== undefined) {
      const trimmed = String(username || "").trim();
      if (!USERNAME_PATTERN.test(trimmed)) {
        return res.status(400).json({ error: "INVALID_USERNAME", message: "Username must be 3-40 characters using letters, numbers, or _.-" });
      }
      if (trimmed.toLowerCase() !== String(user.username || "").toLowerCase()) {
        const [[dup]] = await q(`SELECT id FROM Users WHERE username=? AND id<>? LIMIT 1`, [trimmed, req.user.id]);
        if (dup) {
          return res.status(409).json({ error: "USERNAME_TAKEN", message: "This username is already taken." });
        }
        changes.username = trimmed;
      }
    }

    if (nationalId !== undefined) {
      const trimmed = String(nationalId || "").replace(/\s+/g, "");
      if (!trimmed || !NATIONAL_ID_PATTERN.test(trimmed)) {
        return res.status(400).json({ error: "INVALID_NIN", message: "National Identification Number must be 5 digits." });
      }
      if (trimmed !== String(user.nationalId || "")) {
        const [[dup]] = await q(`SELECT id FROM Users WHERE nationalId=? AND id<>? LIMIT 1`, [trimmed, req.user.id]);
        if (dup) {
          return res.status(409).json({ error: "NIN_TAKEN", message: "This National ID is already registered." });
        }
        changes.nationalId = trimmed;
      }
    }

    if (voterCardNumber !== undefined) {
      const trimmed = String(voterCardNumber || "").replace(/\s+/g, "").toUpperCase();
      if (!trimmed || !PVC_PATTERN.test(trimmed)) {
        return res.status(400).json({ error: "INVALID_PVC", message: "PVC must start with one letter followed by two digits." });
      }
      if (trimmed !== String(user.voterCardNumber || "")) {
        const [[dup]] = await q(`SELECT id FROM Users WHERE voterCardNumber=? AND id<>? LIMIT 1`, [trimmed, req.user.id]);
        if (dup) {
          return res.status(409).json({ error: "PVC_TAKEN", message: "This PVC number is already registered." });
        }
        changes.voterCardNumber = trimmed;
      }
    }

    if (Object.keys(changes).length === 0) {
      return res.status(400).json({ error: "NO_CHANGES", message: "Provide at least one updated value different from your current details." });
    }

    const [[pending]] = await q(
      `SELECT id FROM UserProfileChangeRequest WHERE userId=? AND status='pending' LIMIT 1`,
      [req.user.id]
    );
    if (pending) {
      return res.status(409).json({ error: "REQUEST_PENDING", message: "You already have a pending change request awaiting review." });
    }

    await q(
      `INSERT INTO UserProfileChangeRequest (userId, fields) VALUES (?, ?)`,
      [req.user.id, JSON.stringify(changes)]
    );

    await recordAuditEvent({
      actorId: req.user.id,
      actorRole: (req.user?.role || "user").toLowerCase(),
      action: "profile.change.requested",
      entityType: "user",
      entityId: String(req.user.id),
      after: changes,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("profile/change-request:create", err);
    res.status(500).json({ error: "SERVER", message: "Could not submit change request" });
  }
});

function safeJsonParse(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}


// change profile fields (allowed subset)
router.put("/", requireAuth, async (req, res) => {
  try {
    const { state, residenceLGA, phone, dateOfBirth, gender, residenceAddress } = req.body || {};
    const updates = [];
    const params = [];

    if (state !== undefined) {
      const safeState = normalizeLocale(state);
      updates.push("state=?");
      params.push(safeState);
    }
    if (residenceLGA !== undefined) {
      const safeLga = normalizeLocale(residenceLGA);
      updates.push("residenceLGA=?");
      params.push(safeLga);
    }
    if (phone !== undefined) {
      const safePhone = phone ? normalizePhone(phone) : null;
      if (phone && (!safePhone || !PHONE_PATTERN.test(safePhone))) {
        return res.status(400).json({ error: "INVALID_PHONE", message: "Phone number contains invalid characters." });
      }
      updates.push("phone=?");
      params.push(safePhone);
    }
    if (dateOfBirth !== undefined) {
      if (dateOfBirth) {
        const dobCheck = validateDob(dateOfBirth);
        if (!dobCheck.ok) {
          return res.status(400).json({ error: "INVALID_DOB", message: dobCheck.message });
        }
        updates.push("dateOfBirth=?");
        params.push(dobCheck.value);
      } else {
        updates.push("dateOfBirth=?");
        params.push(null);
      }
    }
    if (gender !== undefined) {
      const normalizedGender = gender ? String(gender).toLowerCase() : null;
      if (gender && !ALLOWED_GENDERS.has(normalizedGender)) {
        return res.status(400).json({ error: "INVALID_GENDER", message: "Select a valid gender option." });
      }
      updates.push("gender=?");
      params.push(normalizedGender);
    }
    if (residenceAddress !== undefined) {
      const safeAddress = residenceAddress ? normalizeAddress(residenceAddress) : null;
      if (residenceAddress && (!safeAddress || safeAddress.length < 5)) {
        return res.status(400).json({ error: "INVALID_ADDRESS", message: "Provide a valid residential address." });
      }
      updates.push("residenceAddress=?");
      params.push(safeAddress);
    }

    if (!updates.length) {
      return res.json({ success: true });
    }

    const setClause = updates.join(", ");
    await q(`UPDATE Users SET ${setClause} WHERE id=?`, [...params, req.user.id]);
    res.json({ success: true });
  } catch (e) {
    console.error("profile/update:", e);
    res.status(500).json({ error: "SERVER", message: "Update failed" });
  }
});

// upload profile photo
router.post("/photo", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "MISSING_FILE", message: "No file uploaded" });
    const relative = toRelativePath("profile", req.file.filename);
    const absolute = req.file.path || path.join(req.file.destination || ensureDirSync("profile"), req.file.filename);
    await syncToObjectStorage({
      relativePath: relative,
      absolutePath: absolute,
      contentType: req.file.mimetype,
    });
    const url = buildPublicPath("profile", req.file.filename);
    await q(`UPDATE Users SET profilePhoto=? WHERE id=?`, [url, req.user.id]);
    removeLocalFile(absolute);
    res.json({ success: true, url });
  } catch (err) {
    console.error("profile/photo:", err);
    res.status(500).json({ error: "SERVER", message: "Upload failed" });
  }
});

router.post("/delete", requireAuth, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password || typeof password !== "string") {
      return res.status(400).json({ error: "INVALID_PASSWORD", message: "Password is required" });
    }
    const [[user]] = await q(`SELECT id, password, eligibilityStatus FROM Users WHERE id=?`, [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
    }
    const ok = await bcrypt.compare(password, user.password || "");
    if (!ok) {
      return res.status(403).json({ error: "INVALID_PASSWORD", message: "Incorrect password" });
    }
    const { purgeAt } = await markAccountForDeletion({
      userId: req.user.id,
      actorRole: (req.user?.role || "user").toLowerCase(),
      ip: req.ip || null,
      graceDays: 30,
    });
    await q(`UPDATE Users SET eligibilityStatus='disabled' WHERE id=?`, [req.user.id]);
    await recordAuditEvent({
      actorId: req.user.id,
      actorRole: (req.user?.role || "user").toLowerCase(),
      action: "user.delete-confirmed",
      entityType: "user",
      entityId: String(req.user.id),
      notes: "User initiated account removal",
    });
    res.json({ success: true, purgeAt });
  } catch (err) {
    console.error("profile/delete:", err);
    res.status(500).json({ error: "SERVER", message: "Failed to schedule deletion" });
  }
});

router.put("/complete", requireAuth, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      gender,
      dateOfBirth,
      nationalId,
      voterCardNumber,
      residenceAddress,
      state,
      residenceLGA,
      phone,
      nationality,
    } = req.body || {};

    if (!firstName || !lastName || !gender || !dateOfBirth || !nationalId || !voterCardNumber || !residenceAddress || !state || !residenceLGA || !phone) {
      return res.status(400).json({ error: "MISSING_FIELDS", message: "All profile fields are required." });
    }

    const rawFirst = sanitizeSpacing(firstName);
    const rawLast = sanitizeSpacing(lastName);
    if (!NAME_PART_PATTERN.test(rawFirst) || !NAME_PART_PATTERN.test(rawLast)) {
      return res.status(400).json({ error: "INVALID_NAME", message: "Names may only include letters, hyphen, apostrophe, and periods." });
    }
    const safeFullName = sanitizeSpacing(`${rawFirst} ${rawLast}`);
    if (!FULL_NAME_PATTERN.test(safeFullName)) {
      return res.status(400).json({ error: "INVALID_NAME", message: "Full name contains invalid characters." });
    }

    const normalizedGender = String(gender).toLowerCase();
    if (!ALLOWED_GENDERS.has(normalizedGender)) {
      return res.status(400).json({ error: "INVALID_GENDER", message: "Select a valid gender option." });
    }

    const dobCheck = validateDob(dateOfBirth);
    if (!dobCheck.ok) {
      return res.status(400).json({ error: "INVALID_DOB", message: dobCheck.message });
    }

    const sanitizedNationalId = String(nationalId).replace(/\s+/g, "");
    if (!NATIONAL_ID_PATTERN.test(sanitizedNationalId)) {
      return res.status(400).json({ error: "INVALID_NIN", message: "National Identification Number must be 5 digits." });
    }

    const sanitizedVoterCard = String(voterCardNumber).toUpperCase().replace(/\s+/g, "");
    if (!PVC_PATTERN.test(sanitizedVoterCard)) {
      return res.status(400).json({ error: "INVALID_PVC", message: "Permanent Voter Card number must start with one letter followed by two digits." });
    }

    const safeAddress = normalizeAddress(residenceAddress);
    if (!safeAddress || safeAddress.length < 10) {
      return res.status(400).json({ error: "INVALID_ADDRESS", message: "Residential address must be at least 10 characters long." });
    }

    const safeState = normalizeLocale(state);
    const safeLga = normalizeLocale(residenceLGA);
    if (!safeState || !safeLga) {
      return res.status(400).json({ error: "INVALID_LOCATION", message: "Select a valid state and local government area." });
    }

    const safePhone = normalizePhone(phone);
    if (!safePhone || !PHONE_PATTERN.test(safePhone)) {
      return res.status(400).json({ error: "INVALID_PHONE", message: "Provide a valid phone number." });
    }

    const safeNationality = normalizeLocale(nationality) || "Nigerian";

    const [[current]] = await q(`SELECT eligibilityStatus FROM Users WHERE id=?`, [req.user.id]);
    if (!current) {
      return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
    }
    const currentStatus = (current.eligibilityStatus || "").toLowerCase();
    const nextStatus = currentStatus === "disabled" ? "disabled" : "active";

    try {
      await q(
        `UPDATE Users
         SET firstName=?, lastName=?, fullName=?, gender=?, dateOfBirth=?, nationalId=?, voterCardNumber=?, residenceAddress=?, state=?, residenceLGA=?, phone=?, nationality=?, eligibilityStatus=?
         WHERE id=?`,
        [
          rawFirst,
          rawLast,
          safeFullName,
          normalizedGender,
          dobCheck.value,
          sanitizedNationalId,
          sanitizedVoterCard,
          safeAddress,
          safeState,
          safeLga,
          safePhone,
          safeNationality,
          nextStatus,
          req.user.id,
        ]
      );
    } catch (err) {
      if (err?.code === "ER_DUP_ENTRY") {
        const msg = err?.sqlMessage || "";
        if (msg.includes("uq_users_nationalId")) {
          return res.status(409).json({ error: "DUPLICATE_NIN", message: "This National Identification Number is already registered." });
        }
        if (msg.includes("uq_users_voterCard")) {
          return res.status(409).json({ error: "DUPLICATE_PVC", message: "This Permanent Voter Card number is already registered." });
        }
      }
      throw err;
    }

    await recordAuditEvent({
      actorId: req.user.id,
      actorRole: (req.user?.role || "user").toLowerCase(),
      action: "user.profile.complete",
      entityType: "user",
      entityId: String(req.user.id),
    });

    res.json({ success: true });
  } catch (err) {
    console.error("profile/complete:", err);
    res.status(500).json({ error: "SERVER", message: "Unable to complete profile" });
  }
});

module.exports = router;
