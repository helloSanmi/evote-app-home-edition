// backend/routes/vote.js
const express = require("express");
const router = express.Router();
const { getDbPool } = require("../db");
const { requireAuth } = require("../middleware/auth");

// cast vote: { candidateId, periodId }
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { candidateId, periodId } = req.body || {};
    if (!candidateId || !periodId) return res.status(400).json({ error: "candidateId and periodId required" });

    const pool = await getDbPool();

    const [[p]] = await pool.query(`SELECT * FROM VotingPeriod WHERE id=?`, [periodId]);
    if (!p) return res.status(404).json({ error: "Session not found" });
    if (p.resultsPublished || p.forcedEnded) return res.status(400).json({ error: "Voting ended" });

    const now = new Date();
    if (!(now >= new Date(p.startTime) && now < new Date(p.endTime))) {
      return res.status(400).json({ error: "Not within voting window" });
    }

    const [[exists]] = await pool.query(`SELECT 1 FROM Votes WHERE userId=? AND periodId=?`, [userId, periodId]);
    if (exists) return res.status(400).json({ error: "You have already voted" });

    const [[c]] = await pool.query(`SELECT id, name FROM Candidates WHERE id=? AND periodId=?`, [candidateId, periodId]);
    if (!c) return res.status(400).json({ error: "Invalid candidate" });

    await pool.query(`INSERT INTO Votes (userId, candidateId, periodId) VALUES (?,?,?)`, [userId, candidateId, periodId]);
    await pool.query(`UPDATE Candidates SET votes=votes+1 WHERE id=?`, [candidateId]);

    try { req.app.get("emitUpdate")("voteUpdate", { periodId }); } catch {}
    res.json({ success: true, candidateId, candidateName: c.name });
  } catch (e) {
    console.error("vote/post:", e);
    res.status(500).json({ error: "Error casting vote" });
  }
});

// status for a period
router.get("/status", requireAuth, async (req, res) => {
  try {
    const pid = Number(req.query.periodId);
    if (!pid) return res.status(400).json({ error: "periodId required" });

    const pool = await getDbPool();
    const userId = req.user.id;

    const [[p]] = await pool.query(`SELECT * FROM VotingPeriod WHERE id=?`, [pid]);
    if (!p) return res.status(404).json({ error: "Session not found" });

    const now = Date.now();
    let status = "upcoming";
    if (p.forcedEnded || now >= new Date(p.endTime).getTime()) status = "ended";
    else if (now >= new Date(p.startTime).getTime()) status = "active";

    const [[v]] = await pool.query(
      `SELECT v.candidateId AS id, c.name
         FROM Votes v JOIN Candidates c ON c.id=v.candidateId
       WHERE v.userId=? AND v.periodId=?`, [userId, pid]);

    res.json({ status, youVoted: v || null, hasVoted: !!v });
  } catch (e) {
    console.error("vote/status:", e);
    res.status(500).json({ error: "Failed" });
  }
});

module.exports = router;
