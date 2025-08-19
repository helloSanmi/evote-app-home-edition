// backend/routes/auth.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getDbPool } = require("../db");
const { requireAuth } = require("../middleware/auth");

// helpers
const adminList = () =>
  (process.env.ADMIN_USERNAMES || process.env.ADMIN_USERS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const isEnvAdmin = (u) => {
  if (!u) return false;
  const list = adminList();
  return list.includes(String(u.username || "").toLowerCase()) ||
         list.includes(String(u.email || "").toLowerCase());
};

const sign = (u) =>
  jwt.sign(
    { id: u.id, username: u.username, email: u.email, isAdmin: isEnvAdmin(u) },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

const yearsBetween = (d) => {
  if (!d) return 0;
  const dob = new Date(d);
  if (Number.isNaN(dob.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
};

const computeEligibility = (nationality, dob) => {
  const nat = (nationality || "").toLowerCase();
  if (!nat || !dob) return "pending";
  return nat === "nigerian" && yearsBetween(dob) >= 18 ? "eligible" : "ineligible";
};

// routes
router.get("/health", (_req, res) => res.json({ ok: true }));

// Register (all fields required, username forced lowercase)
router.post("/register", async (req, res) => {
  const body = req.body || {};
  const fullName = String(body.fullName || "").trim();
  const username = String(body.username || "").trim().toLowerCase();
  const email = String(body.email || "").trim();
  const password = String(body.password || "");
  const phone = String(body.phone || "").trim();
  const state = String(body.state || "").trim();
  const residenceLGA = String(body.residenceLGA || "").trim();
  let nationality = String(body.nationality || "").trim();
  const dateOfBirth = String(body.dateOfBirth || "").trim();

  if (!fullName || !username || !email || !password || !phone || !state || !residenceLGA || !nationality || !dateOfBirth) {
    return res.status(400).json({ error: "All fields are required" });
  }

  nationality = nationality.toLowerCase() === "nigerian" ? "Nigerian" : "Other";

  try {
    const pool = await getDbPool();

    const [[u1]] = await pool.query(`SELECT id FROM Users WHERE LOWER(username)=LOWER(?)`, [username]);
    if (u1) return res.status(400).json({ error: "Username already in use" });

    const [[u2]] = await pool.query(`SELECT id FROM Users WHERE LOWER(email)=LOWER(?)`, [email]);
    if (u2) return res.status(400).json({ error: "Email already in use" });

    const hash = await bcrypt.hash(password, 10);
    const eligibilityStatus = computeEligibility(nationality, dateOfBirth);

    await pool.query(
      `INSERT INTO Users
        (fullName, username, email, password, hasVoted, state, nationality, dateOfBirth, residenceLGA, phone, eligibilityStatus)
       VALUES (?,?,?,?,0,?,?,?,?,?,?)`,
      [fullName, username, email, hash, state, nationality, dateOfBirth, residenceLGA, phone, eligibilityStatus]
    );

    return res.json({ success: true });
  } catch (e) {
    console.error("auth/register:", e);
    return res.status(500).json({ error: "Registration failed" });
  }
});

// Login (case-insensitive)
router.post("/login", async (req, res) => {
  const { identifier, password } = req.body || {};
  if (!identifier || !password) return res.status(400).json({ error: "identifier and password required" });

  try {
    const pool = await getDbPool();
    const [[user]] = await pool.query(
      `SELECT id, fullName, username, email, password, hasVoted,
              state, nationality, dateOfBirth, residenceLGA, phone, eligibilityStatus, createdAt
       FROM Users
       WHERE LOWER(username)=LOWER(?) OR LOWER(email)=LOWER(?)
       LIMIT 1`,
      [identifier, identifier]
    );
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    return res.json({
      token: sign(user),
      userId: user.id,
      username: user.username,
      isAdmin: isEnvAdmin(user),
    });
  } catch (e) {
    console.error("auth/login:", e);
    return res.status(500).json({ error: "Login failed" });
  }
});

// Profile
router.get("/me", requireAuth, async (req, res) => {
  try {
    const pool = await getDbPool();
    const [[u]] = await pool.query(
      `SELECT id, fullName, username, email, hasVoted, createdAt,
              state, nationality, dateOfBirth, residenceLGA, phone, eligibilityStatus
       FROM Users WHERE id=? LIMIT 1`,
      [req.user.id]
    );
    if (!u) return res.status(404).json({ error: "User not found" });

    const eligibility = u.eligibilityStatus || computeEligibility(u.nationality, u.dateOfBirth) || "pending";
    return res.json({ ...u, eligibilityStatus: eligibility, isAdmin: isEnvAdmin(u) });
  } catch (e) {
    console.error("auth/me:", e);
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

// Update profile (unchanged from previous message if you already added it)
router.put("/update-profile", requireAuth, async (req, res) => {
  try {
    const phone = req.body?.phone ?? null;
    const state = req.body?.state ?? null;
    const residenceLGA = req.body?.residenceLGA ?? null;
    const natIn = req.body?.nationality ?? null;
    const dateOfBirth = req.body?.dateOfBirth ?? null;

    const nationality = natIn ? (String(natIn).toLowerCase() === "nigerian" ? "Nigerian" : "Other") : null;
    const eligibilityStatus = computeEligibility(nationality, dateOfBirth);

    const pool = await getDbPool();
    await pool.query(
      `UPDATE Users SET phone=?, state=?, residenceLGA=?, nationality=?, dateOfBirth=?, eligibilityStatus=? WHERE id=?`,
      [phone, state, residenceLGA, nationality, dateOfBirth, eligibilityStatus, req.user.id]
    );

    const [[u]] = await pool.query(
      `SELECT id, fullName, username, email, hasVoted, createdAt,
              state, nationality, dateOfBirth, residenceLGA, phone, eligibilityStatus
       FROM Users WHERE id=?`,
      [req.user.id]
    );
    return res.json({ success: true, user: u });
  } catch (e) {
    console.error("auth/update-profile:", e);
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

module.exports = router;
