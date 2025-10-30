const { requireAuth, requireRole } = require("../../middleware/auth");
const { recordAuditEvent } = require("../../utils/audit");
const { notify } = require("../../utils/notifications");
const {
  q,
  getConn,
  safeJsonParse,
  validateProfileChangeFields,
} = require("./utils");

module.exports = function registerProfileChangeRoutes(router) {
  router.get("/profile-change-requests", requireAuth, requireRole(["super-admin"]), async (req, res) => {
    try {
      const allowedStatuses = new Set(["pending", "approved", "rejected"]);
      const requestedStatus = String(req.query.status || "pending").toLowerCase();
      const status = allowedStatuses.has(requestedStatus) ? requestedStatus : "pending";
      const search = String(req.query.search || "").trim().toLowerCase();
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

      const whereParts = ["r.status = ?"];
      const params = [status];
      if (search) {
        const term = `%${search}%`;
        whereParts.push("(LOWER(u.email) LIKE ? OR LOWER(u.username) LIKE ? OR LOWER(u.fullName) LIKE ?)");
        params.push(term, term, term);
      }
      const whereClause = `WHERE ${whereParts.join(" AND ")}`;

      const [[countRow]] = await q(
        `SELECT COUNT(*) AS total
           FROM UserProfileChangeRequest r
           JOIN Users u ON u.id = r.userId
          ${whereClause}`,
        params
      );
      const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 50;
      const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
      const [rows] = await q(
        `SELECT r.id,
                r.userId,
                r.status,
                r.fields,
                r.notes,
                r.approverId,
                r.approvedAt,
                r.createdAt,
                r.updatedAt,
                u.fullName,
                u.username,
                u.email,
                u.state,
                u.residenceLGA,
                u.role,
                u.eligibilityStatus,
                u.phone,
                u.nationalId,
                u.voterCardNumber
           FROM UserProfileChangeRequest r
           JOIN Users u ON u.id = r.userId
          ${whereClause}
          ORDER BY r.createdAt DESC, r.id DESC
          LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      );
      const mapped = (rows || []).map((row) => ({
        ...row,
        fields: safeJsonParse(row.fields),
      }));
      res.json({
        items: mapped,
        total: Number(countRow?.total || 0),
        status,
        limit: safeLimit,
        offset: safeOffset,
      });
    } catch (err) {
      console.error("admin/profile-change-requests:list", err);
      res.status(500).json({ error: "SERVER", message: "Unable to load change requests" });
    }
  });

  router.post("/profile-change-requests/:id/approve", requireAuth, requireRole(["super-admin"]), async (req, res) => {
    let conn;
    try {
      const requestId = Number(req.params.id || 0);
      if (!requestId) return res.status(400).json({ error: "MISSING_ID" });
      const notes = req.body?.notes ? String(req.body.notes).slice(0, 255) : null;
      conn = await getConn();
      await conn.beginTransaction();
      const [rows] = await conn.execute(
        `SELECT id, userId, status, fields, notes
           FROM UserProfileChangeRequest
          WHERE id=?
          FOR UPDATE`,
        [requestId]
      );
      const request = rows?.[0];
      if (!request) {
        await conn.rollback();
        return res.status(404).json({ error: "NOT_FOUND", message: "Change request not found" });
      }
      if (request.status !== "pending") {
        await conn.rollback();
        return res.status(409).json({ error: "ALREADY_HANDLED", message: "This request has already been processed." });
      }
      const pendingFields = safeJsonParse(request.fields);
      const { updates } = await validateProfileChangeFields(request.userId, pendingFields, conn);
      const updateKeys = Object.keys(updates);
      if (!updateKeys.length) {
        await conn.rollback();
        return res.status(400).json({ error: "NO_CHANGES", message: "No new changes to approve." });
      }
      const setClause = updateKeys.map((key) => `${key}=?`).join(", ");
      const setValues = updateKeys.map((key) => updates[key]);
      await conn.execute(
        `UPDATE Users SET ${setClause}, updatedAt=UTC_TIMESTAMP() WHERE id=?`,
        [...setValues, request.userId]
      );
      await conn.execute(
        `UPDATE UserProfileChangeRequest
            SET status='approved',
                approverId=?,
                approvedAt=UTC_TIMESTAMP(),
                notes=?
          WHERE id=?`,
        [req.user.id, notes, requestId]
      );
      await conn.commit();
      conn.release();
      conn = null;

      await recordAuditEvent({
        actorId: req.user?.id || null,
        actorRole: (req.user?.role || "").toLowerCase() || null,
        action: "profile.change.approved",
        entityType: "user",
        entityId: String(request.userId),
        before: pendingFields,
        after: updates,
        notes: notes || undefined,
      });

      const io = req.app.get("io");
      notify(io, {
        audience: "user",
        type: "profile.change.approved",
        title: "Profile change approved",
        message: "Your requested profile update has been approved.",
        scope: "global",
        metadata: { fields: updateKeys },
      }, { userIds: [request.userId] }).catch((err) => {
        console.error("notify profile change approved:", err);
      });

      res.json({ success: true, updatedFields: updateKeys });
    } catch (err) {
      if (conn) {
        try { await conn.rollback(); } catch (rollbackErr) { console.error("profile-change rollback", rollbackErr); }
        conn.release();
      }
      if (err?.status) {
        return res.status(err.status).json({ error: err.code || "FORBIDDEN", message: err.message || "Forbidden" });
      }
      console.error("admin/profile-change-requests:approve", err);
      res.status(500).json({ error: "SERVER", message: "Unable to approve change request" });
    }
  });

  router.post("/profile-change-requests/:id/reject", requireAuth, requireRole(["super-admin"]), async (req, res) => {
    let conn;
    try {
      const requestId = Number(req.params.id || 0);
      if (!requestId) return res.status(400).json({ error: "MISSING_ID" });
      const notes = req.body?.notes ? String(req.body.notes).slice(0, 255) : null;
      conn = await getConn();
      await conn.beginTransaction();
      const [rows] = await conn.execute(
        `SELECT id, userId, status, fields
           FROM UserProfileChangeRequest
          WHERE id=?
          FOR UPDATE`,
        [requestId]
      );
      const request = rows?.[0];
      if (!request) {
        await conn.rollback();
        return res.status(404).json({ error: "NOT_FOUND", message: "Change request not found" });
      }
      if (request.status !== "pending") {
        await conn.rollback();
        return res.status(409).json({ error: "ALREADY_HANDLED", message: "This request has already been processed." });
      }
      await conn.execute(
        `UPDATE UserProfileChangeRequest
            SET status='rejected',
                approverId=?,
                approvedAt=UTC_TIMESTAMP(),
                notes=?
          WHERE id=?`,
        [req.user.id, notes, requestId]
      );
      await conn.commit();
      conn.release();
      conn = null;

      await recordAuditEvent({
        actorId: req.user?.id || null,
        actorRole: (req.user?.role || "").toLowerCase() || null,
        action: "profile.change.rejected",
        entityType: "user",
        entityId: String(request.userId),
        before: safeJsonParse(request.fields),
        after: null,
        notes: notes || undefined,
      });

      const io = req.app.get("io");
      notify(io, {
        audience: "user",
        type: "profile.change.rejected",
        title: "Profile change rejected",
        message: notes || "Your requested profile update was rejected.",
        scope: "global",
        metadata: { notes },
      }, { userIds: [request.userId] }).catch((notifyErr) => {
        console.error("notify profile change rejected:", notifyErr);
      });

      res.json({ success: true });
    } catch (err) {
      if (conn) {
        try { await conn.rollback(); } catch (rollbackErr) { console.error("profile-change rollback", rollbackErr); }
        conn.release();
      }
      if (err?.status) {
        return res.status(err.status).json({ error: err.code || "FORBIDDEN", message: err.message || "Forbidden" });
      }
      console.error("admin/profile-change-requests:reject", err);
      res.status(500).json({ error: "SERVER", message: "Unable to reject change request" });
    }
  });
};
