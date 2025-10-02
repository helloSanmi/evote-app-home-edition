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

const app = express();
app.disable("x-powered-by");

// Security & compression
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(cookieParser());

// CORS (front on :3000 by default; supports comma-separated origins)
const ORIGINS = (process.env.CORS_ORIGINS)
  .split(",").map(s => s.trim());
app.use(cors({ origin: ORIGINS, credentials: true }));

app.use(bodyParser.json({ limit: "2mb" }));
app.use(bodyParser.urlencoded({ extended: false }));

// Attach user (non-blocking) + request logger
const { attachUserIfAny } = require("./middleware/auth");
app.use(attachUserIfAny);
app.use(require("./middleware/logger")());

// Ensure & serve uploads
const uploadsRoot = path.join(__dirname, "uploads");
fs.mkdirSync(path.join(uploadsRoot, "avatars"), { recursive: true });
fs.mkdirSync(path.join(uploadsRoot, "candidates"), { recursive: true });
app.use("/uploads", express.static(uploadsRoot));

// Health
app.get("/api", (_req, res) => res.json({ ok: true, service: "voting-backend" }));

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/public", require("./routes/public"));
app.use("/api/vote", require("./routes/vote"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/profile", require("./routes/profile"));  // profile endpoints

// Socket.IO
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, { cors: { origin: ORIGINS, credentials: true }});
app.set("io", io);

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 5050);
server.listen(PORT, HOST, () => console.log(`Server running on http://${HOST}:${PORT}`));
