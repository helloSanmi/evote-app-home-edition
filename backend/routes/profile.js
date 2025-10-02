const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const router = express.Router();
const { q } = require("../db");
const { requireAuth } = require("../middleware/auth");

// storage: /uploads/profile
const disk = multer.diskStorage({
  destination: function (_req, _file, cb) {
    const dir = path.join(__dirname, "..", "uploads", "profile");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (_req, file, cb) {
    const ext = (file.originalname || "").toLowerCase().split(".").pop();
    const safe = Date.now() + "-" + Math.random().toString(36).slice(2) + "." + ext;
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
      `SELECT id, fullName, username, email, state, residenceLGA, dateOfBirth, phone, nationality, profilePhoto, createdAt
       FROM Users WHERE id=?`,
      [req.user.id]
    );
    if (!u) return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
    res.json(u);
  } catch (e) {
    console.error("profile/me:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

// change profile fields (allowed subset)
router.put("/", requireAuth, async (req, res) => {
  try {
    const { fullName, state, residenceLGA, phone, dateOfBirth } = req.body || {};
    await q(
      `UPDATE Users
       SET fullName=?, state=?, residenceLGA=?, phone=?, dateOfBirth=?
       WHERE id=?`,
      [fullName, state, residenceLGA, phone, dateOfBirth, req.user.id]
    );
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
    const rel = `/uploads/profile/${req.file.filename}`;
    await q(`UPDATE Users SET profilePhoto=? WHERE id=?`, [rel, req.user.id]);
    res.json({ success: true, url: rel });
  } catch (e) {
    console.error("profile/photo:", e);
    res.status(500).json({ error: "SERVER", message: "Upload failed" });
  }
});

module.exports = router;
