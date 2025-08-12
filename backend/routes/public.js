// backend/routes/public.js
const express = require("express");
const jwt = require("jsonwebtoken");
const { getDbPool } = require("../db");

const router = express.Router();

const authOptional = (req, _res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      // ignore
    }
  }
  next();
};

async function latestPeriodWithMeta(pool) {
  const [rows] = await pool.query(
    `SELECT vp.*, meta.name AS title, meta.lga AS description
     FROM VotingPeriod vp
     LEFT JOIN Candidates meta ON meta.periodId = vp.id AND meta.votes < 0
     ORDER BY vp.id DESC LIMIT 1`
  );
  return rows[0] || null;
}

// Latest period (with title/description)
router.get("/period", authOptional, async (_req, res) => {
  try {
    const pool = await getDbPool();
    const p = await latestPeriodWithMeta(pool);
    if (!p) return res.json(null);

    const now = new Date();
    let status = "upcoming";
    if (p.forcedEnded || now > new Date(p.endTime)) status = "ended";
    else if (now >= new Date(p.startTime) && now <= new Date(p.endTime)) status = "active";

    res.json({ ...p, status });
  } catch {
    res.status(500).json({ error: "Error fetching period" });
  }
});

// Candidates for a period (no votes, exclude meta)
router.get("/candidates", async (req, res) => {
  const { periodId } = req.query;
  if (!periodId) return res.status(400).json({ error: "periodId required" });
  try {
    const pool = await getDbPool();
    const [rows] = await pool.query(
      "SELECT id, name, lga, photoUrl FROM Candidates WHERE periodId = ? AND votes >= 0 ORDER BY id DESC",
      [periodId]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Error fetching candidates" });
  }
});

// Results for a period (requires auth & participation; returns votes)
router.get("/results", async (req, res) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token" });
  let user;
  try {
    user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }

  const { periodId } = req.query;
  if (!periodId) return res.status(400).json({ error: "periodId required" });

  try {
    const pool = await getDbPool();
    const [vpRows] = await pool.query("SELECT * FROM VotingPeriod WHERE id = ? LIMIT 1", [periodId]);
    if (!vpRows.length) return res.status(404).json({ error: "Period not found" });
    const p = vpRows[0];

    if (!p.resultsPublished) {
      return res.status(403).json({ error: "Results not published yet" });
    }

    // must have participated
    const [voteRows] = await pool.query("SELECT * FROM Votes WHERE userId = ? AND periodId = ? LIMIT 1", [user.id, periodId]);
    if (!voteRows.length) {
      return res.status(403).json({ error: "You did not participate in this session" });
    }

    const [candRows] = await pool.query(
      "SELECT id, name, lga, photoUrl, votes FROM Candidates WHERE periodId = ? AND votes >= 0 ORDER BY votes DESC, id DESC",
      [periodId]
    );

    // meta
    const [metaRows] = await pool.query(
      "SELECT name AS title, lga AS description FROM Candidates WHERE periodId = ? AND votes < 0 LIMIT 1",
      [periodId]
    );

    // voted candidate name
    const [votedRows] = await pool.query(
      "SELECT c.id, c.name FROM Votes v JOIN Candidates c ON v.candidateId = c.id WHERE v.userId = ? AND v.periodId = ? LIMIT 1",
      [user.id, periodId]
    );

    res.json({
      period: { ...p, ...(metaRows[0] || {}) },
      candidates: candRows,
      youVoted: votedRows[0] || null,
    });
  } catch {
    res.status(500).json({ error: "Error fetching results" });
  }
});

module.exports = router;
