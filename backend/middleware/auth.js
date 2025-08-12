// backend/middleware/auth.js
const jwt = require("jsonwebtoken");
module.exports = function auth(req, res, next) {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { id,email,username }
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};
