const mysql = require("mysql2/promise");

let pool;

function normalizeParam(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date && Number.isFinite(value.getTime?.())) return value;
  return value ?? null;
}

function getDbPool() {
  if (pool) return pool;
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_MAX || 10),
    queueLimit: 0,
    timezone: "Z",
    multipleStatements: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
  return pool;
}

async function q(text, params = []) {
  const pool = getDbPool();
  const normalized = params.map(normalizeParam);
  const [rows, fields] = await pool.execute(text, normalized);
  return [rows, fields];
}

async function one(text, params = []) {
  const [rows] = await q(text, params);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function getConn() {
  const pool = getDbPool();
  return pool.getConnection();
}

module.exports = { getDbPool, q, one, getConn };
