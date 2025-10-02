const jwt = require("jsonwebtoken");

const toList = (s) => (s || "").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
const ADMIN_USERNAMES = new Set(toList(process.env.ADMIN_USERNAMES));
const ADMIN_EMAILS    = new Set(toList(process.env.ADMIN_EMAILS));

function decodeAuth(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)/i.exec(h);
  return m ? m[1] : null;
}

exports.attachUserIfAny = (req, _res, next) => {
  try {
    const tok = decodeAuth(req);
    if (!tok) return next();
    const u = jwt.verify(tok, process.env.JWT_SECRET);
    req.user = { id: u.id, username: u.username, email: u.email };
  } catch {}
  next();
};

exports.requireAuth = (req, res, next) => {
  const tok = decodeAuth(req);
  if (!tok) return res.status(401).json({ error: "UNAUTHORIZED" });
  try {
    const u = jwt.verify(tok, process.env.JWT_SECRET);
    req.user = { id: u.id, username: u.username, email: u.email };
    next();
  } catch {
    res.status(401).json({ error: "UNAUTHORIZED" });
  }
};

exports.requireAdmin = (req, res, next) => {
  const u = req.user || {};
  const ok = (u.username && ADMIN_USERNAMES.has(u.username.toLowerCase()))
          || (u.email && ADMIN_EMAILS.has(u.email.toLowerCase()));
  if (!ok) return res.status(403).json({ error: "FORBIDDEN" });
  next();
};
