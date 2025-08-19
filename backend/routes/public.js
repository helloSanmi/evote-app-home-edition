// backend/routes/public.js
const express = require("express");
const router = express.Router();
const { getDbPool } = require("../db");

const withStatus = (row) => {
  const now = Date.now();
  const start = new Date(row.startTime).getTime();
  const end = new Date(row.endTime).getTime();
  let status = "upcoming";
  if (row.forcedEnded || now >= end) status = "ended";
  else if (now >= start && now < end) status = "active";
  return { ...row, status };
};

// All periods (for /vote multi-session list)
router.get("/periods", async (_req, res) => {
  const pool = await getDbPool();
  try {
    const [rows] = await pool.query(
      `SELECT id, title, description, startTime, endTime, resultsPublished, forcedEnded
       FROM VotingPeriod
       ORDER BY id DESC`
    );
    res.json(rows.map(withStatus));
  } catch (e) {
    console.error("public/periods:", e);
    res.status(500).json({ error: "Failed to load periods" });
  }
});

// Candidates for a period (names/photos, no totals)
router.get("/candidates", async (req, res) => {
  const periodId = Number(req.query.periodId);
  if (!periodId) return res.status(400).json({ error: "periodId required" });
  const pool = await getDbPool();
  try {
    const [rows] = await pool.query(
      `SELECT id, name, state, photoUrl
       FROM Candidates
       WHERE periodId=?
       ORDER BY name ASC`,
      [periodId]
    );
    res.json(rows);
  } catch (e) {
    console.error("public/candidates:", e);
    res.status(500).json({ error: "Failed to load candidates" });
  }
});

module.exports = router;
