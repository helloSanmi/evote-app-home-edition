// backend/routes/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getDbPool, sql } = require("../db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// Register User
router.post("/register", async (req, res) => {
  const { fullName, username, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const pool = await getDbPool();

    await pool
      .request()
      .input("fullName", sql.NVarChar, fullName)
      .input("username", sql.NVarChar, username)
      .input("email", sql.NVarChar, email)
      .input("password", sql.NVarChar, hashedPassword)
      .query("INSERT INTO Users (fullName, username, email, password, hasVoted) VALUES (@fullName, @username, @email, @password, 0)");

    res.status(201).json({ message: "User registered successfully" });
  } catch {
    res.status(500).json({ error: "Error registering user" });
  }
});

// Login User
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const pool = await getDbPool();

    const userResult = await pool
      .request()
      .input("value", sql.NVarChar, email)
      .query("SELECT * FROM Users WHERE email = @value OR username = @value");

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.recordset[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "4h" });
    const isAdmin = (user.email === "admin@example.com" || user.username.toLowerCase() === "admin" || user.email.toLowerCase() === "admin");
    res.json({ token, isAdmin });
  } catch {
    res.status(500).json({ error: "Error logging in" });
  }
});

// Get User Info
router.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Invalid token format" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const pool = await getDbPool();
    const result = await pool
      .request()
      .input("userId", sql.Int, decoded.id)
      .query("SELECT id, fullName, username, email, hasVoted FROM Users WHERE id = @userId");

    const user = result.recordset[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user);
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
});

module.exports = router;


