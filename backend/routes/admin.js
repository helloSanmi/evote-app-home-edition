// backend/routes/admin.js
const express = require("express");
const { getDbPool, sql } = require("../db");
const router = express.Router();
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;

const adminMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token provided" });
  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Invalid token format" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.email === "admin" || decoded.email === "admin@example.com" || decoded.id === 9999) {
      req.userId = decoded.id;
      req.userEmail = decoded.email;
      return next();
    } else {
      return res.status(403).json({ error: "Not admin" });
    }
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// Remove Candidate (Only if published=0)
router.delete("/remove-candidate", adminMiddleware, async (req, res) => {
  const { candidateId } = req.query;
  if (!candidateId) return res.status(400).json({ error: "Candidate ID required" });
  try {
    const pool = await getDbPool();
    await pool
      .request()
      .input("candidateId", sql.Int, candidateId)
      .query("DELETE FROM Candidates WHERE id = @candidateId AND published = 0");
    req.app.get("emitUpdate")("candidatesUpdated");
    return res.json({ message: "Candidate removed" });
  } catch (error) {
    return res.status(500).json({ error: "Error removing candidate" });
  }
});

// Start Voting (Creates new period + publishes all unpublished)
router.post("/start-voting", adminMiddleware, async (req, res) => {
  const { startTime, endTime } = req.body;
  if (!startTime || !endTime) return res.status(400).json({ error: "Start and end times required" });
  try {
    const pool = await getDbPool();
    const insertResult = await pool
      .request()
      .input("startTime", sql.DateTime2, startTime)
      .input("endTime", sql.DateTime2, endTime)
      .input("forcedEnded", sql.Bit, 0)
      .query(`
        INSERT INTO VotingPeriod (startTime, endTime, resultsPublished, forcedEnded)
        OUTPUT INSERTED.id
        VALUES (@startTime, @endTime, 0, @forcedEnded)
      `);

    const periodId = insertResult.recordset[0].id;
    await pool.request().input("periodId", sql.Int, periodId).query(`
      UPDATE Candidates
      SET periodId = @periodId, published = 1
      WHERE published = 0
    `);

    req.app.get("emitUpdate")("votingStarted", { periodId });
    return res.json({ message: "Voting started", periodId });
  } catch (error) {
    return res.status(500).json({ error: "Error starting voting" });
  }
});

// Publish Results (Only if period ended)
router.post("/publish-results", adminMiddleware, async (req, res) => {
  try {
    const pool = await getDbPool();
    const periodResult = await pool.request().query("SELECT TOP 1 * FROM VotingPeriod ORDER BY id DESC");
    if (periodResult.recordset.length === 0) {
      return res.status(400).json({ error: "No voting period set" });
    }
    const period = periodResult.recordset[0];
    const now = new Date();
    const end = new Date(period.endTime);
    if (now < end && !period.forcedEnded) {
      return res.status(400).json({ error: "Cannot publish results before voting has ended" });
    }
    await pool.request().query(`
      UPDATE VotingPeriod
      SET resultsPublished = 1
      WHERE id = (SELECT TOP 1 id FROM VotingPeriod ORDER BY id DESC)
    `);
    req.app.get("emitUpdate")("resultsPublished");
    return res.json({ message: "Results published" });
  } catch (error) {
    return res.status(500).json({ error: "Error publishing results" });
  }
});

// End Voting (Forced)
router.post("/end-voting", adminMiddleware, async (req, res) => {
  try {
    const pool = await getDbPool();
    await pool
      .request()
      .query("UPDATE VotingPeriod SET forcedEnded = 1 WHERE id = (SELECT TOP 1 id FROM VotingPeriod ORDER BY id DESC)");
    req.app.get("emitUpdate")("votingStarted");
    res.json({ message: "Voting ended early" });
  } catch (error) {
    res.status(500).json({ error: "Error ending voting" });
  }
});

