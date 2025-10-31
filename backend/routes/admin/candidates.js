const path = require("path");
const multer = require("multer");
const { q } = require("../../db");
const { requireAuth, requireAdmin } = require("../../middleware/auth");
const { recordAuditEvent } = require("../../utils/audit");
const { ensureDirSync, buildPublicPath, toRelativePath, syncToObjectStorage, removeLocalFile } = require("../../utils/uploads");
const {
  resolveAdminScope,
  candidateMatchesScope,
  periodMatchesScope,
  toKey,
} = require("./utils");

async function candidateIsEditable(periodId) {
  if (!periodId) return true;
  const [[period]] = await q(
    `SELECT id, startTime, endTime, forcedEnded, resultsPublished
       FROM VotingPeriod
      WHERE id=?`,
    [periodId]
  );
  if (!period) return true;
  const now = Date.now();
  const startTime = new Date(period.startTime).getTime();
  const endTime = new Date(period.endTime).getTime();
  if (Number.isNaN(startTime)) return false;
  if (period.forcedEnded || period.resultsPublished) return false;
  if (startTime <= now) return false;
  if (!Number.isNaN(endTime) && endTime <= now) return false;
  return true;
}

module.exports = function registerCandidateRoutes(router) {
  // candidate image upload storage
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, ensureDirSync("candidates")),
    filename: (_req, file, cb) => {
      const ext = ((file.originalname || "").toLowerCase().split(".").pop() || "").replace(/[^a-z0-9]/g, "");
      const suffix = ext ? `.${ext}` : "";
      cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${suffix}`);
    },
  });

  const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });

  router.post("/upload-image", requireAuth, requireAdmin, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "MISSING_FILE", message: "No file uploaded" });
      const relative = toRelativePath("candidates", req.file.filename);
      const absolute = req.file.path || path.join(req.file.destination || ensureDirSync("candidates"), req.file.filename);
      await syncToObjectStorage({
        relativePath: relative,
        absolutePath: absolute,
        contentType: req.file.mimetype,
      });
      const url = buildPublicPath("candidates", req.file.filename);
      removeLocalFile(absolute);
      res.json({ success: true, url });
    } catch (err) {
      console.error("admin/upload-image:", err);
      res.status(500).json({ error: "SERVER" });
    }
  });

  router.get("/unpublished", requireAuth, requireAdmin, async (req, res) => {
    try {
      const scopeInfo = await resolveAdminScope(req);
      let sql = `SELECT id,name,state,lga,photoUrl FROM Candidates WHERE published=0 AND periodId IS NULL`;
      const params = [];
      if (!scopeInfo.isSuper) {
        sql += ` AND LOWER(COALESCE(state,'')) = ?`;
        params.push(toKey(scopeInfo.state));
      }
      sql += ` ORDER BY id DESC`;
      const [rows] = await q(sql, params);
      res.json(rows || []);
    } catch (err) {
      if (err?.status) {
        return res.status(err.status).json({ error: err.code || "FORBIDDEN", message: err.message || "Forbidden" });
      }
      console.error("admin/unpublished:", err);
      res.status(500).json({ error: "SERVER" });
    }
  });

  router.post("/candidate", requireAuth, requireAdmin, async (req, res) => {
    try {
      const scopeInfo = await resolveAdminScope(req);
      const { name, state, lga, photoUrl } = req.body || {};
      if (!name || !state || !lga) {
        return res.status(400).json({ error: "MISSING_FIELDS" });
      }
      if (!scopeInfo.isSuper && toKey(state) !== toKey(scopeInfo.state)) {
        return res.status(403).json({ error: "FORBIDDEN", message: "You can only manage candidates for your assigned state." });
      }
      await q(
        `INSERT INTO Candidates (name,state,lga,photoUrl,periodId,published,votes)
         VALUES (?,?,?,?,NULL,0,0)`,
        [name, state, lga, photoUrl || null]
      );
      res.json({ success: true });
    } catch (err) {
      if (err?.status) {
        return res.status(err.status).json({ error: err.code || "FORBIDDEN", message: err.message || "Forbidden" });
      }
      console.error("admin/candidate:create", err);
      res.status(500).json({ error: "SERVER" });
    }
  });

  router.put("/candidate/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const scopeInfo = await resolveAdminScope(req);
      const cid = Number(req.params.id || 0);
      const { name, state, lga, photoUrl } = req.body || {};
      if (!cid) return res.status(400).json({ error: "MISSING_ID" });
      if (!name || !state || !lga) return res.status(400).json({ error: "MISSING_FIELDS" });
      const [[existing]] = await q(`SELECT id, name, state, lga, photoUrl, periodId FROM Candidates WHERE id=?`, [cid]);
      if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
      if (!candidateMatchesScope(scopeInfo, existing)) {
        return res.status(403).json({ error: "FORBIDDEN", message: "You can only manage candidates for your assigned state." });
      }
      if (!scopeInfo.isSuper && toKey(state) !== toKey(scopeInfo.state)) {
        return res.status(403).json({ error: "FORBIDDEN", message: "You can only assign candidates to your state." });
      }
      const editable = await candidateIsEditable(existing.periodId);
      if (!editable) {
        return res.status(409).json({
          error: "LOCKED",
          message: "This candidate is on a ballot that is already live or concluded.",
        });
      }
      await q(`UPDATE Candidates SET name=?, state=?, lga=?, photoUrl=? WHERE id=?`, [name, state, lga, photoUrl || null, cid]);
      await recordAuditEvent({
        actorId: req.user?.id || null,
        actorRole: (req.user?.role || "").toLowerCase() || null,
        action: "candidate.updated",
        entityType: "candidate",
        entityId: String(cid),
        before: {
          name: existing.name,
          state: existing.state,
          lga: existing.lga,
          photoUrl: existing.photoUrl,
        },
        after: { name, state, lga, photoUrl: photoUrl || null },
      });
      res.json({ success: true });
    } catch (err) {
      if (err?.status) {
        return res.status(err.status).json({ error: err.code || "FORBIDDEN", message: err.message || "Forbidden" });
      }
      console.error("admin/candidate:update", err);
      res.status(500).json({ error: "SERVER", message: "Could not update candidate" });
    }
  });

  router.delete("/candidate/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const scopeInfo = await resolveAdminScope(req);
      const cid = Number(req.params.id || 0);
      if (!cid) return res.status(400).json({ error: "MISSING_ID" });
      const [[candidate]] = await q(`SELECT id, name, state, lga, photoUrl, periodId FROM Candidates WHERE id=?`, [cid]);
      if (!candidate) return res.status(404).json({ error: "NOT_FOUND" });
      if (!candidateMatchesScope(scopeInfo, candidate)) {
        return res.status(403).json({ error: "FORBIDDEN", message: "You can only remove candidates for your assigned state." });
      }
      const editable = await candidateIsEditable(candidate.periodId);
      if (!editable) {
        return res.status(409).json({
          error: "LOCKED",
          message: "This candidate is on a ballot that is already live or concluded.",
        });
      }
      await q(`DELETE FROM Candidates WHERE id=?`, [cid]);
      await recordAuditEvent({
        actorId: req.user?.id || null,
        actorRole: (req.user?.role || "").toLowerCase() || null,
        action: "candidate.deleted",
        entityType: "candidate",
        entityId: String(cid),
        before: {
          name: candidate.name,
          state: candidate.state,
          lga: candidate.lga,
          photoUrl: candidate.photoUrl,
        },
        after: null,
      });
      res.json({ success: true });
    } catch (err) {
      if (err?.status) {
        return res.status(err.status).json({ error: err.code || "FORBIDDEN", message: err.message || "Forbidden" });
      }
      console.error("admin/candidate:delete", err);
      res.status(500).json({ error: "SERVER", message: "Could not remove candidate" });
    }
  });

  router.get("/candidates", requireAuth, requireAdmin, async (req, res) => {
    try {
      const scopeInfo = await resolveAdminScope(req);
      const pid = Number(req.query.periodId || 0);
      if (!pid) return res.status(400).json({ error: "MISSING_ID" });
      const [[period]] = await q(
        `SELECT id, scope, scopeState FROM VotingPeriod WHERE id=?`,
        [pid]
      );
      if (!period) return res.status(404).json({ error: "NOT_FOUND", message: "Voting period not found" });
      if (!periodMatchesScope(scopeInfo, period)) {
        return res.status(403).json({ error: "FORBIDDEN", message: "You do not have access to candidates for this session." });
      }
      const [rows] = await q(
        `SELECT id,name,state,lga,photoUrl,votes FROM Candidates WHERE periodId=? ORDER BY votes DESC, name ASC`,
        [pid]
      );
      res.json(rows || []);
    } catch (err) {
      if (err?.status) {
        return res.status(err.status).json({ error: err.code || "FORBIDDEN", message: err.message || "Forbidden" });
      }
      console.error("admin/candidates:list", err);
      res.status(500).json({ error: "SERVER" });
    }
  });
};
