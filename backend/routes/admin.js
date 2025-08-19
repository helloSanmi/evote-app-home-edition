// backend/routes/admin.js
const express = require("express");
const router = express.Router();
const { getDbPool } = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

// Utility
const withStatus = (row) => {
  const now = Date.now();
  const start = new Date(row.startTime).getTime();
  const end = new Date(row.endTime).getTime();
  let status = "upcoming";
  if (row.forcedEnded || now >= end) status = "ended";
  else if (now >= start && now < end) status = "active";
  return { ...row, status };
};

// ---------------------- Unpublished pool ----------------------

router.get("/unpublished", requireAuth, requireAdmin, async (req, res) => {
  const pool = await getDbPool();
  try {
    const [rows] = await pool.query(
      `SELECT id, name, state, photoUrl
       FROM Candidates
       WHERE periodId IS NULL AND published=0
       ORDER BY id DESC`
    );
    return res.json(rows);
  } catch (e) {
    console.error("admin/unpublished:", e);
    return res.status(500).json({ error: "Failed to load unpublished" });
  }
});

router.post("/candidate", requireAuth, requireAdmin, async (req, res) => {
  const { name, state, photoUrl } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }
  const pool = await getDbPool();
  try {
    await pool.query(
      `INSERT INTO Candidates (name, state, photoUrl, published, periodId)
       VALUES (?, ?, ?, 0, NULL)`,
      [name.trim(), (state || "").trim(), (photoUrl || "").trim()]
    );
    return res.json({ success: true });
  } catch (e) {
    console.error("admin/candidate:", e);
    return res.status(500).json({ error: "Error adding candidate" });
  }
});

router.delete("/remove-candidate", requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.query.candidateId);
  if (!id) return res.status(400).json({ error: "candidateId required" });
  const pool = await getDbPool();
  try {
    const [r] = await pool.query(
      `DELETE FROM Candidates WHERE id=? AND (periodId IS NULL AND published=0)`,
      [id]
    );
    if (r.affectedRows === 0) return res.status(400).json({ error: "Cannot delete: already published/attached" });
    return res.json({ success: true });
  } catch (e) {
    console.error("admin/remove-candidate:", e);
    return res.status(500).json({ error: "Delete failed" });
  }
});

// ---------------------- Start / manage sessions ----------------------

router.post("/voting-period", requireAuth, requireAdmin, async (req, res) => {
  const { title, description, start, end } = req.body || {};
  if (!title || !start || !end) return res.status(400).json({ error: "title, start, end are required" });

  const pool = await getDbPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [ins] = await conn.query(
      `INSERT INTO VotingPeriod (startTime, endTime, resultsPublished, forcedEnded, title, description)
       VALUES (?, ?, 0, 0, ?, ?)`,
      [new Date(start), new Date(end), title.trim(), (description || "").trim()]
    );
    const periodId = ins.insertId;

    // Attach & publish all unpublished candidates to this new period
    await conn.query(
      `UPDATE Candidates SET periodId=?, published=1 WHERE periodId IS NULL AND published=0`,
      [periodId]
    );

    await conn.commit();

    try {
      const io = req.app.get("socketio");
      req.app.get("emitUpdate")?.("sessionStarted", { periodId });
      io && io.emit("sessionStarted", { periodId });
    } catch {}

    return res.json({ success: true, periodId });
  } catch (e) {
    await conn.rollback();
    console.error("admin/voting-period:", e);
    return res.status(500).json({ error: "Error starting voting" });
  } finally {
    conn.release();
  }
});

/**
 * Active / Upcoming / Awaiting Publish list for Admin dashboard
 * IMPORTANT CHANGE:
 *   Only return sessions with resultsPublished = 0
 *   (published sessions will appear under /admin/periods i.e. “Past Sessions”)
 */
router.get("/active-periods", requireAuth, requireAdmin, async (req, res) => {
  const pool = await getDbPool();
  try {
    const [rows] = await pool.query(
      `SELECT id, title, description, startTime, endTime, resultsPublished, forcedEnded
       FROM VotingPeriod
       WHERE resultsPublished = 0
       ORDER BY id DESC`
    );
    return res.json(rows.map(withStatus));
  } catch (e) {
    console.error("admin/active-periods:", e);
    return res.status(500).json({ error: "Failed to load sessions" });
  }
});

