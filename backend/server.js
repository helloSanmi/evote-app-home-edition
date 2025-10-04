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
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.disable("x-powered-by");

// ------------ Security & compression ------------
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false
  })
);
app.use(compression());
app.use(cookieParser());

// ------------ CORS (comma-separated origins or "*") ------------
const ORIGINS = String(process.env.CORS_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: ORIGINS.includes("*")
      ? true
      : (origin, cb) =>
          !origin || ORIGINS.includes(origin) ? cb(null, true) : cb(new Error("CORS blocked"), false),
    credentials: true
  })
);

app.use(bodyParser.json({ limit: "5mb" }));
app.use(bodyParser.urlencoded({ extended: false }));

// ------------ Your middleware ------------
const { attachUserIfAny } = require("./middleware/auth");
app.use(attachUserIfAny);
app.use(require("./middleware/logger")());

// ------------ Uploads: Azure-friendly persistent path ------------
/*
  Azure App Service (Linux) has a persistent writable area under /home
  Use /home/site/wwwroot/uploads in Azure; use ./uploads locally.
  You can override via UPLOADS_DIR env var.
*/
const isAzure =
  !!process.env.WEBSITE_INSTANCE_ID ||
  !!process.env.WEBSITE_SITE_NAME ||
  (process.env.HOME && process.env.HOME.startsWith("/home"));

let uploadsRoot =
  (process.env.UPLOADS_DIR && process.env.UPLOADS_DIR.trim()) ||
  (isAzure ? "/home/site/wwwroot/uploads" : path.join(__dirname, "uploads"));

function safeMkdir(p) {
  try {
    fs.mkdirSync(p, { recursive: true });
    return true;
  } catch (e) {
    console.warn(`safeMkdir warn for "${p}": ${e.code || e.message}`);
    return false;
  }
}

safeMkdir(uploadsRoot);
for (const sub of ["avatars", "candidates"]) safeMkdir(path.join(uploadsRoot, sub));

// Serve static files from uploads
app.use("/uploads", express.static(uploadsRoot));

// ------------ Home + favicon (Option A) ------------
app.get("/", (_req, res) => {
  res
    .status(200)
    .send(
      `<pre>✅ Voting backend is running.

Useful links:
- Health:           /api
- Uploads (static): /uploads

This backend serves APIs only. The frontend is hosted separately.
</pre>`
    );
});

// Silence noisy favicon requests (avoid 404s in logs)
app.get("/favicon.ico", (_req, res) => res.status(204).end());

// ------------ Health/debug ------------
app.get("/api", (_req, res) => res.json({ ok: true, service: "voting-backend" }));
app.get("/api/__debug_uploads", (_req, res) =>
  res.json({ uploadsRoot, isAzure, home: process.env.HOME || null })
);

// ------------ Routes ------------
app.use("/api/auth", require("./routes/auth"));
app.use("/api/public", require("./routes/public"));
app.use("/api/vote", require("./routes/vote"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/profile", require("./routes/profile"));

// ------------ HTTP server + Socket.IO (Azure & local) ------------
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ORIGINS.includes("*") ? true : ORIGINS, credentials: true }
});
app.set("io", io);

// (Optional) example socket hooks
// io.on("connection", (socket) => {
//   console.log("socket connected", socket.id);
//   socket.on("disconnect", () => console.log("socket disconnected", socket.id));
// });

const PORT = Number(process.env.PORT || 5050); // Azure sets PORT automatically
const HOST = process.env.HOST || "0.0.0.0";
server.listen(PORT, HOST, () => {
  console.log(`Backend listening on http://${HOST}:${PORT}  (uploads: ${uploadsRoot})`);
});
