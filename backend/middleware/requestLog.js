// backend/middleware/requestLog.js
const { getDbPool } = require("../db");

let ensured = false;

async function ensureTable() {
  if (ensured) return;
  const pool = await getDbPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS RequestLogs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      method VARCHAR(10),
      path VARCHAR(512),
      userId INT NULL,
      ip VARCHAR(64),
      userAgent VARCHAR(512),
      referer VARCHAR(512),
      country VARCHAR(64),
      city VARCHAR(128),
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_createdAt (createdAt),
      INDEX idx_userId (userId)
    ) ENGINE=InnoDB;
  `);
  ensured = true;
}

module.exports.requestLogger = async (req, res, next) => {
  try { await ensureTable(); } catch {}
  const start = Date.now();

  res.on("finish", async () => {
    try {
      const pool = await getDbPool();
      const ip =
        req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
        req.socket?.remoteAddress ||
        null;
      const ua = req.headers["user-agent"] || null;
      const ref = req.headers["referer"] || req.headers["referrer"] || null;
      // If you front with Cloudflare/NGINX, set headers below for geo
      const country = req.headers["cf-ipcountry"] || req.headers["x-geo-country"] || null;
      const city = req.headers["x-geo-city"] || null;

      await pool.query(
        `INSERT INTO RequestLogs (method, path, userId, ip, userAgent, referer, country, city)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.method, req.originalUrl || req.url, req.user?.id || null, ip, ua, ref, country, city]
      );
    } catch {
      // swallow logging errors
    }
  });

  next();
};
