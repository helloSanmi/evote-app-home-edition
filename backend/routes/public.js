// backend/routes/public.js
const express = require("express");
const { getDbPool, sql } = require("../db");
const router = express.Router();

// GET current/last period
router.get("/period", async (req, res) => {
  try {
    const pool = await getDbPool();
    const periodResult = await pool.request().query("SELECT TOP 1 * FROM VotingPeriod ORDER BY id DESC");
    if (periodResult.recordset.length === 0) {
      return res.json(null);
    }
    res.json(periodResult.recordset[0]);
  } catch (error) {
    res.status(500).json({ error: "Error fetching period" });
  }
});

// GET candidates
router.get("/candidates", async (req, res) => {
  const { periodId } = req.query;
  try {
    const pool = await getDbPool();
    if (!periodId) {
      const pr = await pool.request().query("SELECT TOP 1 * FROM VotingPeriod ORDER BY id DESC");
      if (pr.recordset.length === 0) return res.json([]);
      const pid = pr.recordset[0].id;
      const cr = await pool
        .request()
        .input("periodId", sql.Int, pid)
        .query("SELECT * FROM Candidates WHERE periodId = @periodId AND published = 1");
      return res.json(cr.recordset);
    } else {
      const cr = await pool
        .request()
        .input("periodId", sql.Int, periodId)
        .query("SELECT * FROM Candidates WHERE periodId = @periodId AND published = 1");
      return res.json(cr.recordset);
    }
  } catch (error) {
    res.status(500).json({ error: "Error fetching candidates" });
  }
});

// GET user vote
router.get("/uservote", async (req, res) => {
  const { userId, periodId } = req.query;
  if (!userId || !periodId) return res.json({});
  try {
    const pool = await getDbPool();
    const voteResult = await pool
      .request()
      .input("userId", sql.Int, userId)
      .input("periodId", sql.Int, periodId)
      .query("SELECT * FROM Votes WHERE userId = @userId AND periodId = @periodId");
    if (voteResult.recordset.length > 0) {
      return res.json({ candidateId: voteResult.recordset[0].candidateId });
    } else {
      return res.json({});
    }
  } catch (error) {
    res.status(500).json({ error: "Error checking user vote" });
  }
});

// GET public results for a specific period if user participated
router.get("/public-results", async (req, res) => {
  const { userId, periodId } = req.query;
  if (!userId || !periodId) return res.status(400).json({ error: "Missing userId or periodId" });
  try {
    const pool = await getDbPool();
    // Check period
    const periodRes = await pool
      .request()
      .input("periodId", sql.Int, periodId)
      .query("SELECT * FROM VotingPeriod WHERE id = @periodId");
    if (periodRes.recordset.length === 0) {
      return res.json({ results: [], published: false });
    }
    const period = periodRes.recordset[0];
    // Check if user voted
    const voteRes = await pool
      .request()
      .input("userId", sql.Int, userId)
      .input("periodId", sql.Int, periodId)
      .query("SELECT * FROM Votes WHERE userId = @userId AND periodId = @periodId");
    if (voteRes.recordset.length === 0) {
      // no participation
      return res.json({ results: [], published: false, noParticipation: true });
    }
    // check results published
    if (!period.resultsPublished) {
      return res.json({ results: [], published: false });
    }
    // load results
    const results = await pool
      .request()
      .input("periodId", sql.Int, periodId)
      .query("SELECT name, lga, photoUrl, votes FROM Candidates WHERE periodId = @periodId ORDER BY votes DESC");
    return res.json({ results: results.recordset, published: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error fetching results" });
  }
});

// GET only the published periods user participated in
router.get("/periods", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.json([]);
  try {
    const pool = await getDbPool();
    const result = await pool
      .request()
      .input("userId", sql.Int, userId)
      .query(`
        SELECT DISTINCT vp.*
        FROM Votes v
        JOIN VotingPeriod vp ON v.periodId = vp.id
        WHERE v.userId = @userId
          AND vp.resultsPublished = 1
        ORDER BY vp.id DESC
      `);
    return res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: "Error fetching periods" });
  }
});

module.exports = router;
