require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { getDbPool } = require("./db");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

// Set the allowed origin for CORS in production
const allowedOrigins = ["https://vote.techanalytics.org"];

// Use a more restrictive CORS policy for production
app.use(cors({ 
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}));

// Remove the X-Powered-By header for security
app.disable('x-powered-by');

app.use(express.json());

// Add a root API route to handle GET requests to /api
app.get("/api", (req, res) => {
  res.status(200).json({ message: "Welcome to the Voting App API!" });
});

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/vote", require("./routes/vote"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/public", require("./routes/public"));

// Create server and Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
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