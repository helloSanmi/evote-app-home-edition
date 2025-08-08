// backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { getDbPool } = require("./db");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

// Allow requests from any origin (use a more restrictive setup in production)
app.use(cors({ 
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}));

app.use(express.json());

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/vote", require("./routes/vote"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/public", require("./routes/public"));

// Create server and Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Emit updates
const emitUpdate = (eventName, data) => {
  io.emit(eventName, data || {});
};
app.set("socketio", io);
app.set("emitUpdate", emitUpdate);

// Listen on HOST and PORT from environment variables
getDbPool().then(() => {
  const HOST = process.env.HOST;
  const PORT = process.env.PORT;
  server.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
});
