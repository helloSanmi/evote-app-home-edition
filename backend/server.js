// backend/server.js
require("dotenv").config();
const express = require("express");
const compression = require("compression");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");

const app = express();
app.disable("x-powered-by");

// Security & compression
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false
  })
);
app.use(compression());
app.use(cookieParser());

// CORS (supports comma-separated origins). If not set, default to "*".
const ORIGINS = String(process.env.CORS_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: ORIGINS.includes("*")
      ? true
      : (origin, cb) => (!origin || ORIGINS.includes(origin) ? cb(null, true) : cb(new Error("CORS blocked"), false)),
    credentials: true
  })
);

app.use(bodyParser.json({ limit: "2mb" }));
app.use(bodyParser.urlencoded({ extended: false }));

// --- Your middleware
const { attachUserIfAny } = require("./middleware/auth");
app.use(attachUserIfAny);
app.use(require("./middleware/logger")());

// ---------------------------------------------
// Uploads: never crash; fallback to /tmp/uploads
// ---------------------------------------------
function safeMkdir(p) {
  try {
    fs.mkdirSync(p, { recursive: true });
    return true;
  } catch (e) {
    console.warn(`safeMkdir warn for "${p}": ${e.code || e.message}`);
    return false;
  }
}

const configuredUploads = process.env.UPLOADS_DIR;
let uploadsRoot = configuredUploads || path.join(__dirname, "uploads");

// Try local/repo path first; if not writable (Vercel read-only), fallback to /tmp/uploads
if (!safeMkdir(uploadsRoot)) {
  uploadsRoot = path.join("/tmp", "uploads");
  safeMkdir(uploadsRoot);
}

// Create subdirs (ignore failures)
for (const sub of ["avatars", "candidates"]) {
  safeMkdir(path.join(uploadsRoot, sub));
}

// Serve static uploads (even if empty)
app.use("/uploads", express.static(uploadsRoot));

// ---------------------------------------------
// Health
// ---------------------------------------------
app.get("/api", (_req, res) => res.json({ ok: true, service: "voting-backend" }));

// ---------------------------------------------
// Routes
// ---------------------------------------------
app.use("/api/auth", require("./routes/auth"));
app.use("/api/public", require("./routes/public"));
app.use("/api/vote", require("./routes/vote"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/profile", require("./routes/profile"));

// ---------------------------------------------
// Socket.IO (local dev only)
// ---------------------------------------------
const isServerless =
  !!process.env.VERCEL ||
  !!process.env.LAMBDA_TASK_ROOT ||
  !!process.env.AWS_REGION ||
  !!process.env.NOW_REGION;

if (!isServerless && process.env.LOCAL_LISTEN === "true") {
  const http = require("http");
  const { Server } = require("socket.io");
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: ORIGINS.includes("*") ? true : ORIGINS, credentials: true }
  });
  app.set("io", io);

  const HOST = process.env.HOST || "0.0.0.0";
  const PORT = Number(process.env.PORT || 5050);
  server.listen(PORT, HOST, () => console.log(`Local server running on http://${HOST}:${PORT}`));
} else {
  // No-op shim on Vercel
  const noop = () => {};
  app.set("io", { emit: noop, to: () => ({ emit: noop }), on: noop });
}

module.exports = app;
