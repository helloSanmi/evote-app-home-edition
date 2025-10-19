const geoip = require("geoip-lite");
const { q } = require("../db");

const MAX_STORED_LENGTH = 2000;
const SENSITIVE_KEYS = new Set(["password", "newPassword", "confirmPassword", "oldPassword", "token", "otp", "secret"]);

function cloneAndRedact(value, depth = 0) {
  if (depth > 3) return "[depth]";
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => cloneAndRedact(item, depth + 1));
  if (typeof value === "object") {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key)) {
        result[key] = "[redacted]";
      } else {
        result[key] = cloneAndRedact(val, depth + 1);
      }
    }
    return result;
  }
  if (typeof value === "string" && value.length > MAX_STORED_LENGTH) {
    return `${value.slice(0, MAX_STORED_LENGTH)}…`;
  }
  return value;
}

function compactJson(value) {
  if (!value) return null;
  try {
    const cleaned = cloneAndRedact(value);
    const raw = JSON.stringify(cleaned);
    if (!raw || raw === "{}" || raw === "[]") return null;
    if (raw.length <= MAX_STORED_LENGTH) return raw;
    return `${raw.slice(0, MAX_STORED_LENGTH)}…`;
  } catch {
    return null;
  }
}

module.exports = function logger() {
  return async function (req, res, next) {
    const originalPath = (req.originalUrl || "").split("?")[0] || "/";
    const method = (req.method || "GET").toUpperCase();
    const isApi = originalPath.startsWith("/api/");
    const isLogEndpoint = originalPath.startsWith("/api/admin/logs");
    const isSignificant =
      method !== "GET" ||
      /\/api\/(auth|vote|profile|admin|chat|upload|users|period|session|candidate|logs)/i.test(originalPath);

    if (!isApi || isLogEndpoint || !isSignificant) {
      return next();
    }

    const started = Date.now();
    res.on("finish", async () => {
      try {
        const path = req.originalUrl.slice(0, 500);
        const userId = req.user?.id || null;
        const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().slice(0, 120);
        const ua = (req.headers["user-agent"] || "").slice(0, 1000);
        const ref = (req.headers.referer || req.headers.referrer || "").slice(0, 1000);
        const geo = ip ? geoip.lookup(ip) : null;
        const country = geo?.country || null;
        const city = Array.isArray(geo?.city) ? geo.city.join(" ") : (geo?.city || null);
        const durationMs = Math.max(0, Date.now() - started);
        const statusCode = res.statusCode || null;
        const queryParams = compactJson(req.query);
        const bodyParams = compactJson(req.body);
        await q(
          `INSERT INTO RequestLogs (method,path,userId,ip,statusCode,durationMs,queryParams,bodyParams,country,city,userAgent,referer)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [method, path, userId, ip, statusCode, durationMs, queryParams, bodyParams, country, city, ua, ref]
        );
      } catch (err) {
        console.error("request-log:insert", err?.message || err);
      }
    });
    next();
  };
};
