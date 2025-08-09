// backend/routes/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getDbPool } = require("../db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// ==========================
// Register User
// ==========================
router.post("/register", async (req, res) => {
  const { fullName, username, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const pool = await getDbPool();

    await pool.query(
      "INSERT INTO Users (fullName, username, email, password, hasVoted) VALUES (?, ?, ?, ?, 0)",
      [fullName, username, email, hashedPassword]
    );

    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Error registering user" });
  }
});

// ==========================
// Login User
// ==========================
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const pool = await getDbPool();

    const [users] = await pool.query(
      "SELECT * FROM Users WHERE email = ? OR username = ?",
      [email, email]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "4h" });
    const isAdmin =
      user.email.toLowerCase() === "voteadm@techanalytics.org" ||
      user.username.toLowerCase() === "voteadm" ||
      user.email.toLowerCase() === "voteadm";

    res.json({ token, isAdmin });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Error logging in" });
  }
});

// ==========================
// Get User Info
// ==========================
router.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Invalid token format" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const pool = await getDbPool();

    const [users] = await pool.query(
      "SELECT id, fullName, username, email, hasVoted FROM Users WHERE id = ?",
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(users[0]);
  } catch (err) {
    console.error("Get /me error:", err);
    return res.status(401).json({ error: "Invalid token" });
  }
});

module.exports = router;
