const express = require("express");
const router = express.Router();
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { q } = require("../db");
const { requireAuth, requireAdmin, requireRole } = require("../middleware/auth");
const { recordAuditEvent } = require("../utils/audit");
const { hardDeleteUser } = require("../utils/retention");
const { buildMetricsSnapshot } = require("../utils/telemetry");
const { ensureDirSync, buildPublicPath } = require("../utils/uploads");

// ---------- candidate image upload ----------
const upCand = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ensureDirSync("candidates")),
  filename: (_req, file, cb) => {
    const ext = ((file.originalname || "").toLowerCase().split(".").pop() || "").replace(/[^a-z0-9]/g, "");
    const suffix = ext ? `.${ext}` : "";
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${suffix}`);
  }
});
const uploadCand = multer({ storage: upCand, limits: { fileSize: 2 * 1024 * 1024 } });

router.post("/upload-image", requireAuth, requireAdmin, uploadCand.single("file"), async (req, res) => {
  try {
    const url = buildPublicPath("candidates", req.file.filename);
    res.json({ success: true, url });
  } catch { res.status(500).json({ error: "SERVER" }); }
});

// ---------- unpublished candidates ----------
router.get("/unpublished", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await q(`SELECT id,name,state,lga,photoUrl FROM Candidates WHERE published=0 AND periodId IS NULL ORDER BY id DESC`);
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

router.delete("/candidate/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const cid = Number(req.params.id || 0);
    if (!cid) return res.status(400).json({ error: "MISSING_ID" });
    await q(`DELETE FROM Candidates WHERE id=? AND (periodId IS NULL OR published=0)`, [cid]);
    res.json({ success: true });
  } catch (e) {
    console.error("admin/candidate/delete:", e);
    res.status(500).json({ error: "SERVER", message: "Could not remove candidate" });
  }
});

// ---------- start voting period ----------
router.post("/voting-period", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, description, start, end, minAge, scope, scopeState, scopeLGA } = req.body || {};
    if (!title || !start || !end) return res.status(400).json({ error: "MISSING_FIELDS" });

    const electionScope = (scope || 'national').toLowerCase();
    if (electionScope === 'state' && !scopeState) return res.status(400).json({ error: "MISSING_SCOPE", message: "State scope requires a state" });
    if (electionScope === 'local' && (!scopeState || !scopeLGA)) return res.status(400).json({ error: "MISSING_SCOPE", message: "Local scope requires both state and LGA" });

    const [draftCandidates] = await q(`SELECT id, name, state, lga FROM Candidates WHERE published=0 AND (periodId IS NULL)`);
    if (!draftCandidates.length) {
      return res.status(400).json({ error: "NO_CANDIDATES", message: "Add at least one unpublished candidate before starting a session" });
    }

    const normalize = (value) => (value || '').trim().toLowerCase();
    const targetState = normalize(scopeState);
    const targetLga = normalize(scopeLGA);

    const mismatched = draftCandidates.filter((cand) => {
      if (electionScope === 'national') return false;
      const candState = normalize(cand.state);
      if (!candState || candState !== targetState) return true;
      if (electionScope === 'local') {
        const candLga = normalize(cand.lga);
        if (!candLga || candLga !== targetLga) return true;
      }
      return false;
    });

    if (mismatched.length) {
      const names = mismatched.map((c) => c.name).join(', ');
      return res.status(400).json({
        error: "SCOPE_MISMATCH",
        message: `The following candidates do not match the selected scope: ${names}. Update their details or choose candidates that match.`,
      });
    }

    const [insertResult] = await q(
      `INSERT INTO VotingPeriod (title, description, startTime, endTime, minAge, scope, scopeState, scopeLGA, resultsPublished, forcedEnded)
       VALUES (?,?,?,?,?,?,?,?,0,0)`,
      [title, description || null, new Date(start), new Date(end), Math.max(Number(minAge || 18), 18),
       electionScope, scopeState || null, scopeLGA || null]
    );
    const insertId = insertResult?.insertId;

    if (!insertId) throw new Error("Failed to create voting period");

    const candidateIds = draftCandidates.map((cand) => cand.id);
    if (candidateIds.length) {
      const placeholders = candidateIds.map(() => '?').join(',');
      await q(
        `UPDATE Candidates SET periodId=?, published=1 WHERE id IN (${placeholders})`,
        [insertId, ...candidateIds]
      );
    }

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

router.post("/periods/:id/reschedule", requireAuth, requireRole(["super-admin"]), async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: "MISSING_ID" });
    const { startTime, endTime } = req.body || {};
    if (!startTime || !endTime) {
      return res.status(400).json({ error: "MISSING_FIELDS", message: "Start and end times are required" });
    }
    const newStart = new Date(startTime);
    const newEnd = new Date(endTime);
    if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime())) {
      return res.status(400).json({ error: "INVALID_DATE", message: "Provide valid start and end times" });
    }
    if (newEnd.getTime() <= newStart.getTime()) {
      return res.status(400).json({ error: "INVALID_RANGE", message: "End time must be after start time" });
    }

    const [[period]] = await q(`SELECT startTime FROM VotingPeriod WHERE id=?`, [id]);
    if (!period) return res.status(404).json({ error: "NOT_FOUND", message: "Voting period not found" });
    if (new Date(period.startTime).getTime() <= Date.now()) {
      return res.status(409).json({ error: "ALREADY_STARTED", message: "This session has already started and cannot be rescheduled" });
    }
    if (newStart.getTime() <= Date.now()) {
      return res.status(400).json({ error: "PAST_START", message: "New start time must be in the future" });
    }

    await q(`UPDATE VotingPeriod SET startTime=?, endTime=? WHERE id=?`, [newStart, newEnd, id]);
    res.json({ success: true });
  } catch (e) {
    console.error("admin/periods/reschedule:", e);
    res.status(500).json({ error: "SERVER", message: "Could not reschedule session" });
  }
});

// end early (latest active/unpublished)
router.post("/end-voting-early", requireAuth, requireAdmin, async (req, res) => {
  try {
    const pid = Number(req.body?.periodId || 0);
    let period = null;

    if (pid) {
      const [[row]] = await q(`SELECT id, forcedEnded, resultsPublished FROM VotingPeriod WHERE id=?`, [pid]);
      if (!row) return res.status(404).json({ error: "NOT_FOUND", message: "Voting period not found" });
      period = row;
    } else {
      const [[row]] = await q(
        `SELECT id, forcedEnded, resultsPublished FROM VotingPeriod
         WHERE forcedEnded=0 AND resultsPublished=0 AND endTime > UTC_TIMESTAMP()
         ORDER BY endTime ASC
         LIMIT 1`
      );
      if (!row) return res.json({ success: true, already: true });
      period = row;
    }

    if (period.forcedEnded || period.resultsPublished) {
      return res.json({ success: true, already: true, periodId: period.id });
    }

    await q(`UPDATE VotingPeriod SET forcedEnded=1 WHERE id=?`, [period.id]);
    res.json({ success: true, periodId: period.id });
  } catch (e) {
    console.error("admin/end-early:", e);
    res.status(500).json({ error: "SERVER", message: "Could not end voting early" });
  }
});

// publish results for last ended/forced
router.post("/publish-results", requireAuth, requireAdmin, async (req, res) => {
  try {
    const pid = Number(req.body?.periodId || 0);
    let period = null;

    if (pid) {
      const [[row]] = await q(`SELECT id, resultsPublished FROM VotingPeriod WHERE id=?`, [pid]);
      if (!row) return res.status(404).json({ error: "NOT_FOUND", message: "Voting period not found" });
      period = row;
    } else {
      const [[row]] = await q(
        `SELECT id, resultsPublished FROM VotingPeriod
         WHERE resultsPublished=0 AND (forcedEnded=1 OR endTime <= UTC_TIMESTAMP())
         ORDER BY endTime DESC
         LIMIT 1`
      );
      if (!row) return res.json({ success: true, already: true });
      period = row;
    }

    if (period.resultsPublished) {
      return res.json({ success: true, already: true, periodId: period.id });
    }

    await q(`UPDATE VotingPeriod SET resultsPublished=1 WHERE id=?`, [period.id]);
    req.app.get("io")?.emit("resultsPublished", { periodId: period.id });
    res.json({ success: true, periodId: period.id });
  } catch (e) {
    console.error("admin/publish:", e);
    res.status(500).json({ error: "SERVER", message: "Could not publish results" });
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

async function removePeriod(req, res) {
  try {
    const pid = Number(req.query.periodId || req.body?.periodId || 0);
    if (!pid) return res.status(400).json({ error: "MISSING_ID" });
    await q(`DELETE FROM Votes WHERE periodId=?`, [pid]);
    await q(`DELETE FROM Candidates WHERE periodId=?`, [pid]);
    await q(`DELETE FROM VotingPeriod WHERE id=?`, [pid]);
    res.json({ success: true, periodId: pid });
  } catch (e) {
    console.error("admin/periods/delete:", e);
    res.status(500).json({ error: "SERVER", message: "Could not delete voting period" });
  }
}

router.delete("/periods/delete", requireAuth, requireAdmin, removePeriod);
router.post("/periods/delete", requireAuth, requireAdmin, removePeriod);

// users management
router.post("/users", requireAuth, requireRole(["super-admin"]), async (req, res) => {
  try {
    const { fullName, username, email, password, phone, state, residenceLGA, role, nationality } = req.body || {};
    if (!fullName || !username || !email || !password) {
      return res.status(400).json({ error: "MISSING_FIELDS", message: "Full name, username, email, and password are required" });
    }
    const normalizedRole = (role || "user").toLowerCase() === "admin" ? "admin" : "user";
    const nameParts = String(fullName || "").trim().split(/\s+/);
    const primaryName = nameParts.shift() || "";
    const secondaryName = nameParts.length ? nameParts.join(" ") : primaryName;
    const hash = await bcrypt.hash(password.trim(), 10);
    const [result] = await q(
      `INSERT INTO Users (fullName, firstName, lastName, username, email, password, state, residenceLGA, phone, nationality, dateOfBirth, eligibilityStatus, hasVoted, role, isAdmin)
       VALUES (?,?,?,?,?,?,?,?,?,NULL,'active',0,?,?)`,
      [
        fullName,
        primaryName || null,
        secondaryName || null,
        username,
        email,
        hash,
        state || null,
        residenceLGA || null,
        phone || null,
        nationality || null,
        normalizedRole,
        normalizedRole === "admin" ? 1 : 0,
      ]
    );
    const insertId = result?.insertId;
    if (insertId) {
      const [[created]] = await q(
        `SELECT id, fullName, username, email, role FROM Users WHERE id=?`,
        [insertId]
      );
      await recordAuditEvent({
        actorId: req.user?.id || null,
        actorRole: (req.user?.role || "").toLowerCase() || null,
        action: "user.created",
        entityType: "user",
        entityId: String(insertId),
        after: {
          fullName: created?.fullName,
          username: created?.username,
          email: created?.email,
          role: created?.role,
        },
      });
    }
    res.json({ success: true, id: insertId });
  } catch (e) {
    if (e?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "DUPLICATE", message: "Username or email already exists" });
    }
    console.error("admin/users/create:", e);
    res.status(500).json({ error: "SERVER", message: "Could not create user" });
  }
});

router.get("/users", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await q(`
      SELECT id, fullName, username, email, state, residenceLGA, phone, nationality, dateOfBirth,
             role, eligibilityStatus, isAdmin, createdAt, profilePhoto, lastLoginAt, deletedAt, purgeAt
      FROM Users
      ORDER BY id DESC
      LIMIT 1000`);
    res.json(rows || []);
  } catch (e) {
    console.error("admin/users:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.get("/users/export", requireAuth, requireRole(["admin", "super-admin"]), async (_req, res) => {
  try {
    const [rows] = await q(`SELECT id, fullName, username, email, phone, state, residenceLGA, role, eligibilityStatus, createdAt FROM Users ORDER BY id DESC`);
    const header = "id,fullName,username,email,phone,state,residenceLGA,role,eligibilityStatus,createdAt\n";
    const csv = header + rows.map((r) => [
      r.id,
      JSON.stringify(r.fullName || ""),
      JSON.stringify(r.username || ""),
      JSON.stringify(r.email || ""),
      JSON.stringify(r.phone || ""),
      JSON.stringify(r.state || ""),
      JSON.stringify(r.residenceLGA || ""),
      r.role || "",
      r.eligibilityStatus || "",
      r.createdAt?.toISOString?.() || r.createdAt,
    ].join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="users.csv"');
    res.send(csv);
  } catch (e) {
    console.error("admin/users/export:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.post("/users/:id/disable", requireAuth, requireAdmin, async (req, res) => {
  try {
    const uid = Number(req.params.id || 0);
    if (!uid) return res.status(400).json({ error: "MISSING_ID" });
    const [[target]] = await q(`SELECT id, role, username, eligibilityStatus FROM Users WHERE id=?`, [uid]);
    if (!target) return res.status(404).json({ error: "NOT_FOUND" });
    if (target.role?.toLowerCase() === "super-admin") {
      return res.status(403).json({ error: "FORBIDDEN", message: "Super admin accounts cannot be disabled" });
    }
    await q(`UPDATE Users SET eligibilityStatus='disabled' WHERE id=?`, [uid]);
    await recordAuditEvent({
      actorId: req.user?.id || null,
      actorRole: (req.user?.role || "").toLowerCase() || null,
      action: "user.disabled",
      entityType: "user",
      entityId: String(uid),
      before: { eligibilityStatus: target.eligibilityStatus },
      after: { eligibilityStatus: "disabled" },
    });
    res.json({ success: true });
  } catch (e) {
    console.error("admin/users/disable:", e);
    res.status(500).json({ error: "SERVER", message: "Could not disable user" });
  }
});

router.post("/users/:id/enable", requireAuth, requireAdmin, async (req, res) => {
  try {
    const uid = Number(req.params.id || 0);
    if (!uid) return res.status(400).json({ error: "MISSING_ID" });
    const [[target]] = await q(`SELECT id, role, username, eligibilityStatus FROM Users WHERE id=?`, [uid]);
    if (!target) return res.status(404).json({ error: "NOT_FOUND" });
    if (target.role?.toLowerCase() === "super-admin") {
      return res.status(403).json({ error: "FORBIDDEN", message: "Super admin accounts cannot be enabled or disabled" });
    }
    await q(`UPDATE Users SET eligibilityStatus='active' WHERE id=?`, [uid]);
    await recordAuditEvent({
      actorId: req.user?.id || null,
      actorRole: (req.user?.role || "").toLowerCase() || null,
      action: "user.enabled",
      entityType: "user",
      entityId: String(uid),
      before: { eligibilityStatus: target.eligibilityStatus },
      after: { eligibilityStatus: "active" },
    });
    res.json({ success: true });
  } catch (e) {
    console.error("admin/users/enable:", e);
    res.status(500).json({ error: "SERVER", message: "Could not enable user" });
  }
});

router.delete("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const uid = Number(req.params.id || 0);
    if (!uid) return res.status(400).json({ error: "MISSING_ID" });
    const [[target]] = await q(
      `SELECT id, username, email, phone, role, eligibilityStatus, profilePhoto
       FROM Users WHERE id=?`,
      [uid]
    );
    if (!target) return res.status(404).json({ error: "NOT_FOUND" });
    const actorRole = (req.user?.role || "").toLowerCase();
    const targetRole = (target.role || "").toLowerCase();
    if (targetRole === "super-admin") {
      return res.status(403).json({ error: "FORBIDDEN", message: "Super admin accounts cannot be deleted" });
    }
    if (targetRole === "admin" && actorRole !== "super-admin") {
      return res.status(403).json({ error: "FORBIDDEN", message: "Only super admins can delete admin accounts" });
    }

    await recordAuditEvent({
      actorId: req.user?.id || null,
      actorRole: actorRole || null,
      action: "user.delete-requested",
      entityType: "user",
      entityId: String(uid),
      before: { eligibilityStatus: target.eligibilityStatus, role: target.role },
      notes: "Administrative deletion requested",
    });

    await hardDeleteUser(target, { reason: "admin" });
    res.json({ success: true });
  } catch (e) {
    console.error("admin/users/delete:", e);
    res.status(500).json({ error: "SERVER", message: "Could not delete user" });
  }
});

router.post("/users/:id/reset-password", requireAuth, requireRole(["super-admin", "admin"]), async (req, res) => {
  try {
    const uid = Number(req.params.id || 0);
    const { password } = req.body || {};
    if (!uid) return res.status(400).json({ error: "MISSING_ID" });
    if (typeof password !== "string" || password.trim().length < 8) {
      return res.status(400).json({ error: "INVALID_PASSWORD", message: "Password must be at least 8 characters" });
    }
    const [[target]] = await q(`SELECT role FROM Users WHERE id=?`, [uid]);
    if (!target) return res.status(404).json({ error: "NOT_FOUND" });
    const actorRole = (req.user?.role || "").toLowerCase();
    if (target.role?.toLowerCase() === "super-admin" && actorRole !== "super-admin") {
      return res.status(403).json({ error: "FORBIDDEN", message: "Only super admins can modify super admin accounts" });
    }
    const hash = await bcrypt.hash(password.trim(), 10);
    await q(`UPDATE Users SET password=? WHERE id=?`, [hash, uid]);
    await recordAuditEvent({
      actorId: req.user?.id || null,
      actorRole: (req.user?.role || "").toLowerCase() || null,
      action: "user.password.reset",
      entityType: "user",
      entityId: String(uid),
      notes: "Password reset by admin",
    });
    res.json({ success: true });
  } catch (e) {
    console.error("admin/users/reset-password:", e);
    res.status(500).json({ error: "SERVER", message: "Could not reset password" });
  }
});

router.post("/users/:id/role", requireAuth, requireRole(["super-admin"]), async (req, res) => {
  try {
    const uid = Number(req.params.id || 0);
    const { role } = req.body || {};
    if (!uid) return res.status(400).json({ error: "MISSING_ID" });
    const normalized = String(role || "").toLowerCase();
    if (!["admin", "user"].includes(normalized)) {
      return res.status(400).json({ error: "INVALID_ROLE", message: "Role must be admin or user" });
    }
    const [[target]] = await q(`SELECT id, role FROM Users WHERE id=?`, [uid]);
    if (!target) return res.status(404).json({ error: "NOT_FOUND" });
    if (target.role?.toLowerCase() === "super-admin") {
      return res.status(403).json({ error: "FORBIDDEN", message: "Super admin role cannot be changed" });
    }
    const isAdminFlag = normalized === "admin" ? 1 : 0;
    await q(`UPDATE Users SET role=?, isAdmin=? WHERE id=?`, [normalized, isAdminFlag, uid]);
    req.app.get("io")?.to(`user:${uid}`).emit("roleUpdated", { role: normalized });
    await recordAuditEvent({
      actorId: req.user?.id || null,
      actorRole: (req.user?.role || "").toLowerCase() || null,
      action: "user.role.changed",
      entityType: "user",
      entityId: String(uid),
      before: { role: target.role },
      after: { role: normalized },
    });
    res.json({ success: true, role: normalized });
  } catch (e) {
    console.error("admin/users/role:", e);
    res.status(500).json({ error: "SERVER", message: "Could not update role" });
  }
});

// logs
const LOG_COLUMNS = "id,method,path,userId,ip,statusCode,durationMs,queryParams,bodyParams,country,city,userAgent,referer,createdAt";
const LOG_LIMIT = 100;

const stringifyJsonColumn = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) {
    try {
      return value.toString("utf8");
    } catch {
      return value.toString();
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const formatAuditRows = (rows = []) =>
  rows.map((row) => ({
    ...row,
    beforeState: stringifyJsonColumn(row.beforeState),
    afterState: stringifyJsonColumn(row.afterState),
  }));

const csvEscape = (value) => {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  return `"${str.replace(/"/g, '""')}"`;
};

