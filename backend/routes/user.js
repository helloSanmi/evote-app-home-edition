// backend/routes/user.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { q, one } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/* -------------------------- Profile: GET & UPDATE -------------------------- */

// GET /api/user/profile
router.get("/profile", requireAuth, async (req, res) => {
  try {
    const u = await one(
      `SELECT TOP 1 id, fullName, username, email,
              state, residenceLGA, phone, nationality,
              dateOfBirth, eligibilityStatus, profilePhoto, hasVoted, createdAt
       FROM Users WHERE id=?`,
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
      `SELECT TOP 1 id, fullName, username, email,
              state, residenceLGA, phone, nationality,
              dateOfBirth, eligibilityStatus, profilePhoto, hasVoted, createdAt
       FROM Users WHERE id=?`,
      [req.user.id]
    );
    res.json(u);
  } catch (e) {
    console.error("user/profile PUT:", e);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

/* ------------------------------- Avatar upload ------------------------------ */

const avatarDir = path.join(__dirname, "..", "uploads", "avatars");
fs.mkdirSync(avatarDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarDir),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname || "") || "").toLowerCase();
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
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
    const url = `/uploads/avatars/${req.file.filename}`;
    await q(`UPDATE Users SET profilePhoto=? WHERE id=?`, [url, req.user.id]);
    res.json({ success: true, url });
  } catch (e) {
    console.error("user/upload-avatar:", e);
    res.status(500).json({ message: "Upload failed" });
  }
});

module.exports = router;
