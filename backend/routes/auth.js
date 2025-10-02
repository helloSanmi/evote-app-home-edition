const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { q } = require("../db");

const router = express.Router();
const sign = (u) => jwt.sign({ id: u.id, username: u.username, email: u.email }, process.env.JWT_SECRET, { expiresIn: "7d" });

// Register
router.post("/register", async (req, res) => {
  try {
    const { fullName, username, email, password, state, residenceLGA, phone, nationality, dateOfBirth } = req.body;
    if (!fullName || !username || !email || !password) return res.status(400).json({ error: "MISSING_FIELDS" });
    const hash = await bcrypt.hash(password, 10);
    await q(
      `INSERT INTO Users (fullName, username, email, password, state, residenceLGA, phone, nationality, dateOfBirth, eligibilityStatus, hasVoted)
       VALUES (?,?,?,?,?,?,?,?,?,'pending',0)`,
      [fullName, username, email, hash, state || null, residenceLGA || null, phone || null, nationality || null, dateOfBirth || null]
    );
    res.json({ success: true });
  } catch (e) {
    const sqlState = e?.number ?? e?.originalError?.info?.number;
    const dup = sqlState === 2627 || sqlState === 2601;
    res.status(dup ? 409 : 500).json({ error: dup ? "DUPLICATE" : "SERVER", message: dup ? "Username/email already exists" : "Server error" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body; // username OR email
    if (!identifier || !password) return res.status(400).json({ error: "MISSING_FIELDS" });
    const [[u]] = await q(`SELECT TOP 1 * FROM Users WHERE username=? OR email=?`, [identifier, identifier]);
    if (!u) return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    const ok = await bcrypt.compare(password, u.password || "");
    if (!ok) return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    const token = sign(u);
    const isAdmin = (() => {
      const uName = (u.username || "").toLowerCase();
      const eMail = (u.email || "").toLowerCase();
      const uSet = new Set((process.env.ADMIN_USERNAMES || "").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean));
      const eSet = new Set((process.env.ADMIN_EMAILS    || "").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean));
      return uSet.has(uName) || (eMail && eSet.has(eMail)) || !!u.isAdmin;
    })();
    res.json({
      token,
      userId: u.id,
      username: u.username,
      isAdmin,
      profilePhoto: u.profilePhoto || null,
    });
  } catch {
    res.status(500).json({ error: "SERVER" });
  }
});

// Forgot password (username + DOB + phone)
router.post("/reset-simple", async (req, res) => {
  try {
    const { username, dateOfBirth, phone, newPassword } = req.body || {};
    if (!username || !dateOfBirth || !phone || !newPassword) return res.status(400).json({ error: "MISSING_FIELDS" });
    const [[u]] = await q(`SELECT TOP 1 id FROM Users WHERE username=? AND dateOfBirth=? AND phone=?`, [username, dateOfBirth, phone]);
    if (!u) return res.status(404).json({ error: "NOT_FOUND", message: "No matching user" });
    const hash = await bcrypt.hash(newPassword, 10);
    await q(`UPDATE Users SET password=? WHERE id=?`, [hash, u.id]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "SERVER" });
  }
});

module.exports = router;
