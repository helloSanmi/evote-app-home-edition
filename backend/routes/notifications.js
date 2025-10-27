const express = require("express");
const router = express.Router();
const { q } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { mapRow } = require("../utils/notifications");

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 40;

router.get("/", requireAuth, async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit || DEFAULT_LIMIT);
    const limit = Math.min(Math.max(limitRaw || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const sql = `
      SELECT e.id,
             e.type,
             e.title,
             e.message,
             e.scope,
             e.scopeState,
             e.scopeLGA,
             e.periodId,
             e.metadata,
             e.createdAt,
             r.readAt,
             r.clearedAt
      FROM NotificationEvent e
      LEFT JOIN NotificationReceipt r
        ON r.notificationId = e.id
       AND r.userId = ?
      WHERE r.clearedAt IS NULL
      ORDER BY e.createdAt DESC, e.id DESC
      LIMIT ${limit}
    `;
    const [rows] = await q(sql, [req.user.id]);
    const payload = (rows || []).map((row) => mapRow(row));
    res.json(payload);
  } catch (err) {
    console.error("notifications/list:", err);
    res.status(500).json({ error: "SERVER", message: "Could not load notifications" });
  }
});

router.post("/:id/read", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: "INVALID_ID" });
    await q(
      `INSERT INTO NotificationReceipt (notificationId, userId, readAt, clearedAt)
       VALUES (?,?,UTC_TIMESTAMP(),NULL)
       ON DUPLICATE KEY UPDATE
         readAt = COALESCE(NotificationReceipt.readAt, VALUES(readAt)),
         clearedAt = NULL`,
      [id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("notifications/read:", err);
    res.status(500).json({ error: "SERVER", message: "Could not mark notification as read" });
  }
});

router.post("/:id/clear", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: "INVALID_ID" });
    await q(
      `INSERT INTO NotificationReceipt (notificationId, userId, readAt, clearedAt)
       VALUES (?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
         readAt = COALESCE(NotificationReceipt.readAt, VALUES(readAt)),
         clearedAt = VALUES(clearedAt)`,
      [id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("notifications/clear:", err);
    res.status(500).json({ error: "SERVER", message: "Could not clear notification" });
  }
});

router.post("/mark-all-read", requireAuth, async (req, res) => {
  try {
    await q(
      `INSERT INTO NotificationReceipt (notificationId, userId, readAt, clearedAt)
       SELECT e.id, ?, UTC_TIMESTAMP(), NULL
         FROM NotificationEvent e
         LEFT JOIN NotificationReceipt r
           ON r.notificationId = e.id
          AND r.userId = ?
        WHERE r.notificationId IS NULL OR r.readAt IS NULL
       ON DUPLICATE KEY UPDATE
         readAt = COALESCE(NotificationReceipt.readAt, VALUES(readAt))`,
      [req.user.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("notifications/markAllRead:", err);
    res.status(500).json({ error: "SERVER", message: "Could not mark notifications as read" });
  }
});

router.post("/clear-all", requireAuth, async (req, res) => {
  try {
    await q(
      `INSERT INTO NotificationReceipt (notificationId, userId, readAt, clearedAt)
       SELECT e.id, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP()
         FROM NotificationEvent e
         LEFT JOIN NotificationReceipt r
           ON r.notificationId = e.id
          AND r.userId = ?
        WHERE r.notificationId IS NULL OR r.clearedAt IS NULL
       ON DUPLICATE KEY UPDATE
         readAt = COALESCE(NotificationReceipt.readAt, VALUES(readAt)),
         clearedAt = VALUES(clearedAt)`,
      [req.user.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("notifications/clearAll:", err);
    res.status(500).json({ error: "SERVER", message: "Could not clear notifications" });
  }
});

module.exports = router;
