const express = require("express");
const router = express.Router();
const path = require("path");
const multer = require("multer");
const { q } = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

// ---------- candidate image upload ----------
const upCand = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, "..", "uploads", "candidates")),
  filename: (_req, file, cb) => cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`)
});
const uploadCand = multer({ storage: upCand, limits: { fileSize: 2 * 1024 * 1024 } });

router.post("/upload-image", requireAuth, requireAdmin, uploadCand.single("file"), async (req, res) => {
  try {
    const url = `/uploads/candidates/${req.file.filename}`;
    res.json({ success: true, url });
  } catch { res.status(500).json({ error: "SERVER" }); }
});

// ---------- unpublished candidates ----------
router.get("/unpublished", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await q(`SELECT id,name,state,lga,photoUrl FROM Candidates WHERE published=0 ORDER BY id DESC`);
    res.json(rows || []);
  } catch (e) {
    console.error("admin/unpublished:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.post("/candidate", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, state, lga, photoUrl } = req.body || {};
    if (!name || !state || !lga) return res.status(400).json({ error: "MISSING_FIELDS" });
    await q(
      `INSERT INTO Candidates (name,state,lga,photoUrl,periodId,published,votes)
       VALUES (?,?,?,?,NULL,0,0)`, [name, state, lga, photoUrl || null]
    );
    res.json({ success: true });
  } catch (e) {
    console.error("admin/candidate:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

// ---------- start voting period ----------
router.post("/voting-period", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, description, start, end, minAge, scope, scopeState, scopeLGA } = req.body || {};
    if (!title || !start || !end) return res.status(400).json({ error: "MISSING_FIELDS" });

    const [insertRows] = await q(
      `INSERT INTO VotingPeriod (title, description, startTime, endTime, minAge, scope, scopeState, scopeLGA, resultsPublished, forcedEnded)
       OUTPUT INSERTED.id
       VALUES (?,?,?,?,?,?,?,?,0,0)`,
      [title, description || null, new Date(start), new Date(end), Math.max(Number(minAge||18),18),
       scope || 'national', scopeState || null, scopeLGA || null]
    );
    const insertId = insertRows?.[0]?.id;

    if (!insertId) throw new Error("Failed to create voting period");

    // attach all unpublished candidates to this period
    await q(`UPDATE Candidates SET periodId=?, published=1 WHERE published=0 AND (periodId IS NULL)`, [insertId]);

    req.app.get("io")?.emit("periodCreated", { periodId: insertId });
    res.json({ success: true, id: insertId });
  } catch (e) {
    console.error("admin/voting-period:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

// list periods
router.get("/periods", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await q(`SELECT * FROM VotingPeriod ORDER BY id DESC`);
    res.json(rows || []);
  } catch (e) {
    console.error("admin/periods:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

// candidates in a period
router.get("/candidates", requireAuth, requireAdmin, async (req, res) => {
  try {
    const pid = Number(req.query.periodId || 0);
    if (!pid) return res.status(400).json({ error: "MISSING_ID" });
    const [rows] = await q(
      `SELECT id,name,state,lga,photoUrl,votes FROM Candidates WHERE periodId=? ORDER BY votes DESC, name ASC`, [pid]
    );
    res.json(rows || []);
  } catch (e) {
    console.error("admin/candidates:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

// end early (latest active/unpublished)
router.post("/end-voting-early", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [[period]] = await q(
      `SELECT TOP 1 id FROM VotingPeriod
       WHERE forcedEnded=0 AND resultsPublished=0 AND endTime > GETUTCDATE()
       ORDER BY id DESC`
    );
    if (!period) return res.json({ success: true });
    await q(`UPDATE VotingPeriod SET forcedEnded=1 WHERE id=?`, [period.id]);
    res.json({ success: true });
  } catch (e) {
    console.error("admin/end-early:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

// publish results for last ended/forced
router.post("/publish-results", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [[period]] = await q(
      `SELECT TOP 1 id FROM VotingPeriod
       WHERE (forcedEnded=1 OR endTime <= GETUTCDATE()) AND resultsPublished=0
       ORDER BY id DESC`
    );
    if (!period) return res.json({ success: true });
    await q(`UPDATE VotingPeriod SET resultsPublished=1 WHERE id=?`, [period.id]);
    req.app.get("io")?.emit("resultsPublished", {}); // clients will refetch
    res.json({ success: true });
  } catch (e) {
    console.error("admin/publish:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

// audit quick stats
router.get("/audit", requireAuth, requireAdmin, async (req, res) => {
  try {
    const pid = Number(req.query.periodId || 0);
    if (!pid) return res.status(400).json({ error: "MISSING_ID" });
    const [[candCountRow]] = await q(`SELECT COUNT(*) AS c FROM Candidates WHERE periodId=?`, [pid]);
    const [[voteCountRow]] = await q(`SELECT COUNT(*) AS v FROM Votes WHERE periodId=?`, [pid]);
    const [[sumVotesRow]] = await q(`SELECT COALESCE(SUM(votes),0) AS s FROM Candidates WHERE periodId=?`, [pid]);
    res.json({
      candidateCount: candCountRow?.c || 0,
      voteRows: voteCountRow?.v || 0,
      candidateVotes: sumVotesRow?.s || 0,
      consistent: (voteCountRow?.v || 0) === (sumVotesRow?.s || 0)
    });
  } catch (e) {
    console.error("admin/audit:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.get("/periods/delete", requireAuth, requireAdmin, async (req, res) => {
  try {
    const pid = Number(req.query.periodId || 0);
    if (!pid) return res.status(400).json({ error: "MISSING_ID" });
    await q(`DELETE FROM Votes WHERE periodId=?`, [pid]);
    await q(`UPDATE Candidates SET periodId=NULL, published=0, votes=0 WHERE periodId=?`, [pid]);
    await q(`DELETE FROM VotingPeriod WHERE id=?`, [pid]);
    res.json({ success: true });
  } catch (e) {
    console.error("admin/periods/delete:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

// logs
router.get("/logs", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await q(`SELECT TOP 500 id,method,path,userId,ip,userAgent,referer,country,city,createdAt FROM RequestLogs ORDER BY id DESC`);
    res.json(rows || []);
  } catch (e) {
    console.error("admin/logs:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.get("/logs/export", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await q(`SELECT id,method,path,userId,ip,userAgent,referer,country,city,createdAt FROM RequestLogs ORDER BY id DESC`);
    const header = "id,method,path,userId,ip,userAgent,referer,country,city,createdAt\n";
    const csv = header + rows.map(r => [
      r.id, r.method, JSON.stringify(r.path), r.userId ?? "",
      r.ip, JSON.stringify(r.userAgent||""), JSON.stringify(r.referer||""),
      r.country||"", r.city||"", r.createdAt?.toISOString?.() || r.createdAt
    ].join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="request-logs.csv"');
    res.send(csv);
  } catch (e) {
    console.error("admin/logs/export:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

module.exports = router;
