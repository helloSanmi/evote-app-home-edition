const fs = require("fs");
const path = require("path");
const { requireAuth, requireRole } = require("../../middleware/auth");
const { uploadRoot, removeFromObjectStorage } = require("../../utils/uploads");
const { recordAuditEvent } = require("../../utils/audit");

module.exports = function registerAdminFileRoutes(router) {
  router.delete("/files", requireAuth, requireRole(["super-admin"]), async (req, res) => {
    const body = req.body || {};
    const input = Array.isArray(body.paths)
      ? body.paths
      : body.path
        ? [body.path]
        : [];
    const paths = input;
    if (!paths.length) {
      return res.status(400).json({ error: "MISSING_PATHS", message: "Provide at least one file path to delete." });
    }

    const removed = [];
    const errors = [];

    for (const raw of paths) {
      const value = String(raw || "").trim();
      if (!value || !value.startsWith("/uploads/")) {
        errors.push({ path: raw, error: "INVALID_PATH" });
        continue;
      }
      const relative = value.replace(/^\/?uploads\/?/, "");
      const localPath = path.join(uploadRoot, relative);
      try {
        await removeFromObjectStorage(relative);
      } catch (err) {
        errors.push({ path: raw, error: err?.message || "STORAGE_DELETE_FAILED" });
        continue;
      }
      try {
        if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
          fs.unlinkSync(localPath);
        }
        removed.push(value);
      } catch (err) {
        errors.push({ path: raw, error: err?.message || "LOCAL_DELETE_FAILED" });
      }
    }

    if (removed.length) {
      await recordAuditEvent({
        actorId: req.user?.id || null,
        actorRole: "super-admin",
        action: "storage.files.deleted",
        entityType: "storage",
        entityId: removed.join(","),
        before: null,
        after: null,
        notes: `${removed.length} file(s) purged by super admin`,
      });
    }

    res.json({ success: true, removed, errors });
  });
};
