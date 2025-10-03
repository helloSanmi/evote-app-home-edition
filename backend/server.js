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

// ---------------------------------------------
// App setup
// ---------------------------------------------
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
      : function (origin, cb) {
          // allow no-origin (server-to-server, curl, Postman) or listed origins
          if (!origin || ORIGINS.includes(origin)) return cb(null, true);
          return cb(new Error("CORS blocked"), false);
        },
    credentials: true
  })
);

app.use(bodyParser.json({ limit: "2mb" }));
app.use(bodyParser.urlencoded({ extended: false }));

// ---------------------------------------------
// Middleware (your existing ones)
// ---------------------------------------------
const { attachUserIfAny } = require("./middleware/auth");
app.use(attachUserIfAny);
app.use(require("./middleware/logger")());

// ---------------------------------------------
// Uploads (safe for Vercel)
// ---------------------------------------------
const isServerless =
  !!process.env.VERCEL ||
  !!process.env.LAMBDA_TASK_ROOT ||
  !!process.env.AWS_REGION ||
  !!process.env.NOW_REGION;

const configuredUploads = process.env.UPLOADS_DIR;

// On serverless: /tmp/uploads (ephemeral). Locally: ./uploads
const uploadsRoot = configuredUploads
  ? configuredUploads
  : isServerless
  ? path.join("/tmp", "uploads")
  : path.join(__dirname, "uploads");

// Try to create folders but never crash if read-only
try {
  if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });
  for (const sub of ["avatars", "candidates"]) {
    const p = path.join(uploadsRoot, sub);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }
} catch (e) {
  console.warn("Uploads directory not writable; continuing without creating dirs:", e.message);
}

// Serve static uploads (works even if empty)
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
  server.listen(PORT, HOST, () =>
    console.log(`Local server running on http://${HOST}:${PORT}`)
  );
} else {
  // No-op shim on Vercel to avoid crashes where code expects io
  const noop = () => {};
  app.set("io", { emit: noop, to: () => ({ emit: noop }), on: noop });
}

// ---------------------------------------------
// Export for serverless handler
// ---------------------------------------------
module.exports = app;
