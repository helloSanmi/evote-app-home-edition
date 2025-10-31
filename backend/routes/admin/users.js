const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const { q } = require("../../db");
const { requireAuth, requireAdmin, requireRole } = require("../../middleware/auth");
const { recordAuditEvent } = require("../../utils/audit");
const { hardDeleteUser } = require("../../utils/retention");
const emailService = require("../../services/emailService");
const {
  EMAIL_VERIFICATION_ENABLED,
  EMAIL_PATTERN,
  USERNAME_PATTERN,
  resolveAdminScope,
  userMatchesScope,
  toKey,
} = require("./utils");

const ADMIN_EMAIL_VERIFICATION_ENABLED = EMAIL_VERIFICATION_ENABLED;

module.exports = function registerUserRoutes(router) {
  router.post("/users", requireAuth, requireRole(["super-admin"]), async (req, res) => {
    try {
      const { fullName, username, email, password, phone, state, residenceLGA, role, nationality } = req.body || {};
      if (!fullName || !username || !email || !password) {
        return res.status(400).json({ error: "MISSING_FIELDS", message: "Full name, username, email, and password are required" });
      }
      if (!EMAIL_PATTERN.test(String(email).trim())) {
        return res.status(400).json({ error: "INVALID_EMAIL", message: "Provide a valid email address" });
      }
      if (!USERNAME_PATTERN.test(String(username).trim())) {
        return res.status(400).json({ error: "INVALID_USERNAME", message: "Username must be 3-40 characters using letters, numbers, or _.-" });
      }
      const normalizedRole = (role || "user").toLowerCase() === "admin" ? "admin" : "user";
      const nameParts = String(fullName || "").trim().split(/\s+/);
      const primaryName = nameParts.shift() || "";
      const secondaryName = nameParts.length ? nameParts.join(" ") : primaryName;
      const hash = await bcrypt.hash(password.trim(), 10);
      const isAdminRole = normalizedRole === "admin";
      const verificationRequired = ADMIN_EMAIL_VERIFICATION_ENABLED && !isAdminRole;
      const activationToken = verificationRequired ? crypto.randomUUID() : null;
      const activationExpires = verificationRequired ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
      const emailVerifiedAt = verificationRequired ? null : new Date();
      const eligibilityStatus = verificationRequired ? "pending" : "active";
      const [result] = await q(
        `INSERT INTO Users (fullName, firstName, lastName, username, email, password, state, residenceLGA, phone, nationality, dateOfBirth, eligibilityStatus, hasVoted, mustResetPassword, role, isAdmin, activationToken, activationExpires, emailVerifiedAt)
         VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?,0,1,?,?,?, ?, ?)`,
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
          eligibilityStatus,
          normalizedRole,
          isAdminRole ? 1 : 0,
          activationToken,
          activationExpires,
          emailVerifiedAt,
        ]
      );
      const insertId = result?.insertId;
      if (insertId) {
        const [[created]] = await q(
          `SELECT id, fullName, username, email, role FROM Users WHERE id=?`,
          [insertId]
        );
        if (verificationRequired && created?.email) {
          emailService.sendActivationEmail(created, activationToken).catch((err) => console.error("admin/users sendActivationEmail", err));
        } else if (created?.email) {
          emailService.sendWelcomeEmail(created).catch((err) => console.error("admin/users sendWelcomeEmail", err));
        }
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
    } catch (err) {
      if (err?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "DUPLICATE", message: "Username or email already exists" });
      }
      console.error("admin/users/create:", err);
      res.status(500).json({ error: "SERVER", message: "Could not create user" });
    }
  });

  router.get("/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const scopeInfo = await resolveAdminScope(req);
      const search = String(req.query.search || "").trim().toLowerCase();
      const stateFilter = toKey(req.query.state || "");
      const lgaFilter = toKey(req.query.lga || "");
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 25, 1), 100);
      const offset = (page - 1) * pageSize;

      const whereParts = [];
      const params = [];

      if (!scopeInfo.isSuper) {
        whereParts.push(`LOWER(COALESCE(state,'')) = ?`);
        params.push(toKey(scopeInfo.state));
      } else if (stateFilter) {
        whereParts.push(`LOWER(COALESCE(state,'')) = ?`);
        params.push(stateFilter);
      }
      if (search) {
        const term = `%${search}%`;
        whereParts.push(`(LOWER(username) LIKE ? OR LOWER(email) LIKE ? OR LOWER(fullName) LIKE ?)`);
        params.push(term, term, term);
      }
      if (lgaFilter) {
        whereParts.push(`LOWER(COALESCE(residenceLGA,'')) = ?`);
        params.push(lgaFilter);
      }

      const whereClause = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
      const [[countRow]] = await q(`SELECT COUNT(*) AS total FROM Users ${whereClause}`, params);
      const total = Number(countRow?.total || 0);

      const safePageSize = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 25;
      const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
      const [rows] = await q(
        `
        SELECT id, fullName, username, email, state, residenceLGA, phone, nationality, dateOfBirth,
               role, eligibilityStatus, verificationStatus, isAdmin, createdAt, profilePhoto, lastLoginAt, deletedAt, purgeAt
          FROM Users
          ${whereClause}
         ORDER BY createdAt DESC, id DESC
         LIMIT ${safePageSize} OFFSET ${safeOffset}
      `,
        params
      );

      res.json({
        items: rows || [],
        page,
        pageSize,
        total,
        hasMore: offset + (rows?.length || 0) < total,
      });
    } catch (err) {
      if (err?.status) {
        return res.status(err.status).json({ error: err.code || "FORBIDDEN", message: err.message || "Forbidden" });
      }
      console.error("admin/users:list", err);
      res.status(500).json({ error: "SERVER" });
    }
  });

  router.get("/users/export", requireAuth, requireRole(["admin", "super-admin"]), async (req, res) => {
    try {
      const scopeInfo = await resolveAdminScope(req);
      let sql = `
        SELECT id, fullName, username, email, phone, state, residenceLGA, role, eligibilityStatus, createdAt
          FROM Users
      `;
      const params = [];
      if (!scopeInfo.isSuper) {
        sql += ` WHERE LOWER(COALESCE(state,'')) = ?`;
        params.push(toKey(scopeInfo.state));
      }
      sql += ` ORDER BY id DESC`;
      const [rows] = await q(sql, params);
      const header = "id,fullName,username,email,phone,state,residenceLGA,role,eligibilityStatus,verificationStatus,createdAt\n";
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
        r.verificationStatus || "",
        r.createdAt?.toISOString?.() || r.createdAt,
      ].join(",")).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="users.csv"');
      res.send(csv);
    } catch (err) {
      if (err?.status) {
        return res.status(err.status).json({ error: err.code || "FORBIDDEN", message: err.message || "Forbidden" });
      }
      console.error("admin/users/export:", err);
      res.status(500).json({ error: "SERVER" });
    }
  });

  router.post("/users/:id/disable", requireAuth, requireAdmin, async (req, res) => {
    try {
      const scopeInfo = await resolveAdminScope(req);
      const uid = Number(req.params.id || 0);
      if (!uid) return res.status(400).json({ error: "MISSING_ID" });
      const [[target]] = await q(`SELECT id, role, username, eligibilityStatus, state FROM Users WHERE id=?`, [uid]);
      if (!target) return res.status(404).json({ error: "NOT_FOUND" });
      if (target.role?.toLowerCase() === "super-admin") {
        return res.status(403).json({ error: "FORBIDDEN", message: "Super admin accounts cannot be disabled" });
      }
      if (!userMatchesScope(scopeInfo, target)) {
        return res.status(403).json({ error: "FORBIDDEN", message: "You can only manage users within your state." });
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
    } catch (err) {
      if (err?.status) {
        return res.status(err.status).json({ error: err.code || "FORBIDDEN", message: err.message || "Forbidden" });
      }
      console.error("admin/users/disable:", err);
      res.status(500).json({ error: "SERVER", message: "Could not disable user" });
    }
  });

  router.post("/users/:id/enable", requireAuth, requireAdmin, async (req, res) => {
    try {
      const scopeInfo = await resolveAdminScope(req);
      const uid = Number(req.params.id || 0);
      if (!uid) return res.status(400).json({ error: "MISSING_ID" });
      const [[target]] = await q(`SELECT id, role, username, eligibilityStatus, state FROM Users WHERE id=?`, [uid]);
      if (!target) return res.status(404).json({ error: "NOT_FOUND" });
      if (target.role?.toLowerCase() === "super-admin") {
        return res.status(403).json({ error: "FORBIDDEN", message: "Super admin accounts cannot be enabled or disabled" });
      }
      if (!userMatchesScope(scopeInfo, target)) {
        return res.status(403).json({ error: "FORBIDDEN", message: "You can only manage users within your state." });
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
    } catch (err) {
      if (err?.status) {
        return res.status(err.status).json({ error: err.code || "FORBIDDEN", message: err.message || "Forbidden" });
      }
      console.error("admin/users/enable:", err);
      res.status(500).json({ error: "SERVER", message: "Could not enable user" });
    }
  });

  router.delete("/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const scopeInfo = await resolveAdminScope(req);
      const uid = Number(req.params.id || 0);
      if (!uid) return res.status(400).json({ error: "MISSING_ID" });
      const [[target]] = await q(
        `SELECT id, username, email, phone, role, eligibilityStatus, profilePhoto, state
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
      if (!userMatchesScope(scopeInfo, target)) {
        return res.status(403).json({ error: "FORBIDDEN", message: "You can only manage users within your state." });
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
      req.app.get("io")?.to(`user:${uid}`).emit("accountDeleted", { reason: "admin" });
      res.json({ success: true });
    } catch (err) {
      if (err?.status) {
        return res.status(err.status).json({ error: err.code || "FORBIDDEN", message: err.message || "Forbidden" });
      }
      console.error("admin/users/delete:", err);
      res.status(500).json({ error: "SERVER", message: "Could not delete user" });
    }
  });

  router.post("/users/:id/reset-password", requireAuth, requireRole(["super-admin", "admin"]), async (req, res) => {
    try {
      const scopeInfo = await resolveAdminScope(req);
      const uid = Number(req.params.id || 0);
      const { password } = req.body || {};
      if (!uid) return res.status(400).json({ error: "MISSING_ID" });
      if (typeof password !== "string" || password.trim().length < 8) {
        return res.status(400).json({ error: "INVALID_PASSWORD", message: "Password must be at least 8 characters" });
      }
      const [[target]] = await q(`SELECT role, state FROM Users WHERE id=?`, [uid]);
      if (!target) return res.status(404).json({ error: "NOT_FOUND" });
      const actorRole = (req.user?.role || "").toLowerCase();
      if (target.role?.toLowerCase() === "super-admin" && actorRole !== "super-admin") {
        return res.status(403).json({ error: "FORBIDDEN", message: "Only super admins can modify super admin accounts" });
      }
      if (!userMatchesScope(scopeInfo, target)) {
        return res.status(403).json({ error: "FORBIDDEN", message: "You can only manage users within your state." });
      }
      const hash = await bcrypt.hash(password.trim(), 10);
      await q(`UPDATE Users SET password=?, mustResetPassword=1 WHERE id=?`, [hash, uid]);
      await recordAuditEvent({
        actorId: req.user?.id || null,
        actorRole: (req.user?.role || "").toLowerCase() || null,
        action: "user.password.reset",
        entityType: "user",
        entityId: String(uid),
        notes: "Password reset by admin",
      });
      res.json({ success: true });
    } catch (err) {
      if (err?.status) {
        return res.status(err.status).json({ error: err.code || "FORBIDDEN", message: err.message || "Forbidden" });
      }
      console.error("admin/users/reset-password:", err);
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
    } catch (err) {
      console.error("admin/users/role:", err);
      res.status(500).json({ error: "SERVER", message: "Could not update role" });
    }
  });
};
