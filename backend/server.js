// backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { getDbPool } = require("./db");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(/[,\s]+/)
  .map((x) => x.trim())
  .filter(Boolean);
if (allowedOrigins.length === 0) {
  allowedOrigins.push("http://localhost:3000", "https://vote.techanalytics.org");
}

app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin) return cb(null, true);
      if (!allowedOrigins.includes(origin)) {
        return cb(new Error("Not allowed by CORS"), false);
      }
      return cb(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: false,
  })
);

app.disable("x-powered-by");
app.use(express.json());

// Health/root
app.get("/api", (_req, res) => res.status(200).json({ ok: true, service: "voting-backend" }));

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/vote", require("./routes/vote"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/public", require("./routes/public"));
app.use("/api/user", require("./routes/user")); // <-- NEW

// Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"] },
});
const emitUpdate = (eventName, data) => io.emit(eventName, data || {});
app.set("socketio", io);
app.set("emitUpdate", emitUpdate);

// Start
getDbPool().then(() => {
  const HOST = process.env.HOST || "0.0.0.0";
  const PORT = Number(process.env.PORT || 5000);
  server.listen(PORT, HOST, () => console.log(`Server running on http://${HOST}:${PORT}`));
});
