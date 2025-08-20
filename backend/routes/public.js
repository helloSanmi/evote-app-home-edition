// backend/routes/public.js
const express = require("express");
const router = express.Router();
const { getDbPool } = require("../db");
const { requireAuth } = require("../middleware/auth");

/**
 * GET /api/public/periods
 * Returns all voting sessions (active/upcoming/ended) ordered by startTime desc.
 * If you later add eligibility filtering, compute it here using req.user.
 */
router.get("/periods", requireAuth, async (req, res) => {
  try {
    const pool = await getDbPool();
    const [rows] = await pool.query(
      `SELECT id, title, description, startTime, endTime, resultsPublished, forcedEnded
       FROM VotingPeriod
       ORDER BY startTime DESC, id DESC`
    );
    res.json(rows || []);
  } catch (e) {
    console.error("GET /public/periods:", e);
    res.status(500).json({ error: "Failed to load periods" });
  }
});

/**
 * GET /api/public/candidates?periodId=#
 * Candidates for a specific period (for user voting UI).
 */
router.get("/candidates", async (req, res) => {
  try {
    const periodId = Number(req.query.periodId);
    if (!periodId) return res.status(400).json({ error: "periodId required" });
    const pool = await getDbPool();
    const [rows] = await pool.query(
      `SELECT id, name, state, lga, photoUrl, votes
       FROM Candidates
       WHERE periodId = ?
       ORDER BY id ASC`,
      [periodId]
    );
    res.json(rows || []);
  } catch (e) {
    console.error("GET /public/candidates:", e);
    res.status(500).json({ error: "Failed to load candidates" });
  }
});

/**
 * GET /api/public/results?periodId=#
 * Returns results if the user participated in this period and results are published.
 */
router.get("/results", requireAuth, async (req, res) => {
  try {
    const periodId = Number(req.query.periodId);
    if (!periodId) return res.status(400).json({ error: "periodId required" });

    const pool = await getDbPool();

    const [[period]] = await pool.query(
      `SELECT id, title, description, startTime, endTime, resultsPublished
       FROM VotingPeriod WHERE id=?`, [periodId]
    );
    if (!period) return res.status(404).json({ error: "Period not found" });
    if (!period.resultsPublished) return res.status(403).json({ error: "Results not published yet" });

    // must have participated
    const [[voted]] = await pool.query(
      `SELECT id FROM Votes WHERE userId=? AND periodId=? LIMIT 1`, [req.user.id, periodId]
    );
    if (!voted) return res.status(403).json({ error: "You didn’t participate in this session" });

    const [cands] = await pool.query(
      `SELECT id, name, state, lga, photoUrl, votes
       FROM Candidates WHERE periodId=? ORDER BY votes DESC, id ASC`,
      [periodId]
    );

    res.json({ period, candidates: cands || [] });
  } catch (e) {
    console.error("GET /public/results:", e);
    res.status(500).json({ error: "Failed to load results" });
  }
});

module.exports = router;
