// backend/routes/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getDbPool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function adminList() {
  return String(process.env.ADMIN_USERNAMES || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminUser(user) {
  const list = adminList();
  const handles = [];
  if (user?.username) handles.push(String(user.username).toLowerCase());
  if (user?.email) handles.push(String(user.email).toLowerCase());
  return handles.some((h) => list.includes(h));
}

function signToken(user) {
  const payload = {
    userId: user.id,
    username: user.username,
    email: user.email,
    isAdmin: isAdminUser(user),
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
}

// Register
router.post("/register", async (req, res) => {
  try {
    let {
      fullName,
      username,
      email,
      password,
      state,
      residenceLGA,
      nationality,
      dateOfBirth,
      phone,
    } = req.body || {};

    if (!fullName || !username || !email || !password || !state || !residenceLGA || !nationality || !dateOfBirth || !phone) {
      return res.status(400).json({ error: "All fields are required" });
    }

    username = String(username).toLowerCase().trim();
    email = String(email).toLowerCase().trim();

    const pool = await getDbPool();

    const [[exists]] = await pool.query(
      "SELECT id FROM Users WHERE LOWER(username)=? OR LOWER(email)=?",
      [username, email]
    );
    if (exists) return res.status(400).json({ error: "User already exists" });

    const hash = await bcrypt.hash(String(password), 10);

    await pool.query(
      `INSERT INTO Users
       (fullName, username, email, password, hasVoted, state, nationality, dateOfBirth, residenceLGA, phone, eligibilityStatus)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      [
        String(fullName).trim(),
        username,
        email,
        hash,
        String(state).trim(),
        String(nationality).trim(),
        dateOfBirth, // yyyy-mm-dd
        String(residenceLGA).trim(),
        String(phone).trim(),
        "eligible",
      ]
    );

    res.json({ success: true });
  } catch (e) {
    console.error("auth/register:", e);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login (username or email)
router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) return res.status(400).json({ error: "Missing credentials" });

    const ident = String(identifier).toLowerCase().trim();
    const pool = await getDbPool();
    const [[user]] = await pool.query(
      "SELECT id, fullName, username, email, password FROM Users WHERE LOWER(username)=? OR LOWER(email)=?",
      [ident, ident]
    );
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(String(password), user.password);
    if (!ok) return res.status(400).json({ error: "Invalid credentials" });

    const token = signToken(user);
    res.json({
      token,
      userId: user.id,
      username: user.username,
      email: user.email,
      isAdmin: isAdminUser(user),
    });
  } catch (e) {
    console.error("auth/login:", e);
    res.status(500).json({ error: "Login failed" });
  }
});

// Me
router.get("/me", requireAuth, async (req, res) => {
  try {
    const pool = await getDbPool();
    const [[u]] = await pool.query(
      `SELECT id, fullName, username, email, hasVoted, state, nationality, dateOfBirth, residenceLGA, phone, eligibilityStatus, createdAt
       FROM Users WHERE id=?`,
      [req.user.id]
    );
    if (!u) return res.status(404).json({ error: "User not found" });

    res.json({ ...u, isAdmin: isAdminUser(u) });
  } catch (e) {
    console.error("auth/me:", e);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// Update profile (email / phone / state / residenceLGA)
router.put("/profile", requireAuth, async (req, res) => {
  try {
    let { email, phone, state, residenceLGA } = req.body || {};
    email = email ? String(email).toLowerCase().trim() : null;

    const fields = [];
    const params = [];

    if (email) {
      const pool = await getDbPool();
      const [[exists]] = await pool.query(
        "SELECT id FROM Users WHERE LOWER(email)=? AND id<>?",
        [email, req.user.id]
      );
      if (exists) return res.status(400).json({ error: "Email is already in use" });
      fields.push("email=?");
      params.push(email);
    }
    if (phone != null) { fields.push("phone=?"); params.push(String(phone).trim()); }
    if (state != null) { fields.push("state=?"); params.push(String(state).trim()); }
    if (residenceLGA != null) { fields.push("residenceLGA=?"); params.push(String(residenceLGA).trim()); }

    if (fields.length === 0) return res.status(400).json({ error: "Nothing to update" });

    const pool = await getDbPool();
    await pool.query(`UPDATE Users SET ${fields.join(", ")} WHERE id=?`, [...params, req.user.id]);

    const [[u]] = await pool.query(
      `SELECT id, fullName, username, email, hasVoted, state, nationality, dateOfBirth, residenceLGA, phone, eligibilityStatus, createdAt
       FROM Users WHERE id=?`,
      [req.user.id]
    );

    res.json({ success: true, user: { ...u, isAdmin: isAdminUser(u) } });
  } catch (e) {
    console.error("auth/profile PUT:", e);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Reset password (username + dob + phone)
router.post("/reset-password", async (req, res) => {
  try {
    const { username, dateOfBirth, phone, newPassword } = req.body || {};
    if (!username || !dateOfBirth || !phone || !newPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const uname = String(username).toLowerCase().trim();

    const pool = await getDbPool();
    const [[u]] = await pool.query(
      `SELECT id FROM Users WHERE LOWER(username)=? AND dateOfBirth=? AND phone=?`,
      [uname, dateOfBirth, String(phone).trim()]
    );
    if (!u) return res.status(400).json({ error: "No matching user found" });

    const hash = await bcrypt.hash(String(newPassword), 10);
    await pool.query("UPDATE Users SET password=? WHERE id=?", [hash, u.id]);

    res.json({ success: true });
  } catch (e) {
    console.error("auth/reset-password:", e);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

module.exports = router;
