// backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { getDbPool } = require("./db");
const logger = require("./middleware/logger");

const app = express();
app.set("trust proxy", true);

const allowedOrigins = [
  "https://vote.techanalytics.org",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin) return cb(null, true);
      if (!allowedOrigins.includes(origin)) {
        return cb(new Error("Blocked by CORS"), false);
      }
      cb(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

app.disable("x-powered-by");
app.use(express.json({ limit: "10mb" }));
app.use(logger);

// Serve uploaded images directly (makes <img src="/uploads/xyz.png"> work too)
app.use("/uploads", express.static(path.join(__dirname, "uploads"), { maxAge: "7d" }));

app.get("/api", (_req, res) => res.json({ ok: true, service: "voting-backend" }));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/vote", require("./routes/vote"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/public", require("./routes/public"));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: allowedOrigins, methods: ["GET", "POST"] } });

const emitUpdate = (eventName, data) => io.emit(eventName, data || {});
app.set("socketio", io);
app.set("emitUpdate", emitUpdate);

getDbPool().then(() => {
  const HOST = process.env.HOST || "0.0.0.0";
  const PORT = process.env.PORT || 5050;
  server.listen(PORT, HOST, () => console.log(`Server running on http://${HOST}:${PORT}`));
});
