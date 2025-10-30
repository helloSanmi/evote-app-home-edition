const express = require("express");
const router = express.Router();
const { q, getDbPool } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { mapRow } = require("../utils/notifications");
const { checkEligibility } = require("../utils/eligibility");

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 40;

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function matchesNotificationScope(notification, user) {
  if (!notification) return false;
  const scope = normalize(notification.scope);
  if (!scope || scope === "global" || scope === "national") return true;
  if (!user) return false;

  const userState = normalize(user.state);
  const userLga = normalize(user.residenceLGA);

  if (scope === "state") {
    const targetState = normalize(notification.scopeState);
    return Boolean(userState) && (!targetState || userState === targetState);
  }

  if (scope === "local") {
    const targetState = normalize(notification.scopeState);
    const targetLga = normalize(notification.scopeLGA);
    const stateMatches = !targetState || (userState && userState === targetState);
    const lgaMatches = !targetLga || (userLga && userLga === targetLga);
    return stateMatches && lgaMatches;
  }

  return true;
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit || DEFAULT_LIMIT);
    const limit = Math.min(Math.max(limitRaw || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const audienceReq = String(req.query.audience || "").toLowerCase();
    const audience = audienceReq === "admin" ? "admin" : "user";
    const audienceClause = audience === "admin"
      ? "e.audience = 'admin'"
      : "(e.audience IS NULL OR e.audience = '' OR e.audience = 'user')";
    const sql = `
      SELECT e.id,
             e.type,
             e.title,
             e.message,
             e.audience,
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
      WHERE ${audienceClause}
        AND (r.clearedAt IS NULL)
      ORDER BY e.createdAt DESC, e.id DESC
      LIMIT ${limit}
    `;
    const [rows] = await q(sql, [req.user.id]);
    const notifications = (rows || []).map((row) => mapRow(row));

    if (notifications.length === 0) {
      return res.json([]);
    }

    const isUserAudience = audience === "user";
    if (!isUserAudience) {
      return res.json(notifications);
    }

    const [[userProfile]] = await q(
      `SELECT id, state, residenceLGA, dateOfBirth, eligibilityStatus, email, nationalId
         FROM Users
        WHERE id=?
        LIMIT 1`,
      [req.user.id]
    );

    if (!userProfile) {
      return res.json([]);
    }

    const eligibilityStatus = normalize(userProfile.eligibilityStatus);
    if (eligibilityStatus === "disabled") {
      return res.json([]);
    }

    const periodIds = Array.from(
      new Set(
        notifications
          .map((item) => item.periodId)
          .filter((value) => Number.isInteger(value) && value > 0)
      )
    );

    const periodMap = new Map();
    if (periodIds.length > 0) {
      const placeholders = periodIds.map(() => "?").join(",");
      const [periodRows] = await q(
        `SELECT id, title, startTime, endTime, minAge, scope, scopeState, scopeLGA, requireWhitelist
           FROM VotingPeriod
          WHERE id IN (${placeholders})`,
        periodIds
      );
      (periodRows || []).forEach((period) => {
        periodMap.set(period.id, period);
      });
    }

    const pool = getDbPool();
    const eligibilityCache = new Map();
    const eligibleNotifications = [];

    for (const notification of notifications) {
      if (notification.periodId && periodMap.has(notification.periodId)) {
        if (!eligibilityCache.has(notification.periodId)) {
          const period = periodMap.get(notification.periodId);
          const result = await checkEligibility(pool, userProfile, period);
          eligibilityCache.set(notification.periodId, Boolean(result?.eligible));
        }
        if (!eligibilityCache.get(notification.periodId)) {
          continue;
        }
      } else if (!matchesNotificationScope(notification, userProfile)) {
        continue;
      }
      eligibleNotifications.push(notification);
    }

    res.json(eligibleNotifications);
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
