// backend/middleware/logger.js
const jwt = require("jsonwebtoken");
const { getDbPool } = require("../db");

async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS RequestLogs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      method VARCHAR(8) NOT NULL,
      path VARCHAR(255) NOT NULL,
      userId INT NULL,
      ip VARCHAR(64) NULL,
      userAgent TEXT NULL,
      referer TEXT NULL,
      country VARCHAR(64) NULL,
      city VARCHAR(64) NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_createdAt (createdAt),
      INDEX idx_path (path(191)),
      INDEX idx_userId (userId)
    ) ENGINE=InnoDB;
  `);
}

async function insertLog(row) {
  const pool = await getDbPool();
  try {
    await pool.query(
      `INSERT INTO RequestLogs (method, path, userId, ip, userAgent, referer, country, city)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.method,
        row.path,
        row.userId ?? null,
        row.ip ?? null,
        row.userAgent ?? null,
        row.referer ?? null,
        row.country ?? null,
        row.city ?? null,
      ]
    );
  } catch (e) {
    if (e && e.code === "ER_NO_SUCH_TABLE") {
      await ensureTable(pool);
      await pool.query(
        `INSERT INTO RequestLogs (method, path, userId, ip, userAgent, referer, country, city)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.method,
          row.path,
          row.userId ?? null,
          row.ip ?? null,
          row.userAgent ?? null,
          row.referer ?? null,
          row.country ?? null,
          row.city ?? null,
        ]
      );
    } else {
      // soft-fail
      console.warn("log insert failed:", e && e.message);
    }
  }
}

module.exports = function logger(req, res, next) {
  const start = Date.now();

  // extract userId if possible
  let userId = null;
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token && process.env.JWT_SECRET) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      // support both payload.id and payload.userId
      userId = payload?.userId ?? payload?.id ?? null;
    } catch {
      // ignore
    }
  }

  const ip =
    (req.headers["x-forwarded-for"] || "")
      .toString()
      .split(",")[0]
      .trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    null;

  const userAgent = req.headers["user-agent"] || null;
  const referer = req.headers["referer"] || null;

  // optional country/city via common CDN headers if present
  const country =
    req.headers["cf-ipcountry"] ||
    req.headers["x-vercel-ip-country"] ||
    null;
  const city =
    req.headers["cf-ipcity"] ||
    req.headers["x-vercel-ip-city"] ||
    null;

  res.on("finish", () => {
    // sample: log everything (tune if needed)
    insertLog({
      method: req.method,
      path: req.originalUrl || req.url,
      userId,
      ip,
      userAgent,
      referer,
      country,
      city,
      ms: Date.now() - start,
    });
  });

  next();
};