router.get("/logs", requireAuth, requireRole(["super-admin"]), async (_req, res) => {
  try {
    const [rows] = await q(`SELECT ${LOG_COLUMNS} FROM RequestLogs ORDER BY id DESC LIMIT ${LOG_LIMIT}`);
    res.json(rows || []);
  } catch (e) {
    console.error("admin/logs:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.get("/logs/export", requireAuth, requireRole(["super-admin"]), async (_req, res) => {
  try {
    const [rows] = await q(`SELECT ${LOG_COLUMNS} FROM RequestLogs ORDER BY id DESC LIMIT ${LOG_LIMIT}`);
    const header = "id,method,path,userId,ip,statusCode,durationMs,queryParams,bodyParams,country,city,userAgent,referer,createdAt\n";
    const csv = header + rows.map((r) => [
      csvEscape(r.id ?? ""),
      csvEscape(r.method ?? ""),
      csvEscape(r.path ?? ""),
      csvEscape(r.userId ?? ""),
      csvEscape(r.ip ?? ""),
      csvEscape(r.statusCode ?? ""),
      csvEscape(r.durationMs ?? ""),
      csvEscape(r.queryParams || ""),
      csvEscape(r.bodyParams || ""),
      csvEscape(r.country || ""),
      csvEscape(r.city || ""),
      csvEscape(r.userAgent || ""),
      csvEscape(r.referer || ""),
      csvEscape(r.createdAt?.toISOString?.() || r.createdAt || "")
    ].join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="request-logs.csv"');
    res.send(csv);
  } catch (e) {
    console.error("admin/logs/export:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.get("/logs/export-json", requireAuth, requireRole(["super-admin"]), async (_req, res) => {
  try {
    const [rows] = await q(`SELECT ${LOG_COLUMNS} FROM RequestLogs ORDER BY id DESC LIMIT ${LOG_LIMIT}`);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", 'attachment; filename="request-logs.json"');
    res.send(JSON.stringify(rows || [], null, 2));
  } catch (e) {
    console.error("admin/logs/export-json:", e);
    res.status(500).json({ error: "SERVER" });
  }
});

router.get("/audit-logs", requireAuth, requireRole(["super-admin"]), async (req, res) => {
  try {
    const { start, end, actorId } = req.query || {};
    const conditions = [];
    const params = [];
    if (actorId) {
      conditions.push("(actorId = ?)");
      params.push(Number(actorId));
    }
    if (start) {
      conditions.push("createdAt >= ?");
      params.push(new Date(start));
    }
    if (end) {
      conditions.push("createdAt <= ?");
      params.push(new Date(end));
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const [rows] = await q(
      `SELECT id, actorId, actorRole, action, entityType, entityId, beforeState, afterState, ip, notes, createdAt
       FROM AuditLog
       ${whereClause}
       ORDER BY id DESC
       LIMIT 200`,
      params
    );
    res.json(formatAuditRows(rows) || []);
  } catch (err) {
    console.error("admin/audit-logs:", err);
    res.status(500).json({ error: "SERVER" });
  }
});

router.get("/audit-logs/export", requireAuth, requireRole(["super-admin"]), async (req, res) => {
  try {
    const { start, end, actorId } = req.query || {};
    const conditions = [];
    const params = [];
    if (actorId) {
      conditions.push("(actorId = ?)");
      params.push(Number(actorId));
    }
    if (start) {
      conditions.push("createdAt >= ?");
      params.push(new Date(start));
    }
    if (end) {
      conditions.push("createdAt <= ?");
      params.push(new Date(end));
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const [rows] = await q(
      `SELECT id, actorId, actorRole, action, entityType, entityId, beforeState, afterState, ip, notes, createdAt
       FROM AuditLog
       ${whereClause}
       ORDER BY id DESC
       LIMIT 1000`,
      params
    );
    const formatted = formatAuditRows(rows || []);
    const header = "id,actorId,actorRole,action,entityType,entityId,beforeState,afterState,ip,notes,createdAt\n";
    const csv = header + formatted.map((r) => [
      csvEscape(r.id ?? ""),
      csvEscape(r.actorId ?? ""),
      csvEscape(r.actorRole || ""),
      csvEscape(r.action || ""),
      csvEscape(r.entityType || ""),
      csvEscape(r.entityId || ""),
      csvEscape(r.beforeState || ""),
      csvEscape(r.afterState || ""),
      csvEscape(r.ip || ""),
      csvEscape(r.notes || ""),
      csvEscape(r.createdAt?.toISOString?.() || r.createdAt || ""),
    ].join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="audit-logs.csv"');
    res.send(csv);
  } catch (err) {
    console.error("admin/audit-logs/export:", err);
    res.status(500).json({ error: "SERVER" });
  }
});

router.get("/metrics/summary", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const snapshot = await buildMetricsSnapshot();
    res.json(snapshot);
  } catch (err) {
    console.error("admin/metrics/summary:", err);
    res.status(500).json({ error: "SERVER" });
  }
});

module.exports = router;
