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

app.use(cors({
  origin(origin, cb) { if (!origin || allowedOrigins.includes(origin)) return cb(null, true); cb(new Error("CORS blocked"), false); },
  methods: ["GET","POST","PUT","DELETE","OPTIONS"], credentials: true
}));
app.disable("x-powered-by");
app.use(express.json());

app.get("/api", (_req,res)=>res.json({ok:true, service:"voting-backend"}));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/vote", require("./routes/vote"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/public", require("./routes/public"));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: allowedOrigins, methods: ["GET","POST"] } });
const emitUpdate = (eventName, data) => io.emit(eventName, data || {});
app.set("socketio", io);
app.set("emitUpdate", emitUpdate);

getDbPool().then(() => {
  const HOST = process.env.HOST || "0.0.0.0";
  const PORT = Number(process.env.PORT || 5000);
  server.listen(PORT, HOST, () => console.log(`API on http://${HOST}:${PORT}`));
});
