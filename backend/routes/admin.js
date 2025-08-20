// backend/routes/admin.js
const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { getDbPool } = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

// ===== Uploads (jpeg/jpg/png/webp) =====
const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const base = path
      .basename(file.originalname || "image", ext)
      .replace(/[^\w.-]+/g, "_");
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (_, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(
      (file.mimetype || "").toLowerCase()
    );
    cb(ok ? null : new Error("Invalid image type (png/jpg/jpeg/webp only)"), ok);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// upload returns a URL that frontend can store in Candidates.photoUrl
router.post("/upload", requireAuth, requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  // You can serve either via /uploads or via /api/admin/file (both work now)
  return res.json({ url: `/uploads/${req.file.filename}` });
});

// Back-compat: serve file by name (if you kept older URLs)
router.get("/file/:name", (req, res) => {
  const f = path.join(uploadDir, req.params.name);
  if (!fs.existsSync(f)) return res.status(404).send("Not found");
  res.sendFile(f);
});

// ===== Sessions & Candidates =====
router.get("/periods", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const pool = await getDbPool();
    const [rows] = await pool.query(
      `SELECT id, title, description, startTime, endTime, resultsPublished, forcedEnded
       FROM VotingPeriod
       ORDER BY startTime DESC, id DESC`
    );
    res.json(rows || []);
  } catch (e) {
    console.error("admin/periods:", e);
    res.status(500).json({ error: "Failed to load sessions" });
  }
});

router.get("/unpublished", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const pool = await getDbPool();
    const [rows] = await pool.query(
      `SELECT id,
              name,
              COALESCE(state,'') AS state,
              COALESCE(lga,'')   AS lga,
              photoUrl
       FROM Candidates
       WHERE periodId IS NULL AND published=0
       ORDER BY id DESC`
    );
    res.json(rows || []);
  } catch (e) {
    console.error("admin/unpublished:", e);
    res.status(500).json({ error: "Failed to load unpublished" });
  }
});

router.post("/candidate", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, state, lga, photoUrl } = req.body || {};
    if (!name || !state || !lga) return res.status(400).json({ error: "name, state, lga are required" });

    const pool = await getDbPool();
    // try with state+lga (if 'state' exists), else fallback to legacy lga-only schema
    try {
      await pool.query(
        `INSERT INTO Candidates (name, state, lga, photoUrl, published, periodId, votes)
         VALUES (?, ?, ?, ?, 0, NULL, 0)`,
        [name.trim(), state.trim(), lga.trim(), (photoUrl || "").trim() || null]
      );
    } catch (e) {
      if (e.code === "ER_BAD_FIELD_ERROR") {
        await pool.query(
          `INSERT INTO Candidates (name, lga, photoUrl, published, periodId, votes)
           VALUES (?, ?, ?, 0, NULL, 0)`,
          [name.trim(), lga.trim(), (photoUrl || "").trim() || null]
        );
      } else {
        throw e;
      }
    }

    res.json({ success: true });
  } catch (e) {
    console.error("admin/candidate:", e);
    res.status(500).json({ error: "Error adding candidate" });
  }
});

router.delete("/remove-candidate", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.query.candidateId);
    if (!id) return res.status(400).json({ error: "candidateId required" });

    const pool = await getDbPool();
    const [[c]] = await pool.query(`SELECT id, periodId FROM Candidates WHERE id=?`, [id]);
    if (!c) return res.status(404).json({ error: "Candidate not found" });
    if (c.periodId) return res.status(400).json({ error: "Candidate already in a session" });

    await pool.query(`DELETE FROM Candidates WHERE id=?`, [id]);
    res.json({ success: true });
  } catch (e) {
    console.error("admin/remove-candidate:", e);
    res.status(500).json({ error: "Delete failed" });
  }
});

router.post("/voting-period", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, description, start, end } = req.body || {};
    if (!title || !start || !end) return res.status(400).json({ error: "title, start, end required" });

    const startTime = new Date(start);
    const endTime = new Date(end);
    if (isNaN(startTime) || isNaN(endTime) || endTime <= startTime)
      return res.status(400).json({ error: "Invalid start/end" });

    const pool = await getDbPool();
    const [ins] = await pool.query(
      `INSERT INTO VotingPeriod (startTime, endTime, resultsPublished, forcedEnded, title, description)
       VALUES (?, ?, 0, 0, ?, ?)`,
      [startTime, endTime, title.trim(), (description || "").trim() || null]
    );
    const periodId = ins.insertId;

    const [upd] = await pool.query(
      `UPDATE Candidates SET periodId=?, published=1 WHERE periodId IS NULL AND published=0`,
      [periodId]
    );

    const emit = req.app.get("emitUpdate");
    emit && emit("sessionStarted", { periodId });

    res.json({ success: true, periodId, attached: upd.affectedRows || 0 });
  } catch (e) {
    console.error("admin/voting-period:", e);
    res.status(500).json({ error: "Error starting voting" });
  }
});

