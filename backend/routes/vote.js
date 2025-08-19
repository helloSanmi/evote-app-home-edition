// backend/routes/vote.js
const express = require("express");
const router = express.Router();
const { getDbPool } = require("../db");
const { requireAuth } = require("../middleware/auth");

// utility
const isPeriodActive = (row) => {
  const now = Date.now();
  const start = new Date(row.startTime).getTime();
  const end = new Date(row.endTime).getTime();
  return !row.forcedEnded && now >= start && now < end && !row.resultsPublished;
};

// GET /api/vote/status?periodId=#
router.get("/status", requireAuth, async (req, res) => {
  const periodId = Number(req.query.periodId);
  if (!periodId) return res.status(400).json({ error: "periodId required" });

  const pool = await getDbPool();
  try {
    const [[p]] = await pool.query(
      `SELECT id, startTime, endTime, resultsPublished, forcedEnded FROM VotingPeriod WHERE id=?`,
      [periodId]
    );
    if (!p) return res.status(404).json({ error: "Period not found" });

    const [[v]] = await pool.query(
      `SELECT candidateId FROM Votes WHERE userId=? AND periodId=? LIMIT 1`,
      [req.user.id, periodId]
    );

    let youVoted = null;
    if (v) {
      const [[c]] = await pool.query(`SELECT id, name FROM Candidates WHERE id=?`, [v.candidateId]);
      youVoted = c ? { id: c.id, name: c.name } : null;
    }

    return res.json({
      hasVoted: !!v,
      youVoted,
      active: isPeriodActive(p),
    });
  } catch (e) {
    console.error("vote/status:", e);
    return res.status(500).json({ error: "Failed to load status" });
  }
});

// POST /api/vote  { candidateId }
router.post("/", requireAuth, async (req, res) => {
  const candidateId = Number(req.body?.candidateId);
  if (!candidateId) return res.status(400).json({ error: "candidateId required" });

  const pool = await getDbPool();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // candidate + period
    const [[cand]] = await conn.query(
      `SELECT c.id, c.name, c.periodId, p.startTime, p.endTime, p.resultsPublished, p.forcedEnded
       FROM Candidates c
       JOIN VotingPeriod p ON p.id=c.periodId
       WHERE c.id=?`,
      [candidateId]
    );
    if (!cand) {
      await conn.rollback();
      return res.status(404).json({ error: "Candidate not found" });
    }
    if (!isPeriodActive(cand)) {
      await conn.rollback();
      return res.status(400).json({ error: "Voting period is not active" });
    }

    // ensure user has not voted in this period
    const [[already]] = await conn.query(
      `SELECT id FROM Votes WHERE userId=? AND periodId=? LIMIT 1`,
      [req.user.id, cand.periodId]
    );
    if (already) {
      await conn.rollback();
      return res.status(400).json({ error: "You have already voted in this session" });
    }

    // cast vote + increment candidate tally
    await conn.query(
      `INSERT INTO Votes (userId, candidateId, periodId) VALUES (?,?,?)`,
      [req.user.id, cand.id, cand.periodId]
    );
    await conn.query(`UPDATE Candidates SET votes = votes + 1 WHERE id=?`, [cand.id]);

    await conn.commit();

    // notify sockets
    try {
      const io = req.app.get("socketio");
      req.app.get("emitUpdate")?.("voteUpdate", { periodId: cand.periodId });
      io && io.emit("voteUpdate", { periodId: cand.periodId });
    } catch {}

    return res.json({ success: true, candidateId: cand.id, candidateName: cand.name });
  } catch (e) {
    await conn.rollback();
    // handle unique constraint (userId, periodId)
    if (e && e.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "You have already voted in this session" });
    }
    console.error("vote/post:", e);
    return res.status(500).json({ error: "Error casting vote" });
  } finally {
    conn.release();
  }
});

module.exports = router;
