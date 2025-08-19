// backend/middleware/auth.js
const jwt = require("jsonwebtoken");

/**
 * Parse "ADMIN_USERS" (comma-separated usernames or emails).
 * Example: ADMIN_USERS="admin, root, boss@mail.com"
 */
function getEnvAdmins() {
  return (process.env.ADMIN_USERS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isListedAdmin(user) {
  if (!user) return false;
  const list = getEnvAdmins();
  const uname = (user.username || "").toLowerCase();
  const email = (user.email || "").toLowerCase();
  return list.includes(uname) || list.includes(email);
}

/**
 * requireAuth — verifies JWT and sets req.user
 * Accepts: Authorization: Bearer <token>
 * Token payload should at least include: { id, username, email, isAdmin? }
 */
function requireAuth(req, res, next) {
  try {
    const hdr = req.headers.authorization || "";
    const parts = hdr.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const token = parts[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // normalize user obj on req
    req.user = {
      id: payload.id,
      username: payload.username,
      email: payload.email,
      // honor token flag OR env list
      isAdmin: !!payload.isAdmin || isListedAdmin(payload),
    };
    return next();
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

/**
 * requireAdmin — must be authed AND admin.
 * Uses req.user.isAdmin set by requireAuth (token flag or env list).
 */
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  if (!req.user.isAdmin) return res.status(403).json({ error: "Forbidden" });
  return next();
}

module.exports = {
  requireAuth,
  requireAdmin,
};
