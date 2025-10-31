const express = require("express");
const multer = require("multer");
const path = require("path");
const router = express.Router();
const { q, getConn } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { ensureDirSync, toRelativePath, syncToObjectStorage, removeLocalFile } = require("../utils/uploads");
const { recordAuditEvent } = require("../utils/audit");

const VERIFICATION_DIR = ensureDirSync("verification");
const ALLOWED_MIME = (process.env.S3_ALLOWED_TYPES || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const MAX_FILE_SIZE = Number(process.env.S3_MAX_SIZE || 10 * 1024 * 1024);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, ensureDirSync("verification")),
    filename: (_req, file, cb) => {
      const ext = ((file.originalname || "").split(".").pop() || "").replace(/[^a-zA-Z0-9]/g, "");
      const suffix = ext ? `.${ext.toLowerCase()}` : "";
      cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 10)}${suffix}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.length) return cb(null, true);
    const ok = ALLOWED_MIME.includes(String(file.mimetype || "").toLowerCase());
    cb(ok ? null : new Error("UNSUPPORTED_FILE"), ok);
  },
});

async function listUserRequests(userId) {
  const [rows] = await q(
    `SELECT id, status, documentType, notes, adminNotes, metadata, submittedAt, reviewedAt, reviewedBy
       FROM VerificationRequest
      WHERE userId=?
      ORDER BY submittedAt DESC`,
    [userId]
  );
  if (!rows?.length) return [];
  const ids = rows.map((row) => row.id);
  const [attachments] = await q(
    `SELECT id, requestId, fileKey, fileName, contentType, size, uploadedAt
       FROM VerificationAttachment
      WHERE requestId IN (${ids.map(() => "?").join(",")})
      ORDER BY uploadedAt ASC`,
    ids
  );
  const grouped = new Map();
  (attachments || []).forEach((attachment) => {
    if (!grouped.has(attachment.requestId)) grouped.set(attachment.requestId, []);
    grouped.get(attachment.requestId).push(attachment);
  });
  return rows.map((row) => ({ ...row, attachments: grouped.get(row.id) || [] }));
}

router.get("/requests/me", requireAuth, async (req, res) => {
  try {
    const requests = await listUserRequests(req.user.id);
    res.json(requests);
  } catch (err) {
    console.error("verification/requests/me", err);
    res.status(500).json({ error: "SERVER", message: "Failed to load verification requests" });
  }
});

router.post("/requests", requireAuth, upload.array("files", 5), async (req, res) => {
  const conn = await getConn();
  try {
    const documentType = String(req.body?.documentType || "").trim().toLowerCase();
    const notes = String(req.body?.notes || "").trim() || null;
    if (!documentType) {
      return res.status(400).json({ error: "INVALID_TYPE", message: "Select a document type" });
    }
    const [[profile]] = await q(`SELECT profilePhoto FROM Users WHERE id=? LIMIT 1`, [req.user.id]);
    if (!profile || !profile.profilePhoto) {
      return res.status(400).json({ error: "MISSING_PROFILE_PHOTO", message: "Add a profile photo before submitting verification." });
    }
    const [rows] = await q(`SELECT id FROM VerificationRequest WHERE userId=? AND status='pending' LIMIT 1`, [req.user.id]);
    if (rows?.length) {
      return res.status(409).json({ error: "PENDING_REQUEST", message: "You already have a verification request in review." });
    }
    await conn.beginTransaction();
    const [result] = await conn.execute(
      `INSERT INTO VerificationRequest (userId, status, documentType, notes, metadata)
       VALUES (?,?,?,?,?)`,
      [req.user.id, "pending", documentType, notes, null]
    );
    const requestId = result.insertId;

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      await conn.rollback();
      return res.status(400).json({ error: "MISSING_FILES", message: "Upload at least one document." });
    }

    const attachments = [];
    for (const file of files) {
      const relative = toRelativePath("verification", String(req.user.id), String(requestId), file.filename);
      const absolute = file.path || path.join(file.destination || VERIFICATION_DIR, file.filename);
      await syncToObjectStorage({
        relativePath: relative,
        absolutePath: absolute,
        contentType: file.mimetype,
      });
      attachments.push({
        requestId,
        fileKey: relative,
        fileName: file.originalname || file.filename,
        contentType: file.mimetype,
        size: file.size,
      });
      removeLocalFile(absolute);
    }

    for (const attachment of attachments) {
      await conn.execute(
        `INSERT INTO VerificationAttachment (requestId, fileKey, fileName, contentType, size)
         VALUES (?,?,?,?,?)`,
        [attachment.requestId, attachment.fileKey, attachment.fileName, attachment.contentType, attachment.size]
      );
    }

    await conn.execute(`UPDATE Users SET verificationStatus='pending' WHERE id=?`, [req.user.id]);
    await conn.commit();

    await recordAuditEvent({
      actorId: req.user.id,
      actorRole: (req.user?.role || "user").toLowerCase(),
      action: "verification.request.created",
      entityType: "verificationRequest",
      entityId: String(requestId),
      notes,
    });

    res.status(201).json({ success: true, requestId });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error("verification/requests:create", err);
    res.status(500).json({ error: "SERVER", message: "Could not submit verification" });
  } finally {
    conn.release();
  }
});

router.post("/requests/:id/cancel", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: "INVALID_ID" });
    const [[request]] = await q(
      `SELECT id, userId, status FROM VerificationRequest WHERE id=? AND userId=?`,
      [id, req.user.id]
    );
    if (!request) return res.status(404).json({ error: "NOT_FOUND" });
    if (request.status !== "pending") {
      return res.status(409).json({ error: "NOT_PENDING", message: "Only pending requests can be cancelled" });
    }
    await q(`UPDATE VerificationRequest SET status='cancelled', reviewedAt=UTC_TIMESTAMP() WHERE id=?`, [id]);
    const [[stillPending]] = await q(
      `SELECT COUNT(*) AS c FROM VerificationRequest WHERE userId=? AND status='pending'`,
      [req.user.id]
    );
    if (!stillPending?.c) {
      await q(`UPDATE Users SET verificationStatus='none' WHERE id=?`, [req.user.id]);
    }
    await recordAuditEvent({
      actorId: req.user.id,
      actorRole: (req.user?.role || "user").toLowerCase(),
      action: "verification.request.cancelled",
      entityType: "verificationRequest",
      entityId: String(id),
    });
    res.json({ success: true });
  } catch (err) {
    console.error("verification/requests:cancel", err);
    res.status(500).json({ error: "SERVER", message: "Unable to cancel request" });
  }
});

module.exports = router;
