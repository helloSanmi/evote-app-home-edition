// backend/db.js
const mysql = require("mysql2/promise");
let pool;
async function getDbPool() {
  if (pool) return pool;
  pool = await mysql.createPool({
    host: process.env.DB_HOST,                 // <-- external Ubuntu MySQL host/IP
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 15,
    queueLimit: 0,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
    
  });
  // sanity ping
  await pool.query("SELECT 1");
  return pool;
}
module.exports = { getDbPool };
