require("dotenv").config();
const express = require("express");
const compression = require("compression");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");

// --- App setup (exported for serverless) ---
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
const ORIGINS = (process.env.CORS_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: ORIGINS.includes("*")
      ? true
      : function (origin, cb) {
          if (!origin || ORIGINS.includes(origin)) return cb(null, true);
          return cb(new Error("CORS blocked"), false);
        },
    credentials: true
  })
);

app.use(bodyParser.json({ limit: "2mb" }));
app.use(bodyParser.urlencoded({ extended: false }));

// Attach user (non-blocking) + request logger
const { attachUserIfAny } = require("./middleware/auth");
app.use(attachUserIfAny);
app.use(require("./middleware/logger")());

// ---------- Uploads (read-only on Vercel) ----------
const isVercel = Boolean(process.env.VERCEL);
const uploadsRoot = isVercel ? path.join("/tmp", "uploads") : path.join(__dirname, "uploads");
try {
  fs.mkdirSync(path.join(uploadsRoot, "avatars"), { recursive: true });
  fs.mkdirSync(path.join(uploadsRoot, "candidates"), { recursive: true });
} catch (e) {}
app.use("/uploads", express.static(uploadsRoot));

// ---------- Health ----------
app.get("/api", (_req, res) => res.json({ ok: true, service: "voting-backend" }));

// ---------- Routes ----------
app.use("/api/auth", require("./routes/auth"));
app.use("/api/public", require("./routes/public"));
app.use("/api/vote", require("./routes/vote"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/profile", require("./routes/profile"));

// ---------- Socket.IO (local dev only) ----------
if (!isVercel && process.env.LOCAL_LISTEN === "true") {
  const http = require("http");
  const server = http.createServer(app);
  const { Server } = require("socket.io");
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
  const noop = () => {};
  const ioShim = { emit: noop, to: () => ({ emit: noop }), on: noop };
  app.set("io", ioShim);
}

module.exports = app;
