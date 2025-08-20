// backend/routes/user.js
const express = require("express");
const router = express.Router();

const { getDbPool } = require("../db");
const { requireAuth } = require("../middleware/auth");

/**
 * GET /api/user/participated
 * Returns all voting sessions the authenticated user has participated in
 * (published and unpublished), newest first.
 *
 * Frontend can decide what to show; results are only visible when published.
 */
router.get("/participated", requireAuth, async (req, res) => {
  try {
    const pool = await getDbPool();

    const [rows] = await pool.query(
      `
      SELECT DISTINCT
        vp.id,
        vp.title,
        vp.description,
        vp.startTime,
        vp.endTime,
        vp.resultsPublished,
        vp.forcedEnded,
        COALESCE(vp.scope, 'national') AS scope,
        vp.scopeState
      FROM Votes v
      INNER JOIN VotingPeriod vp ON vp.id = v.periodId
      WHERE v.userId = ?
      ORDER BY vp.endTime DESC, vp.id DESC
      `,
      [req.user.id]
    );

    res.json(rows || []);
  } catch (e) {
    console.error("GET /api/user/participated:", e);
    res.status(500).json({ error: "Failed to load your sessions" });
  }
});

module.exports = router;
