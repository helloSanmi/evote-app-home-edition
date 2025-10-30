const { q } = require("../../db");
const { requireAuth, requireRole } = require("../../middleware/auth");

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

module.exports = function registerLogRoutes(router) {
  router.get("/logs", requireAuth, requireRole(["super-admin"]), async (_req, res) => {
    try {
      const [rows] = await q(`SELECT ${LOG_COLUMNS} FROM RequestLogs ORDER BY id DESC LIMIT ${LOG_LIMIT}`);
      res.json(rows || []);
    } catch (err) {
      console.error("admin/logs:", err);
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
        csvEscape(r.createdAt?.toISOString?.() || r.createdAt || ""),
      ].join(",")).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="request-logs.csv"');
      res.send(csv);
    } catch (err) {
      console.error("admin/logs/export:", err);
      res.status(500).json({ error: "SERVER" });
    }
  });

  router.get("/logs/export-json", requireAuth, requireRole(["super-admin"]), async (_req, res) => {
    try {
      const [rows] = await q(`SELECT ${LOG_COLUMNS} FROM RequestLogs ORDER BY id DESC LIMIT ${LOG_LIMIT}`);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", 'attachment; filename="request-logs.json"');
      res.send(JSON.stringify(rows || [], null, 2));
    } catch (err) {
      console.error("admin/logs/export-json:", err);
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
};
