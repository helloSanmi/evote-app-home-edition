// backend/middleware/auth.js
const jwt = require("jsonwebtoken");
const { getDbPool } = require("../db");

/**
 * Auth: verifies JWT and attaches req.user = { id, userId, username, email, isAdmin? }
 */
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: payload.userId ?? payload.id,
      userId: payload.userId ?? payload.id,
      username: payload.username || null,
      email: payload.email || null,
      isAdmin: !!payload.isAdmin,
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

/**
 * Build normalized admin allowlist from ADMIN_USERNAMES (comma-separated)
 */
function adminList() {
  return String(process.env.ADMIN_USERNAMES || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Admin gate:
 * - Checks token username/email against ADMIN_USERNAMES
 * - If missing in token, fetches from DB by userId
 */
async function requireAdmin(req, res, next) {
  try {
    const list = adminList();
    if (list.length === 0) {
      return res.status(403).json({ error: "Forbidden (admin only)" });
    }

    const handles = [];
    if (req.user?.username) handles.push(req.user.username.toLowerCase());
    if (req.user?.email) handles.push(req.user.email.toLowerCase());

    if (handles.length === 0 && req.user?.id) {
      try {
        const pool = await getDbPool();
        const [[u]] = await pool.query(
          "SELECT username, email FROM Users WHERE id = ?",
          [req.user.id]
        );
        if (u) {
          if (u.username) handles.push(String(u.username).toLowerCase());
          if (u.email) handles.push(String(u.email).toLowerCase());
        }
      } catch {
        // ignore db fallback errors; we'll just deny if no match
      }
    }

    const ok = handles.some((h) => list.includes(h));
    if (!ok) return res.status(403).json({ error: "Forbidden (admin only)" });

    return next();
  } catch {
    return res.status(403).json({ error: "Forbidden (admin only)" });
  }
}

module.exports = { requireAuth, requireAdmin };
