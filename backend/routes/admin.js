// backend/routes/admin.js  (replace the existing file)
const express = require("express");
const jwt = require("jsonwebtoken");
const { getDbPool } = require("../db");

const router = express.Router();

// ---- helpers ----
const requireAdmin = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.isAdmin) return res.status(403).json({ error: "Not admin" });
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
};

async function getLatestPeriodRow(pool) {
  const [rows] = await pool.query("SELECT * FROM VotingPeriod ORDER BY id DESC LIMIT 1");
  return rows[0] || null;
}

async function withMeta(pool, rows) {
  if (!rows?.length) return rows;
  const ids = rows.map((r) => r.id);
  if (!ids.length) return rows;
  const [metaRows] = await pool.query(
    `SELECT periodId, name AS title, lga AS description
     FROM Candidates WHERE votes < 0 AND periodId IN (${ids.map(() => "?").join(",")})`,
    ids
  );
  const metaByPid = new Map(metaRows.map((m) => [m.periodId, m]));
  return rows.map((r) => ({ ...r, ...(metaByPid.get(r.id) || {}) }));
}

// ---- admin routes ----

// Add candidate (unpublished)
router.post("/candidate", requireAdmin, async (req, res) => {
  try {
    let { name, lga, photoUrl } = req.body || {};
    name = (name || "").trim();
    lga = (lga || "").trim() || null;
    photoUrl = (photoUrl || "").trim() || null;
    if (!name) return res.status(400).json({ error: "Name is required" });
    if (photoUrl && photoUrl.length > 255) return res.status(400).json({ error: "Photo URL too long" });

    const pool = await getDbPool();
    await pool.query(
      "INSERT INTO Candidates (name, lga, photoUrl, periodId, published, votes) VALUES (?, ?, ?, NULL, 0, 0)",
      [name, lga, photoUrl]
    );
    res.status(201).json({ success: true });
  } catch {
    res.status(500).json({ error: "Error adding candidate" });
  }
});

