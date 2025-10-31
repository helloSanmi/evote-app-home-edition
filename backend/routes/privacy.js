const express = require("express");
const crypto = require("node:crypto");
const router = express.Router();

const { q } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

function normalizeBool(value) {
  if (value === true || value === false) return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "on"].includes(normalized);
  }
  return false;
}

function normalizeVisitorId(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 64);
}

function generateVisitorId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `visitor_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

router.post("/consent", async (req, res) => {
  try {
    const analytics = normalizeBool(req.body?.analytics);
    const marketing = normalizeBool(req.body?.marketing);
    let visitorId = normalizeVisitorId(req.body?.visitorId);
    let userId = req.user?.id || null;

    if (!visitorId) {
      visitorId = generateVisitorId();
    }

    if (userId) {
      const [[exists]] = await q(`SELECT id FROM Users WHERE id=? LIMIT 1`, [userId]);
      if (!exists) userId = null;
    }

    const persist = async (uid) => q(
      `INSERT INTO CookieConsent (userId, visitorId, analytics, marketing)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE
         userId = VALUES(userId),
         analytics = VALUES(analytics),
         marketing = VALUES(marketing),
         updatedAt = CURRENT_TIMESTAMP`,
      [uid, visitorId, analytics ? 1 : 0, marketing ? 1 : 0]
    );

    try {
      await persist(userId);
    } catch (err) {
      if (err?.code === "ER_NO_REFERENCED_ROW_2") {
        userId = null;
        await persist(userId);
      } else {
        throw err;
      }
    }

    const [[record]] = await q(
      `SELECT cc.id,
              cc.userId,
              cc.visitorId,
              cc.analytics,
              cc.marketing,
              cc.updatedAt
         FROM CookieConsent cc
        WHERE (cc.visitorId = ?)
           OR (cc.userId IS NOT NULL AND cc.userId = ?)
        ORDER BY cc.updatedAt DESC
        LIMIT 1`,
      [visitorId, userId || 0]
    );

    res.json({
      success: true,
      visitorId: record?.visitorId || visitorId,
      analytics: Boolean(record?.analytics),
      marketing: Boolean(record?.marketing),
      updatedAt: record?.updatedAt || null,
    });
  } catch (err) {
    console.error("privacy/consent:", err);
    res.status(500).json({ error: "SERVER", message: "Could not store consent preferences" });
  }
});

router.get(
  "/consent/dashboard",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (_req, res) => {
    try {
      const [[summaryRow]] = await q(`
        SELECT
          COUNT(*) AS total,
          SUM(analytics = 1) AS analyticsOn,
          SUM(marketing = 1) AS marketingOn,
          SUM(analytics = 1 AND marketing = 1) AS bothOn,
          MAX(updatedAt) AS lastUpdated
        FROM CookieConsent
      `);

      const [[uniqueUsersRow]] = await q(
        `SELECT COUNT(DISTINCT userId) AS c FROM CookieConsent WHERE userId IS NOT NULL`
      );
      const [[anonymousRow]] = await q(
        `SELECT COUNT(*) AS c FROM CookieConsent WHERE userId IS NULL`
      );

      const [records] = await q(
        `SELECT cc.id,
                cc.userId,
                cc.visitorId,
                cc.analytics,
                cc.marketing,
                cc.createdAt,
                cc.updatedAt,
                u.email,
                u.username,
                u.fullName
           FROM CookieConsent cc
           LEFT JOIN Users u ON u.id = cc.userId
          ORDER BY cc.updatedAt DESC
          LIMIT 200`
      );

      const total = Number(summaryRow?.total || 0);
      const analyticsOn = Number(summaryRow?.analyticsOn || 0);
      const marketingOn = Number(summaryRow?.marketingOn || 0);
      const bothOn = Number(summaryRow?.bothOn || 0);

      res.json({
        summary: {
          total,
          analyticsOn,
          analyticsOff: total - analyticsOn,
          marketingOn,
          marketingOff: total - marketingOn,
          bothOn,
          lastUpdated: summaryRow?.lastUpdated || null,
        },
        breakdown: {
          uniqueUsers: Number(uniqueUsersRow?.c || 0),
          anonymous: Number(anonymousRow?.c || 0),
        },
        records: (records || []).map((row) => ({
          id: row.id,
          userId: row.userId,
          visitorId: row.visitorId,
          analytics: Boolean(row.analytics),
          marketing: Boolean(row.marketing),
          updatedAt: row.updatedAt,
          createdAt: row.createdAt,
          email: row.email || null,
          username: row.username || null,
          fullName: row.fullName || null,
        })),
      });
    } catch (err) {
      console.error("privacy/consent/dashboard:", err);
      res.status(500).json({ error: "SERVER", message: "Unable to load consent dashboard" });
    }
  }
);

router.get(
  "/consent/export",
  requireAuth,
  requireRole(["admin", "super-admin"]),
  async (_req, res) => {
    try {
      const [rows] = await q(
        `SELECT cc.id,
                cc.userId,
                cc.visitorId,
                cc.analytics,
                cc.marketing,
                cc.createdAt,
                cc.updatedAt,
                u.email,
                u.username,
                u.fullName
           FROM CookieConsent cc
           LEFT JOIN Users u ON u.id = cc.userId
          ORDER BY cc.updatedAt DESC`
      );

      const header = [
        "id",
        "userId",
        "visitorId",
        "analytics",
        "marketing",
        "updatedAt",
        "createdAt",
        "email",
        "username",
        "fullName",
      ];

      const csv = [
        header.join(","),
        ...(rows || []).map((row) =>
          [
            row.id,
            row.userId ?? "",
            row.visitorId ?? "",
            row.analytics ? "true" : "false",
            row.marketing ? "true" : "false",
            row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt || "",
            row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt || "",
            JSON.stringify(row.email || ""),
            JSON.stringify(row.username || ""),
            JSON.stringify(row.fullName || ""),
          ].join(",")
        ),
      ].join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=\"cookie-consent.csv\"");
      res.send(csv);
    } catch (err) {
      console.error("privacy/consent/export:", err);
      res.status(500).json({ error: "SERVER", message: "Unable to export consent records" });
    }
  }
);

module.exports = router;
