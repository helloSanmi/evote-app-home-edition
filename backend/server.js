require("dotenv").config();
const express = require("express");
const compression = require("compression");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const http = require("http");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

// Security & compression
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(cookieParser());

// CORS (front on :3000 by default; supports comma-separated origins)
const ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: ORIGINS, credentials: true }));

app.use(bodyParser.json({ limit: "2mb" }));
app.use(bodyParser.urlencoded({ extended: false }));

// Attach user (non-blocking) + request logger
const { attachUserIfAny } = require("./middleware/auth");
app.use(attachUserIfAny);
app.use(require("./middleware/logger")());

// Ensure & serve uploads
const objectStorage = require("./services/objectStorage");
const { uploadRoot, ensureDirSync, getSignedUrl } = require("./utils/uploads");
ensureDirSync("avatars");
ensureDirSync("candidates");
ensureDirSync("profile");
if (objectStorage.isConfigured()) {
  const handleUploadsProxy = async (req, res, next) => {
    const wildcard = req.params[0];
    if (!wildcard) return next();
    try {
      const signed = await getSignedUrl(wildcard);
      if (signed) {
        res.set("Cache-Control", "private, max-age=30");
        if (req.method === "HEAD") {
          res.set("Location", signed);
          return res.status(307).end();
        }
        return res.redirect(307, signed);
      }
    } catch (err) {
      console.error("[uploads] proxy failed:", err?.message || err);
    }
    return next();
  };
  app.get("/uploads/*", handleUploadsProxy);
  app.head("/uploads/*", handleUploadsProxy);
}
app.use("/uploads", express.static(uploadRoot));

// Health
app.get("/api", (_req, res) => res.json({ ok: true, service: "voting-backend" }));

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/public", require("./routes/public"));
app.use("/api/vote", require("./routes/vote"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/profile", require("./routes/profile"));  // profile endpoints
app.use("/api/chat", require("./routes/chat"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/privacy", require("./routes/privacy"));
app.use("/api/verification", require("./routes/verification"));

// Socket.IO
const server = http.createServer(app);
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const io = new Server(server, { cors: { origin: ORIGINS, credentials: true }});
app.set("io", io);

io.on("connection", (socket) => {
  socket.on("identify", (payload = {}) => {
    const token = typeof payload === "string" ? payload : payload.token;
    if (!token) return;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded?.id) return;
      socket.data.userId = decoded.id;
      socket.data.role = (payload.role || decoded.role || "user").toLowerCase();
      socket.join(`user:${decoded.id}`);
    } catch (err) {
      socket.emit("auth-error", { message: "Invalid token" });
    }
  });

  socket.on("chat:join", ({ sessionId }) => {
    if (!sessionId) return;
    socket.join(`chat:${sessionId}`);
  });
});

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 5050);
const { ensureSchema } = require("./dbMigrations");
const { startDataGovernanceScheduler } = require("./utils/retention");
const { startNotificationScheduler } = require("./utils/sessionEmailScheduler");

async function start() {
  try {
    await ensureSchema();
    server.listen(PORT, HOST, () => console.log(`Server running on http://${HOST}:${PORT}`));
    startDataGovernanceScheduler();
    startNotificationScheduler();
  } catch (err) {
    console.error("Failed to prepare database schema:", err);
    process.exit(1);
  }
}

start();
