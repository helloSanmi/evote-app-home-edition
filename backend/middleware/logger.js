const geoip = require("geoip-lite");
const { q } = require("../db");

module.exports = function logger() {
  return async function (req, res, next) {
    const started = Date.now();
    res.on("finish", async () => {
      try {
        // basic scrubbing
        const method = req.method;
        const path = req.originalUrl.slice(0, 500);
        const userId = req.user?.id || null;
        const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().slice(0, 120);
        const ua = (req.headers["user-agent"] || "").slice(0, 1000);
        const ref = (req.headers.referer || req.headers.referrer || "").slice(0, 1000);
        const geo = ip ? geoip.lookup(ip) : null;
        const country = geo?.country || null;
        const city = Array.isArray(geo?.city) ? geo.city.join(" ") : (geo?.city || null);
        await q(
          `INSERT INTO RequestLogs (method,path,userId,ip,country,city,userAgent,referer) VALUES (?,?,?,?,?,?,?,?)`,
          [method, path, userId, ip, country, city, ua, ref]
        );
      } catch {}
    });
    next();
  };
};
