// backend/routes/user.js
const express = require("express");
const multer = require("multer");
const { q, one } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { ensureDirSync, buildPublicPath } = require("../utils/uploads");

const router = express.Router();

/* -------------------------- Profile: GET & UPDATE -------------------------- */

// GET /api/user/profile
router.get("/profile", requireAuth, async (req, res) => {
  try {
    const u = await one(
      `SELECT id, fullName, username, email,
              state, residenceLGA, phone, nationality,
              dateOfBirth, eligibilityStatus, profilePhoto, hasVoted, createdAt
       FROM Users WHERE id=?
       LIMIT 1`,
      [req.user.id]
    );
    if (!u) return res.status(404).json({ message: "User not found" });
    res.json(u);
  } catch (e) {
    console.error("user/profile:", e);
    res.status(500).json({ message: "Failed to load profile" });
  }
});

// PUT /api/user/profile
// Body: { state?, residenceLGA?, phone?, dateOfBirth? }
router.put("/profile", requireAuth, async (req, res) => {
  try {
    const { state = null, residenceLGA = null, phone = null, dateOfBirth = null } = req.body || {};
    await q(
      `UPDATE Users
       SET state=?, residenceLGA=?, phone=?, dateOfBirth=?
       WHERE id=?`,
      [state, residenceLGA, phone, dateOfBirth, req.user.id]
    );
    const u = await one(
      `SELECT id, fullName, username, email,
              state, residenceLGA, phone, nationality,
              dateOfBirth, eligibilityStatus, profilePhoto, hasVoted, createdAt
       FROM Users WHERE id=?
       LIMIT 1`,
      [req.user.id]
    );
    res.json(u);
  } catch (e) {
    console.error("user/profile PUT:", e);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

/* ------------------------------- Avatar upload ------------------------------ */

const avatarDir = ensureDirSync("avatars");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarDir),
  filename: (_req, file, cb) => {
    const ext = ((file.originalname || "").toLowerCase().split(".").pop() || "").replace(/[^a-z0-9]/g, "");
    const suffix = ext ? `.${ext}` : "";
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${suffix}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png"].includes(file.mimetype);
    cb(ok ? null : new Error("Only JPEG/PNG allowed"), ok);
  },
});

// POST /api/user/upload-avatar  (FormData "file")
router.post("/upload-avatar", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file" });
    const url = buildPublicPath("avatars", req.file.filename);
    await q(`UPDATE Users SET profilePhoto=? WHERE id=?`, [url, req.user.id]);
    res.json({ success: true, url });
  } catch (e) {
    console.error("user/upload-avatar:", e);
    res.status(500).json({ message: "Upload failed" });
  }
});

module.exports = router;
