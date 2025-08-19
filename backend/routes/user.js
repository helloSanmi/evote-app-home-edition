// backend/routes/user.js
const express = require("express");
const router = express.Router();
const { getDbPool } = require("../db");
const { requireAuth } = require("../middleware/auth");

// Periods the user participated in
router.get("/participated-periods", requireAuth, async (req, res) => {
  const userId = req.user.id;
  const pool = await getDbPool();
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT p.id, p.title, p.description, p.startTime, p.endTime, p.resultsPublished, p.forcedEnded
       FROM VotingPeriod p
       JOIN Votes v ON v.periodId=p.id
       WHERE v.userId=?
       ORDER BY p.id DESC`,
      [userId]
    );
    res.json(rows);
  } catch (e) {
    console.error("user/participated-periods:", e);
    res.status(500).json({ error: "Failed to load sessions" });
  }
});

// Results for a period (only to participants)
router.get("/results", requireAuth, async (req, res) => {
  const periodId = Number(req.query.periodId);
  if (!periodId) return res.status(400).json({ error: "periodId required" });

  const userId = req.user.id;
  const pool = await getDbPool();
  try {
    const [[p]] = await pool.query(`SELECT * FROM VotingPeriod WHERE id=?`, [periodId]);
    if (!p) return res.status(404).json({ error: "Period not found" });
    if (!p.resultsPublished) return res.status(403).json({ error: "Results not published yet" });

    const [[voted]] = await pool.query(`SELECT candidateId FROM Votes WHERE periodId=? AND userId=?`, [periodId, userId]);
    if (!voted) return res.status(403).json({ error: "Not eligible to view results for this session" });

    const [cands] = await pool.query(
      `SELECT id, name, state, photoUrl, votes
       FROM Candidates
       WHERE periodId=?
       ORDER BY votes DESC, name ASC`,
      [periodId]
    );

    const youVoted = voted
      ? (() => {
          const c = cands.find((x) => x.id === voted.candidateId);
          return c ? { id: c.id, name: c.name } : null;
        })()
      : null;

    res.json({
      period: {
        id: p.id,
        title: p.title,
        description: p.description,
        startTime: p.startTime,
        endTime: p.endTime,
        resultsPublished: !!p.resultsPublished,
        forcedEnded: !!p.forcedEnded,
      },
      candidates: cands,
      youVoted,
    });
  } catch (e) {
    console.error("user/results:", e);
    res.status(500).json({ error: "Failed to load results" });
  }
});

module.exports = router;
