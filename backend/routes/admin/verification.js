const { q } = require("../../db");
const { requireAuth, requireRole } = require("../../middleware/auth");
const { getSignedUrl } = require("../../utils/uploads");
const { resolveAdminScope, userMatchesScope } = require("./utils");
const { recordAuditEvent } = require("../../utils/audit");
const { notify } = require("../../utils/notifications");

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

async function mapRequests(rows) {
  if (!rows?.length) return [];
  const ids = rows.map((row) => row.id);
  const [attachments] = await q(
    `SELECT id, requestId, fileKey, fileName, contentType, size, uploadedAt
       FROM VerificationAttachment
      WHERE requestId IN (${ids.map(() => "?").join(",")})
      ORDER BY uploadedAt ASC`,
    ids
  );
  const grouped = new Map();
  (attachments || []).forEach((item) => {
    if (!grouped.has(item.requestId)) grouped.set(item.requestId, []);
    grouped.get(item.requestId).push(item);
  });
  return rows.map((row) => ({
    ...row,
    attachments: grouped.get(row.id) || [],
  }));
}

module.exports = function registerAdminVerificationRoutes(router) {
  router.get("/verification/requests", requireAuth, requireRole(["admin", "super-admin"]), async (req, res) => {
    try {
      const scopeInfo = await resolveAdminScope(req);
      const status = (req.query.status || "").toLowerCase();
      const rawPage = Number(req.query.page || 1);
      const rawPageSize = Number(req.query.pageSize || PAGE_SIZE_DEFAULT);
      const page = Math.max(Number.isFinite(rawPage) ? Math.floor(rawPage) : 1, 1);
      const pageSize = Math.min(
        Math.max(Number.isFinite(rawPageSize) ? Math.floor(rawPageSize) : PAGE_SIZE_DEFAULT, 1),
        PAGE_SIZE_MAX
      );
      const offset = Math.max((page - 1) * pageSize, 0);

      let where = "1=1";
      const params = [];
      if (["pending", "approved", "rejected", "cancelled"].includes(status)) {
        where += " AND vr.status=?";
        params.push(status);
      }

      if (!scopeInfo.isSuper) {
        where += " AND LOWER(COALESCE(u.state,'')) = ?";
        params.push(scopeInfo.state.toLowerCase());
      }

      const [[countRow]] = await q(
        `SELECT COUNT(*) AS c
           FROM VerificationRequest vr
           JOIN Users u ON u.id = vr.userId
          WHERE ${where}`,
        params
      );
      const total = countRow?.c || 0;

      const limitClause = `LIMIT ${pageSize} OFFSET ${offset}`;
      const queryParams = params.slice();
      const [rows] = await q(
        `SELECT vr.id, vr.userId, vr.status, vr.documentType, vr.notes, vr.adminNotes,
                vr.metadata, vr.submittedAt, vr.reviewedAt, vr.reviewedBy,
                u.fullName, u.email, u.state, u.residenceLGA, u.verificationStatus
           FROM VerificationRequest vr
           JOIN Users u ON u.id = vr.userId
          WHERE ${where}
          ORDER BY vr.submittedAt DESC
          ${limitClause}`,
        queryParams
      );

      const mapped = await mapRequests(rows);
      res.json({ total, page, pageSize, items: mapped });
    } catch (err) {
      console.error("admin/verification:list", err);
      res.status(500).json({ error: "SERVER", message: "Could not load verification requests" });
    }
  });

  router.get("/verification/requests/:id", requireAuth, requireRole(["admin", "super-admin"]), async (req, res) => {
    try {
      const scopeInfo = await resolveAdminScope(req);
      const id = Number(req.params.id || 0);
      if (!id) return res.status(400).json({ error: "INVALID_ID" });
      const [[request]] = await q(
        `SELECT vr.id, vr.userId, vr.status, vr.documentType, vr.notes, vr.adminNotes, vr.metadata,
                vr.submittedAt, vr.reviewedAt, vr.reviewedBy,
                u.fullName, u.email, u.state, u.residenceLGA, u.verificationStatus
           FROM VerificationRequest vr
           JOIN Users u ON u.id = vr.userId
          WHERE vr.id=?`,
        [id]
      );
      if (!request) return res.status(404).json({ error: "NOT_FOUND" });
      if (!userMatchesScope(scopeInfo, request)) {
        return res.status(403).json({ error: "FORBIDDEN", message: "You are not authorized to view this request" });
      }
      const [attachments] = await q(
        `SELECT id, requestId, fileKey, fileName, contentType, size, uploadedAt
           FROM VerificationAttachment
          WHERE requestId=?
          ORDER BY uploadedAt ASC`,
        [id]
      );
      const items = await Promise.all(
        (attachments || []).map(async (file) => ({
          ...file,
          signedUrl: await getSignedUrl(file.fileKey),
        }))
      );
      res.json({ ...request, attachments: items });
    } catch (err) {
      console.error("admin/verification:get", err);
      res.status(500).json({ error: "SERVER", message: "Could not load verification request" });
    }
  });

  router.post("/verification/requests/:id/decision", requireAuth, requireRole(["admin", "super-admin"]), async (req, res) => {
    let { decision, adminNotes } = req.body || {};
    decision = String(decision || "").toLowerCase();
    adminNotes = adminNotes ? String(adminNotes).trim() : null;
    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({ error: "INVALID_DECISION", message: "Decision must be approved or rejected." });
    }
    try {
      const scopeInfo = await resolveAdminScope(req);
      const id = Number(req.params.id || 0);
      if (!id) return res.status(400).json({ error: "INVALID_ID" });
      const [[request]] = await q(
        `SELECT vr.id, vr.userId, vr.status, u.verificationStatus, u.state
           FROM VerificationRequest vr
           JOIN Users u ON u.id = vr.userId
          WHERE vr.id=?`,
        [id]
      );
      if (!request) return res.status(404).json({ error: "NOT_FOUND" });
      if (!userMatchesScope(scopeInfo, request)) {
        return res.status(403).json({ error: "FORBIDDEN", message: "You cannot review this request." });
      }
      if (request.status !== "pending") {
        return res.status(409).json({ error: "NOT_PENDING", message: "Request is no longer pending." });
      }

      await q(
        `UPDATE VerificationRequest
            SET status=?, adminNotes=?, reviewedAt=UTC_TIMESTAMP(), reviewedBy=?, metadata=NULL
          WHERE id=?`,
        [decision, adminNotes, req.user.id, id]
      );
      const nextStatus = decision === "approved" ? "verified" : "none";
      await q(
        `UPDATE Users SET verificationStatus=? WHERE id=?`,
        [nextStatus, request.userId]
      );

      const io = req.app.get("io");
      try {
        await notify(io, {
          audience: "user",
          type: `verification.${decision}`,
          title: decision === "approved" ? "Verification approved" : "Verification rejected",
          message: decision === "approved"
            ? "Your identity verification was approved."
            : `Your identity verification was rejected${adminNotes ? `: ${adminNotes}` : "."}`,
          userIds: [request.userId],
          metadata: {
            verificationRequestId: id,
            decision,
          },
        });
      } catch (notifyErr) {
        console.error("admin/verification notify", notifyErr);
      }

      await recordAuditEvent({
        actorId: req.user?.id || null,
        actorRole: (req.user?.role || "admin").toLowerCase(),
        action: `verification.request.${decision}`,
        entityType: "verificationRequest",
        entityId: String(id),
        notes: adminNotes,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("admin/verification:decision", err);
      res.status(500).json({ error: "SERVER", message: "Could not update request." });
    }
  });
};
