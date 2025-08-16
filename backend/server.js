// backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { getDbPool } = require("./db");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const allowedOrigins = (process.env.CORS_ORIGINS || "https://vote.techanalytics.org,http://localhost:3000")
  .split(",").map(s => s.trim());

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error("CORS blocked"), false);
      },
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
    })
  );
  
  app.disable("x-powered-by");
  app.use(express.json());

app.get("/api", (_req,res)=>res.json({ok:true, service:"voting-backend"}));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/vote", require("./routes/vote"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/public", require("./routes/public"));

// Error fallback so we never leak 500 without message
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});


const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"] },
});
// expose for other modules if needed
app.set("socketio", io);
app.set("emitUpdate", (event, data) => io.emit(event, data || {}));

getDbPool()
  .then(() => {
    const HOST = process.env.HOST || "0.0.0.0";
    const PORT = Number(process.env.PORT || 5050); // 👈 default 5050
    server.listen(PORT, HOST, () =>
      console.log(`Server running on http://${HOST}:${PORT}`)
    );
  })
  .catch((e) => {
    console.error("DB init failed:", e);
    process.exit(1);
  });