// Live votes for a specific period
router.get("/live-votes", requireAuth, requireAdmin, async (req, res) => {
  const periodId = Number(req.query.periodId);
  if (!periodId) return res.status(400).json({ error: "periodId required" });
  const pool = await getDbPool();
  try {
    const [rows] = await pool.query(
      `SELECT id, name, state, photoUrl, votes
       FROM Candidates
       WHERE periodId=?
       ORDER BY votes DESC, name ASC`,
      [periodId]
    );
    return res.json(rows);
  } catch (e) {
    console.error("admin/live-votes:", e);
    return res.status(500).json({ error: "Failed to load live votes" });
  }
});

// Publish results (single period)
router.post("/publish-results", requireAuth, requireAdmin, async (req, res) => {
  const periodId = Number(req.query.periodId);
  if (!periodId) return res.status(400).json({ error: "periodId required" });

  const pool = await getDbPool();
  try {
    const [[p]] = await pool.query(
      `SELECT id, endTime, forcedEnded, resultsPublished FROM VotingPeriod WHERE id=?`,
      [periodId]
    );
    if (!p) return res.status(404).json({ error: "Period not found" });
    if (p.resultsPublished) return res.json({ success: true, already: true });

    const ended = p.forcedEnded || Date.now() >= new Date(p.endTime).getTime();
    if (!ended) return res.status(400).json({ error: "Voting not ended" });

    await pool.query(`UPDATE VotingPeriod SET resultsPublished=1 WHERE id=?`, [periodId]);

    try {
      const io = req.app.get("socketio");
      req.app.get("emitUpdate")?.("resultsPublished", { periodId });
      io && io.emit("resultsPublished", { periodId });
    } catch {}

    return res.json({ success: true });
  } catch (e) {
    console.error("admin/publish-results:", e);
    return res.status(500).json({ error: "Error publishing results" });
  }
});

// End early
router.post("/end-voting-early", requireAuth, requireAdmin, async (req, res) => {
  const periodId = Number(req.query.periodId);
  if (!periodId) return res.status(400).json({ error: "periodId required" });
  const pool = await getDbPool();
  try {
    await pool.query(`UPDATE VotingPeriod SET forcedEnded=1 WHERE id=?`, [periodId]);
    return res.json({ success: true });
  } catch (e) {
    console.error("admin/end-voting-early:", e);
    return res.status(500).json({ error: "Error ending voting" });
  }
});

// ---------------------- Previous sessions ----------------------

router.get("/periods", requireAuth, requireAdmin, async (req, res) => {
  const pool = await getDbPool();
  try {
    const [rows] = await pool.query(
      `SELECT id, title, description, startTime, endTime, resultsPublished, forcedEnded
       FROM VotingPeriod
       ORDER BY id DESC`
    );
    return res.json(rows);
  } catch (e) {
    console.error("admin/periods:", e);
    return res.status(500).json({ error: "Failed to load periods" });
  }
});

router.get("/candidates", requireAuth, requireAdmin, async (req, res) => {
  const periodId = Number(req.query.periodId);
  if (!periodId) return res.status(400).json({ error: "periodId required" });
  const pool = await getDbPool();
  try {
    const [rows] = await pool.query(
      `SELECT id, name, state, photoUrl, votes
       FROM Candidates
       WHERE periodId=?
       ORDER BY votes DESC, name ASC`,
      [periodId]
    );
    return res.json(rows);
  } catch (e) {
    console.error("admin/candidates:", e);
    return res.status(500).json({ error: "Failed to load candidates" });
  }
});

router.get("/audit", requireAuth, requireAdmin, async (req, res) => {
  const periodId = Number(req.query.periodId);
  if (!periodId) return res.status(400).json({ error: "periodId required" });
  const pool = await getDbPool();
  try {
    const [[c]] = await pool.query(`SELECT COALESCE(SUM(votes),0) AS candidateVotes FROM Candidates WHERE periodId=?`, [periodId]);
    const [[v]] = await pool.query(`SELECT COUNT(*) AS voteRows FROM Votes WHERE periodId=?`, [periodId]);
    return res.json({
      candidateVotes: Number(c.candidateVotes || 0),
      voteRows: Number(v.voteRows || 0),
      consistent: Number(c.candidateVotes || 0) === Number(v.voteRows || 0),
    });
  } catch (e) {
    console.error("admin/audit:", e);
    return res.status(500).json({ error: "Failed to load audit" });
  }
});

module.exports = router;
