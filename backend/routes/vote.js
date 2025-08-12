// backend/routes/vote.js
const express = require("express");
const jwt = require("jsonwebtoken");
const { getDbPool } = require("../db");

const router = express.Router();

function requireUser(req, res, next) {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

async function latestPeriod(pool) {
  const [rows] = await pool.query("SELECT * FROM VotingPeriod ORDER BY id DESC LIMIT 1");
  return rows[0] || null;
}

// Status: have I voted in (periodId | latest)?
router.get("/status", requireUser, async (req, res) => {
  const { periodId } = req.query;
  try {
    const pool = await getDbPool();
    let pid = periodId;
    if (!pid) {
      const p = await latestPeriod(pool);
      if (!p) return res.json({ hasVoted: false, periodId: null, youVoted: null });
      pid = p.id;
    }
    const [rows] = await pool.query(
      `SELECT v.candidateId, c.name
       FROM Votes v JOIN Candidates c ON c.id = v.candidateId
       WHERE v.userId = ? AND v.periodId = ? LIMIT 1`,
      [req.user.id, pid]
    );
    if (!rows.length) return res.json({ hasVoted: false, periodId: Number(pid), youVoted: null });
    res.json({ hasVoted: true, periodId: Number(pid), youVoted: { id: rows[0].candidateId, name: rows[0].name } });
  } catch {
    res.status(500).json({ error: "Error fetching vote status" });
  }
});

// Cast vote in latest active period
router.post("/", requireUser, async (req, res) => {
  const { candidateId } = req.body || {};
  if (!candidateId) return res.status(400).json({ error: "candidateId required" });

  try {
    const pool = await getDbPool();
    const p = await latestPeriod(pool);
    if (!p) return res.status(400).json({ error: "No voting session" });

    const now = new Date();
    const active = !p.forcedEnded && now >= new Date(p.startTime) && now <= new Date(p.endTime);
    if (!active) return res.status(400).json({ error: "Voting is not active" });

    // candidate must belong to this period and not be the meta row
    const [candRows] = await pool.query(
      "SELECT id, name FROM Candidates WHERE id = ? AND periodId = ? AND votes >= 0 LIMIT 1",
      [candidateId, p.id]
    );
    if (!candRows.length) return res.status(400).json({ error: "Invalid candidate" });

    // ensure user hasn't voted in this period
    const [existing] = await pool.query(
      "SELECT id FROM Votes WHERE userId = ? AND periodId = ? LIMIT 1",
      [req.user.id, p.id]
    );
    if (existing.length) return res.status(400).json({ error: "You already voted" });

    // record vote
    await pool.query("INSERT INTO Votes (userId, candidateId, periodId) VALUES (?, ?, ?)", [
      req.user.id,
      candidateId,
      p.id,
    ]);
    await pool.query("UPDATE Candidates SET votes = votes + 1 WHERE id = ?", [candidateId]);

    req.app.get("emitUpdate")?.("voteUpdate", { periodId: p.id, candidateId });

    res.json({ success: true, candidateId, candidateName: candRows[0].name });
  } catch {
    res.status(500).json({ error: "Error casting vote" });
  }
});

module.exports = router;