// Add Candidate (If no period yet, store periodId=NULL, published=0)
router.post("/add-candidate", adminMiddleware, async (req, res) => {
  const { name, lga, photoUrl } = req.body;
  try {
    const pool = await getDbPool();
    const periodResult = await pool.request().query("SELECT TOP 1 * FROM VotingPeriod ORDER BY id DESC");
    let periodId = null;
    if (periodResult.recordset.length > 0) {
      periodId = periodResult.recordset[0].id;
    }

    await pool
      .request()
      .input("name", sql.NVarChar, name)
      .input("lga", sql.NVarChar, lga)
      .input("photoUrl", sql.NVarChar, photoUrl)
      .input("periodId", sql.Int, periodId)
      .query(`
        INSERT INTO Candidates (name, lga, photoUrl, periodId, published, votes)
        VALUES (@name, @lga, @photoUrl, @periodId, 0, 0)
      `);
    res.status(201).json({ message: "Candidate added" });
  } catch (error) {
    res.status(500).json({ error: "Error adding candidate" });
  }
});

// Get Candidates (Either for last period OR those with periodId=NULL)
router.get("/get-candidates", adminMiddleware, async (req, res) => {
  try {
    const pool = await getDbPool();
    const periodResult = await pool.request().query("SELECT TOP 1 * FROM VotingPeriod ORDER BY id DESC");
    if (periodResult.recordset.length === 0) {
      const result = await pool.request().query(`
        SELECT * FROM Candidates
        WHERE periodId IS NULL
        ORDER BY id DESC
      `);
      return res.json(result.recordset);
    } else {
      const periodId = periodResult.recordset[0].id;
      const result = await pool.request().query(`
        SELECT * FROM Candidates
        WHERE periodId = ${periodId}
           OR (periodId IS NULL)
        ORDER BY id DESC
      `);
      return res.json(result.recordset);
    }
  } catch (error) {
    res.status(500).json({ error: "Error fetching candidates" });
  }
});

// Get Current Period
router.get("/get-period", adminMiddleware, async (req, res) => {
  try {
    const pool = await getDbPool();
    const result = await pool.request().query("SELECT TOP 1 * FROM VotingPeriod ORDER BY id DESC");
    if (result.recordset.length > 0) {
      res.json(result.recordset[0]);
    } else {
      res.json(null);
    }
  } catch (error) {
    res.status(500).json({ error: "Error fetching voting period" });
  }
});

// Get Results (Current Period)
router.get("/results", adminMiddleware, async (req, res) => {
  try {
    const pool = await getDbPool();
    const periodResult = await pool.request().query("SELECT TOP 1 * FROM VotingPeriod ORDER BY id DESC");
    if (periodResult.recordset.length === 0) {
      return res.json([]);
    }
    const periodId = periodResult.recordset[0].id;
    const result = await pool
      .request()
      .input("periodId", sql.Int, periodId)
      .query("SELECT name, lga, photoUrl, votes FROM Candidates WHERE periodId = @periodId ORDER BY votes DESC");
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: "Error fetching results" });
  }
});

// List All Periods
router.get("/periods", adminMiddleware, async (req, res) => {
  try {
    const pool = await getDbPool();
    const result = await pool.request().query("SELECT * FROM VotingPeriod ORDER BY id DESC");
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: "Error fetching periods" });
  }
});

// Get Candidates for a specific Past Period
router.get("/candidates", adminMiddleware, async (req, res) => {
  const { periodId } = req.query;
  if (!periodId) return res.json([]);
  try {
    const pool = await getDbPool();
    const result = await pool
      .request()
      .input("periodId", sql.Int, periodId)
      .query("SELECT * FROM Candidates WHERE periodId = @periodId");
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: "Error fetching candidates" });
  }
});

// Get Results for a specific Past Period
router.get("/results", adminMiddleware, async (req, res) => {
  const { periodId } = req.query;
  if (!periodId) return res.json([]);
  try {
    const pool = await getDbPool();
    const result = await pool
      .request()
      .input("periodId", sql.Int, periodId)
      .query("SELECT name, lga, photoUrl, votes FROM Candidates WHERE periodId = @periodId ORDER BY votes DESC");
    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: "Error fetching results" });
  }
});

module.exports = router;
