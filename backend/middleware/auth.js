const jwt = require("jsonwebtoken");

const toList = (s) => (s || "").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
const ADMIN_USERNAMES = new Set(toList(process.env.ADMIN_USERNAMES));
const ADMIN_EMAILS = new Set(toList(process.env.ADMIN_EMAILS));

function decodeAuth(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)/i.exec(h);
  return m ? m[1] : null;
}

const resolveRole = (payload) => {
  const username = (payload?.username || "").toLowerCase();
  const email = (payload?.email || "").toLowerCase();
  if (ADMIN_USERNAMES.has(username) || ADMIN_EMAILS.has(email)) return "super-admin";
  const role = (payload?.role || "").toLowerCase();
  if (role === "super-admin" || role === "admin" || role === "user") return role;
  if (payload?.isAdmin) return "admin";
  return "user";
};

exports.attachUserIfAny = (req, _res, next) => {
  try {
    const tok = decodeAuth(req);
    if (!tok) return next();
    const u = jwt.verify(tok, process.env.JWT_SECRET);
    req.user = { id: u.id, username: u.username, email: u.email, role: resolveRole(u) };
  } catch {}
  next();
};

exports.requireAuth = (req, res, next) => {
  const tok = decodeAuth(req);
  if (!tok) return res.status(401).json({ error: "UNAUTHORIZED" });
  try {
    const u = jwt.verify(tok, process.env.JWT_SECRET);
    req.user = { id: u.id, username: u.username, email: u.email, role: resolveRole(u) };
    next();
  } catch (err) {
    res.status(401).json({ error: "UNAUTHORIZED" });
  }
};

const hasRole = (req, allowedRoles = []) => {
  const role = (req.user?.role || "").toLowerCase();
  if (allowedRoles.includes(role)) return true;
  if (!role) {
    const username = (req.user?.username || "").toLowerCase();
    const email = (req.user?.email || "").toLowerCase();
    if (ADMIN_USERNAMES.has(username) || ADMIN_EMAILS.has(email)) return allowedRoles.includes("super-admin");
  }
  return false;
};

exports.requireRole = (roles) => (req, res, next) => {
  if (!Array.isArray(roles) || roles.length === 0) return next();
  if (!req.user) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (!hasRole(req, roles.map((r) => r.toLowerCase()))) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
    next();
};

exports.requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (hasRole(req, ["super-admin", "admin"])) return next();
  return res.status(403).json({ error: "FORBIDDEN" });
};