// Unpublished list
router.get("/unpublished", requireAdmin, async (_req, res) => {
  try {
    const pool = await getDbPool();
    const [rows] = await pool.query(
      "SELECT id, name, lga, photoUrl, createdAt FROM Candidates WHERE published = 0 ORDER BY id DESC"
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Error fetching unpublished candidates" });
  }
});

// Delete unpublished candidate
router.delete("/remove-candidate", requireAdmin, async (req, res) => {
  const { candidateId } = req.query;
  if (!candidateId) return res.status(400).json({ error: "candidateId required" });
  try {
    const pool = await getDbPool();
    const [r] = await pool.query("DELETE FROM Candidates WHERE id = ? AND published = 0", [candidateId]);
    if (!r.affectedRows) return res.status(400).json({ error: "Cannot delete (not found or already published)" });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Error removing candidate" });
  }
});

// Start voting (publish all unpublished -> new period) + meta row (votes=-1)
router.post("/voting-period", requireAdmin, async (req, res) => {
  const { title, description, start, end } = req.body || {};
  if (!title || !start || !end) return res.status(400).json({ error: "Title, start and end are required" });
  try {
    const pool = await getDbPool();
    const [[{ c }]] = await pool.query("SELECT COUNT(*) AS c FROM Candidates WHERE published = 0");
    if (!c) return res.status(400).json({ error: "Add candidates first" });

    const [ins] = await pool.query(
      "INSERT INTO VotingPeriod (startTime, endTime, resultsPublished, forcedEnded) VALUES (?, ?, 0, 0)",
      [start, end]
    );
    const periodId = ins.insertId;

    await pool.query("UPDATE Candidates SET periodId = ?, published = 1 WHERE published = 0", [periodId]);
    await pool.query(
      "INSERT INTO Candidates (name, lga, photoUrl, periodId, published, votes) VALUES (?, ?, NULL, ?, 1, -1)",
      [title.trim(), (description || "").trim() || null, periodId]
    );

    req.app.get("emitUpdate")?.("voteUpdate", { periodId });
    res.json({ success: true, periodId });
  } catch {
    res.status(500).json({ error: "Error starting voting" });
  }
});

// Latest period (raw)
router.get("/get-period", requireAdmin, async (_req, res) => {
  try {
    const pool = await getDbPool();
    const p = await getLatestPeriodRow(pool);
    res.json(p || null);
  } catch {
    res.status(500).json({ error: "Error fetching period" });
  }
});

// Period meta
router.get("/meta", requireAdmin, async (req, res) => {
  const { periodId } = req.query;
  if (!periodId) return res.status(400).json({ error: "periodId required" });
  try {
    const pool = await getDbPool();
    const [rows] = await pool.query(
      "SELECT name AS title, lga AS description FROM Candidates WHERE periodId = ? AND votes < 0 LIMIT 1",
      [periodId]
    );
    res.json(rows[0] || { title: null, description: null });
  } catch {
    res.status(500).json({ error: "Error fetching meta" });
  }
});

// Publish results (idempotent)
router.post("/publish-results", requireAdmin, async (_req, res) => {
  try {
    const pool = await getDbPool();
    const p = await getLatestPeriodRow(pool);
    if (!p) return res.status(400).json({ error: "No period found" });

    const now = new Date();
    const ended = p.forcedEnded || now >= new Date(p.endTime);
    if (!ended) return res.status(400).json({ error: "Voting not ended yet" });

    if (!p.resultsPublished) {
      await pool.query("UPDATE VotingPeriod SET resultsPublished = 1 WHERE id = ?", [p.id]);
      req.app.get("emitUpdate")?.("resultsPublished", { periodId: p.id });
      return res.json({ success: true, already: false });
    }
    return res.json({ success: true, already: true });
  } catch {
    res.status(500).json({ error: "Error publishing results" });
  }
});

// End voting early
router.post("/end-voting-early", requireAdmin, async (_req, res) => {
  try {
    const pool = await getDbPool();
    const p = await getLatestPeriodRow(pool);
    if (!p) return res.status(400).json({ error: "No period found" });
    if (p.forcedEnded) return res.json({ success: true, already: true });

    await pool.query("UPDATE VotingPeriod SET endTime = NOW(), forcedEnded = 1 WHERE id = ?", [p.id]);
    res.json({ success: true, already: false });
  } catch {
    res.status(500).json({ error: "Error ending voting" });
  }
});

// All periods (with title/description)
router.get("/periods", requireAdmin, async (_req, res) => {
  try {
    const pool = await getDbPool();
    const [rows] = await pool.query("SELECT * FROM VotingPeriod ORDER BY id DESC");
    const withTitles = await withMeta(pool, rows);
    res.json(withTitles);
  } catch {
    res.status(500).json({ error: "Error fetching periods" });
  }
});

// Candidates for a period (exclude meta)
router.get("/candidates", requireAdmin, async (req, res) => {
  const { periodId } = req.query;
  if (!periodId) return res.status(400).json({ error: "periodId required" });
  try {
    const pool = await getDbPool();
    const [rows] = await pool.query(
      "SELECT id, name, lga, photoUrl, votes FROM Candidates WHERE periodId = ? AND votes >= 0 ORDER BY votes DESC, id DESC",
      [periodId]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Error fetching candidates" });
  }
});

// Live votes (only if active)
router.get("/live-votes", requireAdmin, async (_req, res) => {
  try {
    const pool = await getDbPool();
    const p = await getLatestPeriodRow(pool);
    if (!p) return res.json([]);
    const now = new Date();
    const active = !p.forcedEnded && now >= new Date(p.startTime) && now < new Date(p.endTime);
    if (!active) return res.json([]);
    const [rows] = await pool.query(
      "SELECT id, name, lga, photoUrl, votes FROM Candidates WHERE periodId = ? AND votes >= 0 ORDER BY votes DESC",
      [p.id]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Error fetching live votes" });
  }
});

// Simple audit
router.get("/audit", requireAdmin, async (req, res) => {
  const { periodId } = req.query;
  if (!periodId) return res.status(400).json({ error: "periodId required" });
  try {
    const pool = await getDbPool();
    const [[{ sumVotes = 0 }]] = await pool.query(
      "SELECT COALESCE(SUM(votes),0) AS sumVotes FROM Candidates WHERE periodId = ? AND votes >= 0",
      [periodId]
    );
    const [[{ voteRows = 0 }]] = await pool.query(
      "SELECT COUNT(*) AS voteRows FROM Votes WHERE periodId = ?",
      [periodId]
    );
    res.json({ periodId: Number(periodId), candidateVotes: Number(sumVotes), voteRows: Number(voteRows), consistent: Number(sumVotes) === Number(voteRows) });
  } catch {
    res.status(500).json({ error: "Error running audit" });
  }
});

module.exports = router;
