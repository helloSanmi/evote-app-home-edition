// backend/routes/auth.js  (replace the whole file)
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getDbPool } = require("../db");
const auth = require("../middleware/auth");

const router = express.Router();

router.post("/register", async (req, res) => {
  const { fullName, username, email, password } = req.body || {};
  try {
    const hashed = await bcrypt.hash(password, 10);
    const pool = await getDbPool();
    await pool.query(
      "INSERT INTO Users (fullName, username, email, password, hasVoted) VALUES (?, ?, ?, ?, 0)",
      [fullName, username, email, hashed]
    );
    res.status(201).json({ success: true });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Username or email already exists" });
    }
    res.status(500).json({ error: "Error registering user" });
  }
});

// LOGIN: username OR email, and embed isAdmin claim in JWT
router.post("/login", async (req, res) => {
  const { identifier, password } = req.body || {};
  try {
    const pool = await getDbPool();
    const [rows] = await pool.query(
      "SELECT * FROM Users WHERE username = ? OR email = ? LIMIT 1",
      [identifier, identifier]
    );
    if (!rows.length) return res.status(400).json({ error: "Invalid credentials" });
    const user = rows[0];

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "Invalid credentials" });

    const isAdmin =
      (user.email || "").toLowerCase() === "voteadm@techanalytics.org" ||
      (user.username || "").toLowerCase() === "voteadm" ||
      (user.email || "").toLowerCase() === "voteadm";

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username, isAdmin: !!isAdmin },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      userId: user.id,
      username: user.username,
      isAdmin: !!isAdmin,
    });
  } catch {
    res.status(500).json({ error: "Login error" });
  }
});

// Current user (profile)
router.get("/me", auth, async (req, res) => {
  try {
    const pool = await getDbPool();
    const [rows] = await pool.query(
      "SELECT id, fullName, username, email, hasVoted, createdAt FROM Users WHERE id = ? LIMIT 1",
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "Error fetching profile" });
  }
});

module.exports = router;
