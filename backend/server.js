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

// CORS
const ORIGINS = String(process.env.CORS_ORIGINS || "*")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: ORIGINS.includes("*")
    ? true
    : (origin, cb) => (!origin || ORIGINS.includes(origin) ? cb(null, true) : cb(new Error("CORS blocked"), false)),
  credentials: true
}));

app.use(bodyParser.json({ limit: "2mb" }));
app.use(bodyParser.urlencoded({ extended: false }));

// Middleware
const { attachUserIfAny } = require("./middleware/auth");
app.use(attachUserIfAny);
app.use(require("./middleware/logger")());

// ---------- Uploads (Vercel-safe) ----------
const isServerless =
  !!process.env.VERCEL ||
  !!process.env.LAMBDA_TASK_ROOT ||
  !!process.env.AWS_REGION ||
  !!process.env.NOW_REGION;

// Prefer explicit env override
const configuredUploads = process.env.UPLOADS_DIR && process.env.UPLOADS_DIR.trim();

// On serverless: /tmp/uploads (ephemeral). Locally: ./uploads
let uploadsRoot = configuredUploads
  ? configuredUploads
  : isServerless
  ? path.join("/tmp", "uploads")
  : path.join(__dirname, "uploads");

// helper that never throws; also blocks /var/task
function safeMkdir(p) {
  try {
    if (p.startsWith("/var/task")) return false; // never try to write in bundle
    fs.mkdirSync(p, { recursive: true });
    return true;
  } catch (e) {
    console.warn(`safeMkdir warn for "${p}": ${e.code || e.message}`);
    return false;
  }
}

// ensure base (try chosen, fallback to /tmp)
if (!safeMkdir(uploadsRoot)) {
  uploadsRoot = path.join("/tmp", "uploads");
  safeMkdir(uploadsRoot);
}
// ensure subdirs (ignore failures)
for (const sub of ["avatars", "candidates"]) {
  safeMkdir(path.join(uploadsRoot, sub));
}

// mount static (works even if empty)
app.use("/uploads", express.static(uploadsRoot));

// ---------- Health & debug ----------
app.get("/api", (_req, res) => res.json({ ok: true, service: "voting-backend" }));
app.get("/api/__debug_uploads", (_req, res) =>
  res.json({
    isServerless,
    uploadsRoot,
    configuredUploads: configuredUploads || null,
    vercel: !!process.env.VERCEL
  })
);

// ---------- Routes ----------
app.use("/api/auth", require("./routes/auth"));
app.use("/api/public", require("./routes/public"));
app.use("/api/vote", require("./routes/vote"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/profile", require("./routes/profile"));

// ---------- Socket.IO (local only) ----------
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
  const noop = () => {};
  app.set("io", { emit: noop, to: () => ({ emit: noop }), on: noop });
}

module.exports = app;