router.post("/publish-results", requireAuth, requireAdmin, async (req, res) => {
  try {
    const periodId = Number(req.query.periodId);
    if (!periodId) return res.status(400).json({ error: "periodId required" });

    const pool = await getDbPool();
    const [[p]] = await pool.query(
      `SELECT id, endTime, forcedEnded, resultsPublished FROM VotingPeriod WHERE id=?`,
      [periodId]
    );
    if (!p) return res.status(404).json({ error: "Period not found" });
    if (p.resultsPublished) return res.json({ success: true, already: true });

    const ended = p.forcedEnded || Date.now() >= new Date(p.endTime).getTime();
    if (!ended) return res.status(400).json({ error: "Voting not ended yet" });

    await pool.query(`UPDATE VotingPeriod SET resultsPublished=1 WHERE id=?`, [periodId]);

    const emit = req.app.get("emitUpdate");
    emit && emit("resultsPublished", { periodId });

    res.json({ success: true });
  } catch (e) {
    console.error("admin/publish-results:", e);
    res.status(500).json({ error: "Error publishing results" });
  }
});

router.post("/end-voting-early", requireAuth, requireAdmin, async (req, res) => {
  try {
    const periodId = Number(req.query.periodId);
    if (!periodId) return res.status(400).json({ error: "periodId required" });

    const pool = await getDbPool();
    const [[p]] = await pool.query(`SELECT id, forcedEnded FROM VotingPeriod WHERE id=?`, [periodId]);
    if (!p) return res.status(404).json({ error: "Period not found" });
    if (p.forcedEnded) return res.json({ success: true, already: true });

    await pool.query(`UPDATE VotingPeriod SET forcedEnded=1 WHERE id=?`, [periodId]);

    const emit = req.app.get("emitUpdate");
    emit && emit("sessionEnded", { periodId });

    res.json({ success: true });
  } catch (e) {
    console.error("admin/end-voting-early:", e);
    res.status(500).json({ error: "Error ending voting" });
  }
});

router.get("/candidates", requireAuth, requireAdmin, async (req, res) => {
  try {
    const periodId = Number(req.query.periodId);
    if (!periodId) return res.status(400).json({ error: "periodId required" });
    const pool = await getDbPool();
    const [rows] = await pool.query(
      `SELECT id,
              name,
              COALESCE(state,'') AS state,
              COALESCE(lga,'')   AS lga,
              photoUrl,
              votes
       FROM Candidates
       WHERE periodId=?
       ORDER BY votes DESC, id ASC`,
      [periodId]
    );
    res.json(rows || []);
  } catch (e) {
    console.error("admin/candidates:", e);
    res.status(500).json({ error: "Failed to load candidates" });
  }
});

router.get("/audit", requireAuth, requireAdmin, async (req, res) => {
  try {
    const periodId = Number(req.query.periodId);
    if (!periodId) return res.status(400).json({ error: "periodId required" });
    const pool = await getDbPool();
    const [[sumRow]] = await pool.query(
      `SELECT COALESCE(SUM(votes),0) AS total FROM Candidates WHERE periodId=?`,
      [periodId]
    );
    const [[votesRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM Votes WHERE periodId=?`,
      [periodId]
    );
    res.json({
      candidateVotes: Number(sumRow?.total || 0),
      voteRows: Number(votesRow?.total || 0),
      consistent: Number(sumRow?.total || 0) === Number(votesRow?.total || 0),
    });
  } catch (e) {
    console.error("admin/audit:", e);
    res.status(500).json({ error: "Failed to load audit" });
  }
});

// ===== Logs (already handled by middleware/logger.js) =====
router.get("/logs", requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const q = (req.query.q || "").trim();

    const pool = await getDbPool();
    let where = "";
    let params = [];
    if (q) {
      where = `WHERE method LIKE ? OR path LIKE ? OR ip LIKE ? OR userAgent LIKE ? OR referer LIKE ? OR country LIKE ? OR city LIKE ?`;
      const like = `%${q}%`;
      params = [like, like, like, like, like, like, like];
    }

    const [[cnt]] = await pool.query(`SELECT COUNT(*) AS total FROM RequestLogs ${where}`, params);
    const [rows] = await pool.query(
      `SELECT id, method, path, userId, ip, userAgent, referer, country, city, createdAt
       FROM RequestLogs ${where}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ rows, total: Number(cnt?.total || 0) });
  } catch (e) {
    console.error("admin/logs:", e);
    res.status(500).json({ error: "Failed to load logs" });
  }
});

router.get("/logs/export", requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 1000, 10000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const q = (req.query.q || "").trim();

    const pool = await getDbPool();
    let where = "";
    let params = [];
    if (q) {
      where = `WHERE method LIKE ? OR path LIKE ? OR ip LIKE ? OR userAgent LIKE ? OR referer LIKE ? OR country LIKE ? OR city LIKE ?`;
      const like = `%${q}%`;
      params = [like, like, like, like, like, like, like];
    }

    const [rows] = await pool.query(
      `SELECT id, method, path, userId, ip, userAgent, referer, country, city, createdAt
       FROM RequestLogs ${where}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const header = [
      "id","createdAt","method","path","userId","ip","country","city","userAgent","referer",
    ];
    const esc = (v) => (v == null ? "" : `"${String(v).replace(/"/g, '""').replace(/\r?\n/g, " ")}"`);
    const csv =
      header.join(",") +
      "\n" +
      rows
        .map((r) =>
          [
            r.id,
            new Date(r.createdAt).toISOString(),
            r.method,
            r.path,
            r.userId ?? "",
            r.ip ?? "",
            r.country ?? "",
            r.city ?? "",
            r.userAgent ?? "",
            r.referer ?? "",
          ].map(esc).join(",")
        )
        .join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="logs.csv"`);
    res.send("\uFEFF" + csv);
  } catch (e) {
    console.error("admin/logs/export:", e);
    res.status(500).json({ error: "Failed to export logs" });
  }
});

module.exports = router;
